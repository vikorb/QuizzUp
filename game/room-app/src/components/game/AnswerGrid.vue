<template>
  <ol class="answers" :class="{ 'answers--dim': dimmed }">
    <li
      v-for="(answer, index) in answers"
      :key="answer.id"
      class="answer"
      :class="[
        `answer--${letters[index]?.toLowerCase()}`,
        {
          'answer--correct': correctIds?.includes(answer.id),
          'answer--wrong': correctIds && !correctIds.includes(answer.id),
        },
      ]"
    >
      <span class="answer__letter">{{ letters[index] }}</span>
      <span class="answer__text">{{ answer.text }}</span>
      <MdIcon
        v-if="correctIds?.includes(answer.id)"
        class="answer__check"
        :path="mdiCheckCircle"
        :size="32"
      />
    </li>
  </ol>
</template>

<script setup lang="ts">
import { mdiCheckCircle } from '@mdi/js'
import type { EngineAnswer } from '@quizzup/game-engine'

import MdIcon from '@/components/ui/MdIcon.vue'
import { BUZZER_BUTTONS } from '@/hardware/buzzers'

defineProps<{
  /** Dans l'ordre de l'état du moteur (mélangé avec la graine), jamais réordonnées ici. */
  answers: EngineAnswer[]
  /** Renseigné à la révélation. */
  correctIds?: number[]
  dimmed?: boolean
}>()

const letters = BUZZER_BUTTONS
</script>

<style scoped>
.answers {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--stage-gap);
  margin: 0;
  padding: 0;
  list-style: none;
  transition: var(--tr);
}

.answers--dim {
  opacity: 0.55;
}

.answer {
  --answer-color: var(--answer-a);
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: clamp(70px, 10vh, 120px);
  padding: 14px 22px;
  border-radius: 20px;
  border: 1px solid var(--border-2);
  border-left: 6px solid var(--answer-color);
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  transition: var(--tr);
}

.answer--b {
  --answer-color: var(--answer-b);
}

.answer--c {
  --answer-color: var(--answer-c);
}

.answer--d {
  --answer-color: var(--answer-d);
}

.answer__letter {
  display: grid;
  place-items: center;
  width: clamp(44px, 4vw, 64px);
  height: clamp(44px, 4vw, 64px);
  flex: 0 0 auto;
  border-radius: 14px;
  font-weight: 900;
  font-size: var(--stage-text);
  color: var(--bg-0);
  background: var(--answer-color);
}

.answer__text {
  flex: 1;
  font-size: var(--stage-text);
  font-weight: 700;
}

.answer--correct {
  border-color: var(--ok);
  background: linear-gradient(180deg, var(--ok-bg), var(--bg-card));
  box-shadow: 0 0 32px -6px var(--glow-cyan);
}

.answer__check {
  color: var(--ok);
}

.answer--wrong {
  opacity: 0.35;
}
</style>
