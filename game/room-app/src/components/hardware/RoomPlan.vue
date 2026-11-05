<template>
  <div
    ref="floor"
    class="plan"
    role="group"
    :aria-label="$t('hardware.plan.room')"
    data-test="room-plan"
  >
    <div
      v-for="item in items"
      :key="item.key"
      class="item"
      :class="`item--${item.target.kind}`"
      :style="{ left: toPercent(item.point.x), top: toPercent(item.point.y) }"
      role="button"
      tabindex="0"
      :aria-roledescription="$t('hardware.plan.draggable')"
      :aria-label="ariaLabel(item)"
      :title="item.label"
      :data-test="`plan-${item.key}`"
      @pointerdown="onPointerDown($event, item)"
      @pointermove="onPointerMove($event, item)"
      @pointerup="onPointerUp($event, item)"
      @pointercancel="cancelDrag"
      @lostpointercapture="cancelDrag"
      @keydown="onKeyDown($event, item)"
      @keyup="onKeyUp"
    >
      <BuzzerSquare
        v-if="item.target.kind === 'desk'"
        :layout="config.buzzers.layout"
        style="--square-size: 44px"
      />
      <span v-else-if="item.target.kind === 'fixture'" class="item__dot" />
      <span class="item__label">{{ item.label }}</span>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>

<script setup lang="ts">
import {
  type Desk,
  desksForCount,
  type PlanPoint,
  type PlanTarget,
  resolveRoomPlan,
  type RoomHardwareConfig,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import BuzzerSquare from '@/components/hardware/BuzzerSquare.vue'

type PlanItem = { key: string; label: string; target: PlanTarget; point: PlanPoint }

/** Pas des flèches (Maj : cinq fois plus), en fraction de la salle. */
const STEP = 0.02
const ARROWS = new Map<string, [number, number]>([
  ['ArrowLeft', [-1, 0]],
  ['ArrowRight', [1, 0]],
  ['ArrowUp', [0, -1]],
  ['ArrowDown', [0, 1]],
])
/** Marge intérieure du plan : un élément en bordure (0 ou 1) reste entièrement visible. */
const MARGIN = 0.05
/** Distance (px) à partir de laquelle un appui devient un glisser ; en dessous, c'est un clic. */
const DRAG_THRESHOLD = 4
/** Pause (ms) après la dernière flèche avant d'enregistrer, si la touche n'est pas relâchée. */
const KEY_COMMIT_DELAY = 300

const props = defineProps<{ config: RoomHardwareConfig }>()
const emit = defineEmits<{ move: [target: PlanTarget, point: PlanPoint] }>()

const { t } = useI18n()
const floor = ref<HTMLElement | null>(null)
/** Position affichée pendant un glisser ou une rafale de flèches, avant enregistrement. */
const preview = ref<PlanItem | null>(null)
const announcement = ref('')
/** Glisser en cours (un seul pointeur à la fois) ; pas besoin de réactivité. */
let session: { key: string; pointerId: number; x: number; y: number; moved: boolean } | null = null
let keyTimer: ReturnType<typeof setTimeout> | undefined

const items = computed<PlanItem[]>(() => {
  const { fixtures } = props.config.lighting
  const plan = resolveRoomPlan(
    props.config.plan,
    props.config.desksCount,
    fixtures.map(({ id, desk }) => ({ id, desk }))
  )
  const list: PlanItem[] = [
    {
      key: 'screen',
      label: t('hardware.plan.screen'),
      target: { kind: 'screen' },
      point: plan.screen,
    },
    ...desksForCount(props.config.desksCount).map((desk: Desk) => ({
      key: `desk-${desk}`,
      label: t('hardware.plan.desk', { n: desk }),
      target: { kind: 'desk', id: desk } as const,
      point: plan.desks[desk]!,
    })),
    ...fixtures.map((fixture) => ({
      key: `fixture-${fixture.id}`,
      label: fixture.name,
      target: { kind: 'fixture', id: fixture.id } as const,
      point: plan.fixtures[fixture.id]!,
    })),
  ]
  const shown = preview.value
  return list.map((item) => (shown?.key === item.key ? { ...item, point: shown.point } : item))
})

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** Position normalisée (0 à 1) -> pourcentage CSS, en gardant la marge intérieure. */
const toPercent = (value: number) => `${(MARGIN + value * (1 - 2 * MARGIN)) * 100}%`
const fromFraction = (fraction: number) => clamp01((fraction - MARGIN) / (1 - 2 * MARGIN))

const coordinates = (point: PlanPoint) => ({
  x: Math.round(point.x * 100),
  y: Math.round(point.y * 100),
})

function ariaLabel(item: PlanItem): string {
  return t('hardware.plan.item', { label: item.label, ...coordinates(item.point) })
}

function pointFrom(event: PointerEvent): PlanPoint | null {
  const rect = floor.value?.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null
  }
  return {
    x: fromFraction((event.clientX - rect.left) / rect.width),
    y: fromFraction((event.clientY - rect.top) / rect.height),
  }
}

