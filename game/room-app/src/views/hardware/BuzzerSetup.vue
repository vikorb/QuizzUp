<template>
  <section class="hw-panel">
    <header class="hw-panel__head">
      <h2 class="hw-panel__title">{{ $t('hardware.buzzers.title') }}</h2>
      <p class="hw-panel__status">
        {{
          usesSimulationKeys
            ? $t('hardware.buzzers.simulation')
            : $t('hardware.buzzers.learned', { n: learnedCount }, learnedCount)
        }}
      </p>
    </header>

    <p v-if="buzzerState && !buzzerState.active" class="hw-alert" role="alert">
      {{ $t('hardware.buzzers.inactive') }}
    </p>

    <div v-if="learningState" class="learn neon neon--no-hover" data-test="learning">
      <template v-if="learningState.current">
        <p class="learn__step">
          {{
            $t('hardware.buzzers.step', {
              n: learningState.stepIndex + 1,
              total: learningState.totalSteps,
            })
          }}
        </p>
        <p class="learn__prompt" :class="`learn__prompt--${learningState.current.desk}`">
          {{
            $t('hardware.buzzers.prompt', {
              button: learningState.current.button,
              desk: learningState.current.desk,
            })
          }}
        </p>
      </template>
      <p v-else class="learn__prompt">
        {{ $t('hardware.buzzers.done', { n: learnedInSession }, learnedInSession) }}
      </p>

      <p
        v-if="feedback"
        class="learn__feedback"
        :class="{ 'learn__feedback--error': feedback.error }"
        role="status"
      >
        {{ feedback.text }}
      </p>

      <div class="hw-actions">
        <template v-if="learningState.current">
          <UiButton :disabled="learningState.stepIndex === 0" @click="learning?.back()">
            {{ $t('hardware.buzzers.back') }}
          </UiButton>
          <UiButton @click="learning?.skip()">{{ $t('hardware.buzzers.skip') }}</UiButton>
        </template>
        <UiButton v-else variant="primary" :disabled="learnedInSession === 0" @click="onSave">
          {{ $t('hardware.buzzers.save') }}
        </UiButton>
        <UiButton @click="learning?.restart()">{{ $t('hardware.buzzers.restart') }}</UiButton>
        <UiButton variant="danger" @click="stopLearning">
          {{ $t('hardware.buzzers.cancel') }}
        </UiButton>
      </div>
    </div>

    <div v-else class="hw-actions">
      <UiButton variant="primary" @click="startLearning">
        <MdIcon :path="mdiGestureTapButton" :size="18" />
        {{ $t('hardware.buzzers.learn') }}
      </UiButton>
      <UiButton v-if="!usesSimulationKeys" @click="onResetToSimulation">
        {{ $t('hardware.buzzers.resetToSimulation') }}
      </UiButton>
      <p class="hw-hint">{{ $t('hardware.buzzers.learnHint') }}</p>
    </div>

    <p v-if="saved" class="hw-ok" role="status">{{ $t('hardware.buzzers.saved') }}</p>

    <h3 class="hw-panel__subtitle">{{ $t('hardware.buzzers.testTitle') }}</h3>
    <p class="hw-hint">{{ $t('hardware.buzzers.testHint') }}</p>
    <div class="desks">
      <article v-for="desk in DESKS" :key="desk" class="desk-test" :class="`desk-test--${desk}`">
        <header class="desk-test__head">
          <DeskBadge :desk="desk" :size="30" />
          <span>{{ $t('room.desk', { n: desk }) }}</span>
        </header>
        <div class="desk-test__buttons">
          <span
            v-for="(button, index) in BUZZER_BUTTONS"
            :key="button"
            class="desk-test__btn"
            :class="{ 'desk-test__btn--lit': isLit(desk, button) }"
            :data-test="`buzzer-${desk}${button}`"
          >
            {{ button }}
            <small>{{ keysByDesk[desk]?.[index] }}</small>
          </span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { mdiGestureTapButton } from '@mdi/js'
import {
  type BuzzerLearning,
  type BuzzerLearningState,
  createBuzzerLearning,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import DeskBadge from '@/components/game/DeskBadge.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  BUZZER_BUTTONS,
  type BuzzerButton,
  type DeskNumber,
  DESKS,
  formatKeyCode,
  getDeskKeys,
} from '@/hardware/buzzers'
import { getBuzzerInput, saveBuzzerKeymap, useRoomHardware } from '@/hardware/roomHardware'
import { useBuzzers } from '@/hardware/useBuzzers'

const FLASH_MS = 450

const { t } = useI18n()
const { confirm } = useConfirm()
const { hardware, keymap, usesSimulationKeys, buzzerState } = useRoomHardware()

