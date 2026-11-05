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
      :style="{ left: `${item.point.x * 100}%`, top: `${item.point.y * 100}%` }"
      role="button"
      tabindex="0"
      :aria-label="ariaLabel(item)"
      :data-test="`plan-${item.key}`"
      @pointerdown="onPointerDown($event, item)"
      @pointermove="onPointerMove($event, item)"
      @pointerup="onPointerUp(item)"
      @pointercancel="dragging = null"
      @keydown="onKeyDown($event, item)"
    >
      <BuzzerSquare
        v-if="item.target.kind === 'desk'"
        :layout="config.buzzers.layout"
        style="--square-size: 44px"
      />
      <span v-else-if="item.target.kind === 'fixture'" class="item__dot" />
      <span class="item__label">{{ item.label }}</span>
    </div>
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
import { computed, ref } from 'vue'
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

const props = defineProps<{ config: RoomHardwareConfig }>()
const emit = defineEmits<{ move: [target: PlanTarget, point: PlanPoint] }>()

const { t } = useI18n()
const floor = ref<HTMLElement | null>(null)
const dragging = ref<{ key: string; point: PlanPoint } | null>(null)

const items = computed<PlanItem[]>(() => {
  const { fixtures } = props.config.lighting
  const plan = resolveRoomPlan(
    props.config.plan,
    props.config.desksCount,
    fixtures.map((fixture) => fixture.id)
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
  const drag = dragging.value
  return list.map((item) => (drag?.key === item.key ? { ...item, point: drag.point } : item))
})

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function ariaLabel(item: PlanItem): string {
  return t('hardware.plan.item', {
    label: item.label,
    x: Math.round(item.point.x * 100),
    y: Math.round(item.point.y * 100),
  })
}

function pointFrom(event: PointerEvent): PlanPoint | null {
  const rect = floor.value?.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null
  }
  return {
    x: clamp01((event.clientX - rect.left) / rect.width),
    y: clamp01((event.clientY - rect.top) / rect.height),
  }
}

function onPointerDown(event: PointerEvent, item: PlanItem): void {
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  dragging.value = { key: item.key, point: item.point }
}

function onPointerMove(event: PointerEvent, item: PlanItem): void {
  const point = dragging.value?.key === item.key ? pointFrom(event) : null
  if (point) {
    dragging.value = { key: item.key, point }
  }
}

function onPointerUp(item: PlanItem): void {
  const drag = dragging.value
  dragging.value = null
  if (drag?.key === item.key) {
    emit('move', item.target, drag.point)
  }
}

function onKeyDown(event: KeyboardEvent, item: PlanItem): void {
  const arrow = ARROWS.get(event.key)
  if (!arrow) {
    return
  }
  event.preventDefault()
  const step = event.shiftKey ? STEP * 5 : STEP
  emit('move', item.target, {
    x: clamp01(item.point.x + arrow[0] * step),
    y: clamp01(item.point.y + arrow[1] * step),
  })
}
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
  max-width: 120px;
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
</style>