/** Enregistre la position affichée (une seule fois) et l'annonce aux lecteurs d'écran. */
function commit(): void {
  clearTimeout(keyTimer)
  const shown = preview.value
  preview.value = null
  if (shown) {
    emit('move', shown.target, shown.point)
    announcement.value = t('hardware.plan.moved', {
      label: shown.label,
      ...coordinates(shown.point),
    })
  }
}

function onPointerDown(event: PointerEvent, item: PlanItem): void {
  // Bouton principal seulement, et un seul pointeur à la fois.
  if (event.button !== 0 || session) {
    return
  }
  commit()
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  session = {
    key: item.key,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
  }
}

function onPointerMove(event: PointerEvent, item: PlanItem): void {
  if (session?.key !== item.key || session.pointerId !== event.pointerId) {
    return
  }
  if (!session.moved) {
    if (Math.hypot(event.clientX - session.x, event.clientY - session.y) < DRAG_THRESHOLD) {
      return
    }
    session.moved = true
  }
  const point = pointFrom(event)
  if (point) {
    preview.value = { ...item, point }
  }
}

function onPointerUp(event: PointerEvent, item: PlanItem): void {
  if (session?.key !== item.key || session.pointerId !== event.pointerId) {
    return
  }
  const { moved } = session
  session = null
  if (moved) {
    commit()
  } else {
    // Simple clic : rien ne bouge, rien n'est enregistré.
    preview.value = null
  }
}

/** Glisser interrompu (pointeur annulé ou capture perdue) : on revient à la position enregistrée. */
function cancelDrag(): void {
  if (session) {
    session = null
    preview.value = null
  }
}

function onKeyDown(event: KeyboardEvent, item: PlanItem): void {
  const arrow = ARROWS.get(event.key)
  if (!arrow || session) {
    return
  }
  event.preventDefault()
  if (preview.value && preview.value.key !== item.key) {
    commit()
  }
  // La touche maintenue répète : on déplace l'aperçu à chaque pas, on n'enregistre qu'à la fin.
  const step = event.shiftKey ? STEP * 5 : STEP
  preview.value = {
    ...item,
    point: {
      x: clamp01(item.point.x + arrow[0] * step),
      y: clamp01(item.point.y + arrow[1] * step),
    },
  }
  clearTimeout(keyTimer)
  keyTimer = setTimeout(commit, KEY_COMMIT_DELAY)
}

function onKeyUp(event: KeyboardEvent): void {
  if (ARROWS.has(event.key)) {
    commit()
  }
}

onBeforeUnmount(commit)
</script>

<style scoped>
.plan {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  border: 1px solid var(--border-ui);
  background:
    linear-gradient(var(--border-ui) 1px, transparent 1px) 0 0 / 10% 10%,
    linear-gradient(90deg, var(--border-ui) 1px, transparent 1px) 0 0 / 10% 10%,
    var(--surface-0);
  overflow: hidden;
  touch-action: none;
}

.item {
  position: absolute;
  display: grid;
  justify-items: center;
  gap: 4px;
  transform: translate(-50%, -50%);
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.item:active {
  cursor: grabbing;
  z-index: 2;
}

.item:focus-visible {
  outline: 3px solid var(--text-0);
  outline-offset: 4px;
  border-radius: 8px;
  z-index: 2;
}

.item__label {
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-1);
}

.item--screen {
  min-width: 28%;
  padding: 10px 0 6px;
  border-radius: 10px;
  border: 2px solid var(--accent-blue);
  background: var(--bg-card-hi);
}

.item__dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--warn);
  box-shadow: 0 0 14px var(--warn);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
