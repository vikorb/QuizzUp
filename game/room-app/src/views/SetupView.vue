<template>
  <main class="setup stage-bg" :data-step="step">
    <UiButton class="setup__quit" data-test="setup-quit" @click="onQuit">
      <MdIcon :path="mdiClose" :size="18" />
      {{ $t('setup.quit') }}
    </UiButton>

    <Transition name="setup-step" mode="out-in">
      <section v-if="step === 'welcome'" key="welcome" class="setup__stage">
        <h1 class="setup__title">{{ $t('setup.welcome.title') }}</h1>
        <p class="setup__text">{{ $t('setup.welcome.text') }}</p>
        <UiButton
          variant="primary"
          class="setup__big"
          data-test="setup-start"
          @click="go('layout')"
        >
          {{ $t('setup.welcome.start') }}
        </UiButton>
      </section>

      <section v-else-if="step === 'layout'" key="layout" class="setup__stage">
        <h1 class="setup__title">{{ $t('setup.layout.title') }}</h1>
        <p class="setup__text">{{ $t('setup.layout.hint') }}</p>
        <div class="pad" role="group" :aria-label="$t('setup.layout.pad')">
          <button
            v-for="corner in BUZZER_CORNERS"
            :key="corner"
            type="button"
            class="pad__cell"
            :class="{ 'pad__cell--on': selected === corner }"
            :style="{ '--cell-color': `var(--buzzer-${draft[byCorner[corner]].color})` }"
            :aria-pressed="selected === corner"
            :aria-label="
              $t('setup.layout.cell', {
                button: byCorner[corner],
                color: $t(`hardware.colors.${draft[byCorner[corner]].color}`),
                place: $t(`hardware.corners.${corner}`),
              })
            "
            draggable="true"
            :data-test="`setup-corner-${corner}`"
            @click="onCorner(corner)"
            @dragstart="dragFrom = corner"
            @dragover.prevent
            @drop.prevent="onDrop(corner)"
          >
            {{ byCorner[corner] }}
          </button>
        </div>
        <div class="palette" role="group" :aria-label="$t('setup.layout.colors')">
          <button
            v-for="color in BUZZER_COLORS"
            :key="color"
            type="button"
            class="palette__swatch"
            :class="{ 'palette__swatch--on': draft[byCorner[selected]].color === color }"
            :style="{ background: `var(--buzzer-${color})` }"
            :aria-label="$t(`hardware.colors.${color}`)"
            :aria-pressed="draft[byCorner[selected]].color === color"
            :title="$t(`hardware.colors.${color}`)"
            :data-test="`setup-color-${color}`"
            @click="draft = setBuzzerColor(draft, byCorner[selected], color)"
          />
        </div>
        <div class="setup__actions">
          <UiButton :aria-pressed="swapping" data-test="setup-swap" @click="swapping = !swapping">
            {{ swapping ? $t('setup.layout.swapping') : $t('setup.layout.swap') }}
          </UiButton>
          <UiButton
            variant="primary"
            class="setup__big"
            data-test="setup-layout-ok"
            @click="go('desks')"
          >
            {{ $t('setup.ok') }}
          </UiButton>
        </div>
      </section>

      <section v-else-if="step === 'desks'" key="desks" class="setup__stage">
        <h1 id="setup-desks-title" class="setup__title">{{ $t('setup.desks.title') }}</h1>
        <div class="count" role="radiogroup" aria-labelledby="setup-desks-title">
          <button
            v-for="n in 6"
            :key="n"
            type="button"
            role="radio"
            class="count__btn"
            :class="{ 'count__btn--on': desksCount === n }"
            :aria-checked="desksCount === n"
            :data-test="`setup-desks-${n}`"
            @click="desksCount = n"
          >
            {{ n }}
          </button>
        </div>
        <div class="setup__actions">
          <UiButton
            variant="primary"
            class="setup__big"
            data-test="setup-desks-ok"
            @click="startLearning"
          >
            {{ $t('setup.ok') }}
          </UiButton>
        </div>
      </section>

      <section v-else-if="step === 'learn' && state?.current" key="learn" class="setup__stage">
        <div
          class="progress"
          role="progressbar"
          aria-valuemin="0"
          :aria-valuemax="state.totalSteps"
          :aria-valuenow="state.stepIndex"
          :aria-label="
            $t('setup.learn.progress', { n: state.stepIndex + 1, total: state.totalSteps })
          "
        >
          <div
            class="progress__bar"
            :style="{ width: `${(state.stepIndex / state.totalSteps) * 100}%` }"
          />
        </div>
        <p class="setup__small">
          {{ $t('setup.learn.progress', { n: state.stepIndex + 1, total: state.totalSteps }) }}
        </p>
        <h1 class="setup__title" data-test="setup-desk">
          <DeskBadge :desk="state.current.desk" :size="64" />
          {{ $t('room.desk', { n: state.current.desk }) }}
        </h1>
        <div :key="`${state.current.desk}${state.current.button}`" class="pulse">
          <BuzzerSquare
            :layout="draft"
            :active="state.current.button"
            style="--square-size: min(36vh, 300px)"
          />
        </div>
        <i18n-t
          keypath="setup.learn.prompt"
          tag="p"
          class="prompt"
          aria-live="polite"
          data-test="setup-prompt"
        >
          <template #color>
            <strong :style="{ color: `var(--buzzer-${draft[state.current.button].color})` }">{{
              $t(`hardware.colors.${draft[state.current.button].color}`)
            }}</strong>
          </template>
          <template #button>{{ state.current.button }}</template>
        </i18n-t>
        <p
          v-if="feedback"
          :key="feedbackTick"
          class="feedback"
          :class="{ 'feedback--error': feedback.error }"
          :role="feedback.error ? 'alert' : 'status'"
          data-test="setup-feedback"
        >
          <MdIcon
            v-if="!feedback.error"
            class="feedback__check"
            :path="mdiCheckCircle"
            :size="40"
          />
          {{ feedback.text }}
        </p>
        <div class="setup__actions">
          <UiButton
            data-test="setup-back"
            :disabled="state.stepIndex === 0"
            @click="learning?.back()"
          >
            {{ $t('setup.learn.back') }}
          </UiButton>
          <UiButton data-test="setup-skip" @click="learning?.skip()">
            {{ $t('setup.learn.skip') }}
          </UiButton>
        </div>
      </section>

      <section v-else key="done" class="setup__stage">
        <h1 class="setup__title" data-test="setup-done">{{ $t('setup.done.title') }}</h1>
        <p class="setup__text">{{ $t('setup.done.text') }}</p>
        <div class="recap">
          <article v-for="desk in desks" :key="desk" class="recap__desk">
            <DeskBadge :desk="desk" :size="36" />
            <BuzzerSquare
              :layout="draft"
              :keys="getDeskKeys(keymap, desk)"
              style="--square-size: 120px"
            />
          </article>
        </div>
        <div class="setup__actions">
          <UiButton :disabled="saving" data-test="setup-lights" @click="onFinish('assistant')">
            {{ $t('setup.done.lights') }}
          </UiButton>
          <UiButton
            variant="primary"
            class="setup__big"
            :disabled="saving"
            data-test="setup-finish"
            @click="onFinish()"
          >
            {{ $t('setup.done.finish') }}
          </UiButton>
        </div>
      </section>
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { mdiCheckCircle, mdiClose } from '@mdi/js'
import {
  buttonsByCorner,
  BUZZER_COLORS,
  BUZZER_CORNERS,
  type BuzzerCorner,
  type BuzzerKeymap,
  type BuzzerLearning,
  type BuzzerLearningState,
  cloneBuzzerLayout,
  createBuzzerLearning,
  desksForCount,
  moveBuzzerToCorner,
  setBuzzerColor,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import DeskBadge from '@/components/game/DeskBadge.vue'
import BuzzerSquare from '@/components/hardware/BuzzerSquare.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { playUiSound } from '@/game/useRoomGame'
import { formatKeyCode, getDeskKeys } from '@/hardware/buzzers'
import { getBuzzerInput, saveRoomSetup, useRoomHardware } from '@/hardware/roomHardware'

type Step = 'welcome' | 'layout' | 'desks' | 'learn' | 'done'

const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()
const { hardware } = useRoomHardware()

const step = ref<Step>('welcome')
const draft = ref(cloneBuzzerLayout(hardware.value.config.buzzers.layout))
const selected = ref<BuzzerCorner>('tl')
const swapping = ref(false)
const desksCount = ref(4)
const keymap = ref<BuzzerKeymap>({})
const saving = ref(false)
const learning = shallowRef<BuzzerLearning | null>(null)
const state = shallowRef<BuzzerLearningState | null>(null)
const feedbackTick = ref(0)
let dragFrom: BuzzerCorner | null = null
let confirming = false
let offLearning: (() => void) | null = null
let offKeys: (() => void) | null = null

const byCorner = computed(() => buttonsByCorner(draft.value))
const desks = computed(() => desksForCount(desksCount.value))

const feedback = computed(() => {
  const result = state.value?.lastResult
  if (!result || result.status === 'ignored') {
    return null
  }
  const key = formatKeyCode(result.code)
  if (result.status === 'assigned') {
    return { error: false, text: t('setup.learn.assigned', { key }) }
  }
  return {
    error: true,
    text:
      result.status === 'duplicate'
        ? t('setup.learn.duplicate', { key, ...result.usedBy })
        : t('setup.learn.forbidden', { key }),
  }
})

function go(next: Step): void {
  swapping.value = false
  step.value = next
}

function moveSelected(to: BuzzerCorner): void {
  draft.value = moveBuzzerToCorner(draft.value, byCorner.value[selected.value], to)
  selected.value = to
}

function onCorner(corner: BuzzerCorner): void {
  if (swapping.value && corner !== selected.value) {
    moveSelected(corner)
  } else {
    selected.value = corner
  }
  swapping.value = false
}

function onDrop(corner: BuzzerCorner): void {
  if (dragFrom && dragFrom !== corner) {
    selected.value = dragFrom
    moveSelected(corner)
  }
  dragFrom = null
}

function stopLearning(): void {
  offKeys?.()
  offLearning?.()
  offKeys = offLearning = null
}

function startLearning(): void {
  stopLearning()
  const next = createBuzzerLearning({ desks: desks.value })
  learning.value = next
  state.value = next.getState()
  step.value = 'learn'
  let lastResult = state.value.lastResult
  offLearning = next.onChange((current) => {
    state.value = current
    if (current.lastResult !== lastResult && current.lastResult?.status !== 'ignored') {
      feedbackTick.value += 1
      playUiSound(current.lastResult?.status === 'assigned' ? 'correct' : 'wrong')
    }
    lastResult = current.lastResult
    if (current.done) {
      keymap.value = next.getKeymap()
      stopLearning()
      playUiSound('tierUp')
      step.value = 'done'
    }
  })
  offKeys = getBuzzerInput().onKey(({ code }) => {
    if (code === 'Escape') {
      return
    }
    // Un buzzer qui envoie Entrée ou Espace ne doit pas cliquer le bouton qui a le focus.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    next.capture(code)
  })
}

async function onQuit(): Promise<void> {
  if (confirming) {
    return
  }
  confirming = true
  const ok = await confirm({ message: t('setup.quitConfirm'), variant: 'danger' })
  confirming = false
  if (ok) {
    await router.push({ name: 'launch' })
  }
}

async function onFinish(tab?: 'assistant'): Promise<void> {
  saving.value = true
  await saveRoomSetup({ layout: draft.value, desksCount: desksCount.value, keymap: keymap.value })
  await (tab ? router.push({ name: 'hardware', query: { tab } }) : router.push({ name: 'launch' }))
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    void onQuit()
  }
}

