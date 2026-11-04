<template>
  <section class="buzz" :class="`buzz--${view.status}`">
    <QuestionPrompt :question="view.question" :hint="hint" :blur="blur" />

    <div class="buzz__center">
      <p
        v-if="view.status === 'answering'"
        class="buzz__status buzz__status--answering"
        role="status"
      >
        <DeskBadge v-if="answering" :desk="answering.podium" :size="48" />
        {{ $t('game.buzz.answering', { name: answering?.displayName ?? '' }) }}
      </p>
      <p v-else class="buzz__status" role="status">{{ $t('game.buzz.open') }}</p>

      <TimerBar
        v-if="view.status === 'answering'"
        class="buzz__timer"
        :value="view.answerRemainingRatio"
        tone="warn"
      />
      <TimerBar v-else class="buzz__timer" :value="1 - view.progress" />

      <p v-if="view.pointsAtStake !== null" class="buzz__stake">
        {{ $t('game.buzz.atStake', { n: view.pointsAtStake }) }}
      </p>
    </div>

    <AnswerGrid :answers="view.question.answers" :dimmed="view.status === 'open'" />
  </section>
</template>

<script setup lang="ts">
import type { EngineParticipant } from '@quizzup/game-engine'
import { MINI_GAME_PROGRESSIVE_REVEAL } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import DeskBadge from '@/components/game/DeskBadge.vue'
import QuestionPrompt from '@/components/game/QuestionPrompt.vue'
import TimerBar from '@/components/game/TimerBar.vue'
import type { BuzzView } from '@/game/miniGameViews'

const props = defineProps<{ view: BuzzView; answering: EngineParticipant | undefined }>()

const { t } = useI18n()

/** Flou maximal de l'image au début de la révélation progressive. */
const MAX_BLUR_PX = 36

const isReveal = computed(() => props.view.miniGame === MINI_GAME_PROGRESSIVE_REVEAL)
const blur = computed(() => (isReveal.value ? MAX_BLUR_PX * (1 - props.view.progress) : 0))
const hint = computed(() => t(isReveal.value ? 'game.buzz.hintReveal' : 'game.buzz.hintFirstBuzz'))
</script>

<style scoped>
.buzz {
  display: grid;
  align-content: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.buzz__center {
  display: grid;
  justify-items: center;
  gap: 12px;
}

.buzz__status {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
}

.buzz--open .buzz__status {
  color: var(--accent-cyan);
  animation: pulse 0.8s ease-in-out infinite alternate;
}

.buzz__status--answering {
  color: var(--warn);
}

.buzz__timer {
  width: min(720px, 100%);
}

.buzz__stake {
  margin: 0;
  color: var(--accent-cyan);
  font-weight: 800;
  font-size: var(--stage-small);
  text-shadow: 0 0 18px var(--glow-cyan);
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