const learning = shallowRef<BuzzerLearning | null>(null)
const learningState = shallowRef<BuzzerLearningState | null>(null)
const saved = ref(false)
const flashes = reactive(new Set<string>())
const flashTimers = new Set<ReturnType<typeof setTimeout>>()
let offLearning: (() => void) | null = null
let offKeys: (() => void) | null = null

const learnedCount = computed(() => Object.keys(hardware.value.config.buzzers.keymap).length)
const learnedInSession = computed(() => Object.keys(learningState.value?.keymap ?? {}).length)
const keysByDesk = computed(() =>
  Object.fromEntries(DESKS.map((desk) => [desk, getDeskKeys(keymap.value, desk)]))
)

const feedback = computed(() => {
  const result = learningState.value?.lastResult
  if (!result || result.status === 'ignored') {
    return null
  }
  const key = formatKeyCode(result.code)
  switch (result.status) {
    case 'assigned': {
      return { error: false, text: t('hardware.buzzers.assigned', { ...result.slot, key }) }
    }
    case 'duplicate': {
      return { error: true, text: t('hardware.buzzers.duplicate', { ...result.usedBy, key }) }
    }
    default: {
      return { error: true, text: t('hardware.buzzers.forbidden', { key }) }
    }
  }
})

function isLit(desk: DeskNumber, button: BuzzerButton): boolean {
  const held = buzzerState.value?.held ?? []
  return (
    flashes.has(`${desk}${button}`) ||
    held.some((slot) => slot.desk === desk && slot.button === button)
  )
}

useBuzzers((press) => {
  const id = `${press.desk}${press.button}`
  flashes.add(id)
  const timer = setTimeout(() => {
    flashTimers.delete(timer)
    flashes.delete(id)
  }, FLASH_MS)
  flashTimers.add(timer)
})

function startLearning(): void {
  stopLearning()
  saved.value = false
  const next = createBuzzerLearning()
  learning.value = next
  learningState.value = next.getState()
  offLearning = next.onChange((state) => {
    learningState.value = state
  })
  // Toute touche autorisée compte, même si elle n'est pas encore associée.
  offKeys = getBuzzerInput().onKey(({ code }) => {
    // Un buzzer qui envoie Entrée ou Espace ne doit pas cliquer le bouton qui a le focus.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    next.capture(code)
  })
}

function stopLearning(): void {
  offKeys?.()
  offLearning?.()
  offKeys = null
  offLearning = null
  learning.value = null
  learningState.value = null
}

async function onSave(): Promise<void> {
  const current = learning.value
  if (!current) {
    return
  }
  await saveBuzzerKeymap(current.getKeymap())
  stopLearning()
  saved.value = true
}

async function onResetToSimulation(): Promise<void> {
  const ok = await confirm({ message: t('hardware.buzzers.resetConfirm'), variant: 'danger' })
  if (ok) {
    await saveBuzzerKeymap({})
    saved.value = false
  }
}

onBeforeUnmount(() => {
  stopLearning()
  for (const timer of flashTimers) {
    clearTimeout(timer)
  }
  flashTimers.clear()
})
</script>

<style scoped>
.learn {
  display: grid;
  gap: 12px;
  padding: 20px 24px;
  border-radius: 18px;
  border: 1px solid var(--border-2);
  background: var(--bg-card-hi);
}

.learn__step {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.learn__prompt {
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
}

.learn__prompt--1 {
  color: var(--desk-1);
}

.learn__prompt--2 {
  color: var(--desk-2);
}

.learn__prompt--3 {
  color: var(--desk-3);
}

.learn__prompt--4 {
  color: var(--desk-4);
}

.learn__feedback {
  margin: 0;
  color: var(--ok);
}

.learn__feedback--error {
  color: var(--danger);
}

.desks {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 1000px) {
  .desks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.desk-test {
  --desk-color: var(--desk-1);

  display: grid;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
}

.desk-test--2 {
  --desk-color: var(--desk-2);
}

.desk-test--3 {
  --desk-color: var(--desk-3);
}

.desk-test--4 {
  --desk-color: var(--desk-4);
}

.desk-test__head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
}

.desk-test__buttons {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.desk-test__btn {
  display: grid;
  place-items: center;
  gap: 2px;
  padding: 10px 0;
  border-radius: 12px;
  border: 1px solid var(--border-ui);
  font-size: 20px;
  font-weight: 900;
  color: var(--text-1);
  transition:
    background 120ms ease,
    box-shadow 120ms ease;
}

.desk-test__btn small {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.desk-test__btn--lit {
  background: var(--desk-color);
  color: var(--bg-0);
  box-shadow: 0 0 22px var(--desk-color);
}

.desk-test__btn--lit small {
  color: var(--bg-0);
}
</style>