onMounted(() => window.addEventListener('keydown', onEscape))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  stopLearning()
})
</script>

<style scoped>
.setup {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 72px 24px 32px;
  text-align: center;
  color: var(--text-0);
}

.setup__quit {
  position: absolute;
  top: 16px;
  right: 16px;
}

.setup__stage {
  display: grid;
  justify-items: center;
  gap: clamp(14px, 3vh, 32px);
  width: min(960px, 100%);
}

.setup__title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
  line-height: 1.1;
}

.setup__text {
  margin: 0;
  max-width: 40ch;
  color: var(--text-1);
  font-size: var(--stage-text);
}

.setup__small {
  margin: 0;
  color: var(--text-2);
  font-size: var(--stage-small);
  font-weight: 700;
}

.setup__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.setup__big {
  padding: 18px 44px;
  font-size: var(--stage-text);
  font-weight: 800;
}

.pad {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: min(44vh, 360px);
}

.pad__cell {
  aspect-ratio: 1;
  border: 4px solid transparent;
  border-radius: 50%;
  background: var(--cell-color);
  color: var(--bg-0);
  font-size: clamp(32px, 7vh, 64px);
  font-weight: 900;
  cursor: pointer;
  transition: var(--tr);
}

.pad__cell--on {
  border-color: var(--text-0);
  box-shadow: 0 0 28px var(--cell-color);
  transform: scale(1.06);
}

