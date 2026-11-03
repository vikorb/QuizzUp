<template>
  <section class="blind" :class="`blind--${view.status}`">
    <ol class="blind__stages" :aria-label="$t('game.blindTest.stage', { stage: view.stage })">
      <li
        v-for="stage in BLIND_TEST_STAGES"
        :key="stage.stage"
        class="blind__stage"
        :class="{
          'blind__stage--current': stage.stage === view.stage,
          'blind__stage--past': stage.stage < view.stage,
        }"
      >
        <span class="blind__stage-label">{{
          $t('game.blindTest.stage', { stage: stage.stage })
        }}</span>
        <span class="blind__stage-time">
          {{ $t('game.blindTest.stageDuration', { seconds: stage.durationMs / 1000 }) }}
        </span>
        <span class="blind__stage-points">{{ $t('game.points', { n: stage.points }) }}</span>
      </li>
    </ol>

    <div class="blind__center">
      <div class="blind__wave" aria-hidden="true">
        <span
          v-for="bar in 12"
          :key="bar"
          class="blind__bar"
          :style="{ animationDelay: `${bar * 70}ms` }"
        ></span>
      </div>

      <p
        v-if="view.status === 'answering'"
        class="blind__status blind__status--answering"
        role="status"
      >
        <DeskBadge v-if="answering" :desk="answering.podium" :size="48" />
        {{ $t('game.blindTest.answering', { name: answering?.displayName ?? '' }) }}
      </p>
      <p v-else class="blind__status" role="status">
        {{
          view.status === 'listening'
            ? $t('game.blindTest.listening')
            : $t('game.blindTest.buzzWindow')
        }}
      </p>

      <TimerBar
        v-if="view.status === 'answering'"
        class="blind__timer"
        :value="view.answerRemainingMs / FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS"
        tone="warn"
      />
      <TimerBar v-else class="blind__timer" :value="1 - view.stageProgress" />
      <p v-if="view.status === 'answering'" class="blind__hint">
        {{ $t('game.blindTest.answerHint') }}
      </p>
    </div>

    <AnswerGrid :answers="view.question.answers" :dimmed="view.status === 'listening'" />
  </section>
</template>

<script setup lang="ts">
import { type EngineParticipant, FLASH_BLIND_TEST_ANSWER_TIMEOUT_MS } from '@quizzup/game-engine'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import DeskBadge from '@/components/game/DeskBadge.vue'
import TimerBar from '@/components/game/TimerBar.vue'
import { BLIND_TEST_STAGES, type BlindTestView } from '@/game/selectors'

defineProps<{
  view: BlindTestView
  answering: EngineParticipant | undefined
}>()
</script>

<style scoped>
.blind {
  display: grid;
  align-content: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.blind__stages {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.blind__stage {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 2px 12px;
  padding: 12px 18px;
  border-radius: 16px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
  color: var(--text-3);
  transition: var(--tr);
}

.blind__stage-label {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.blind__stage-time {
  font-size: var(--stage-text);
  font-weight: 900;
}

.blind__stage-points {
  font-weight: 800;
}

.blind__stage--past {
  opacity: 0.45;
  text-decoration: line-through;
}

.blind__stage--current {
  border-color: var(--border-hover);
  background: linear-gradient(135deg, var(--glow-blue), var(--glow-pink)), var(--bg-card-hi);
  box-shadow: 0 0 26px var(--glow-pink);
  color: var(--text-0);
}

.blind__stage--current .blind__stage-points {
  color: var(--accent-cyan);
}

.blind__center {
  display: grid;
  justify-items: center;
  gap: 14px;
}

.blind__wave {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: clamp(60px, 10vh, 120px);
}

.blind__bar {
  width: clamp(8px, 0.9vw, 14px);
  height: 18%;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--accent-pink), var(--accent-blue));
  box-shadow: 0 0 12px var(--glow-pink);
}

.blind--listening .blind__bar {
  animation: equalizer 0.9s ease-in-out infinite alternate;
}

.blind__status {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.blind--buzz_window .blind__status {
  color: var(--accent-cyan);
  animation: pulse 0.8s ease-in-out infinite alternate;
}

.blind__status--answering {
  color: var(--warn);
}

.blind__timer {
  width: min(720px, 100%);
}

.blind__hint {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
}

@keyframes equalizer {
  from {
    height: 15%;
  }
  to {
    height: 100%;
  }
}

@keyframes pulse {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.06);
  }
}
</style>
