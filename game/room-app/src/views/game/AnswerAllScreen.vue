<template>
  <section class="all" :class="`all--${view.miniGame}`">
    <QuestionPrompt :question="view.question" :hint="hint" />

    <div class="all__status">
      <TimerBar
        class="all__timer"
        :value="view.remainingRatio"
        :tone="view.remainingRatio < 0.3 ? 'warn' : 'default'"
      />
      <p class="all__count" role="status">
        {{
          $t('game.answerAll.answered', {
            n: view.answeredIds.length,
            total: view.playerIds.length,
          })
        }}
      </p>
    </div>

    <AnswerGrid :answers="view.question.answers" />
  </section>
</template>

<script setup lang="ts">
import {
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
} from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import QuestionPrompt from '@/components/game/QuestionPrompt.vue'
import TimerBar from '@/components/game/TimerBar.vue'
import type { AnswerAllView } from '@/game/miniGameViews'

const props = defineProps<{ view: AnswerAllView }>()

const { t } = useI18n()

const HINT_KEYS: Partial<Record<AnswerAllView['miniGame'], string>> = {
  [MINI_GAME_TRUE_FALSE]: 'game.answerAll.hintTrueFalse',
  [MINI_GAME_ESTIMATE]: 'game.answerAll.hintEstimate',
  [MINI_GAME_STREAK]: 'game.answerAll.hintStreak',
  [MINI_GAME_SUDDEN_DEATH]: 'game.answerAll.hintSuddenDeath',
  [MINI_GAME_DOUBLE_OR_NOTHING]: 'game.answerAll.hintDoubleOrNothing',
}

const hint = computed(() => t(HINT_KEYS[props.view.miniGame] ?? 'game.answerAll.hint'))
</script>

<style scoped>
.all {
  display: grid;
  align-content: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.all__status {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.all__timer {
  width: min(720px, 100%);
}

.all__count {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
  font-weight: 700;
}
</style>