.palette {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
}

.palette__swatch {
  width: clamp(48px, 7vh, 68px);
  height: clamp(48px, 7vh, 68px);
  border-radius: 50%;
  border: 4px solid transparent;
  cursor: pointer;
  transition: var(--tr);
}

.palette__swatch--on {
  border-color: var(--text-0);
  transform: scale(1.12);
}

.count {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.count__btn {
  width: clamp(64px, 11vh, 110px);
  aspect-ratio: 1;
  border-radius: 24px;
  border: 3px solid var(--border-ui);
  background: var(--bg-card-hi);
  color: var(--text-0);
  font-size: var(--stage-title);
  font-weight: 900;
  cursor: pointer;
  transition: var(--tr);
}

.count__btn--on {
  border-color: var(--text-0);
  background: var(--accent-blue);
  color: var(--bg-0);
  transform: scale(1.08);
}

.progress {
  width: min(560px, 100%);
  height: 12px;
  border-radius: 6px;
  background: var(--border-ui);
  overflow: hidden;
}

.progress__bar {
  height: 100%;
  background: var(--accent-blue);
  transition: width 300ms ease;
}

.pulse :deep(.square__cell--on) {
  animation: setup-pulse 1s ease-in-out infinite;
}

.prompt {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
  line-height: 1.15;
}

.feedback {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: var(--ok);
  font-size: var(--stage-text);
  font-weight: 800;
  animation: setup-pop 350ms ease;
}

.feedback--error {
  color: var(--danger);
  font-size: var(--stage-text);
}

.recap {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 28px;
}

.recap__desk {
  display: grid;
  justify-items: center;
  gap: 10px;
}

.setup-step-enter-active,
.setup-step-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.setup-step-enter-from {
  opacity: 0;
  transform: translateX(32px);
}

.setup-step-leave-to {
  opacity: 0;
  transform: translateX(-32px);
}

@keyframes setup-pulse {
  50% {
    transform: scale(1.12);
    box-shadow: 0 0 36px var(--cell-color);
  }
}

@keyframes setup-pop {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
}

button:focus-visible {
  outline: 4px solid var(--text-0);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .pulse :deep(.square__cell--on),
  .feedback {
    animation: none;
  }
}
</style>
