<template>
  <section class="reveal">
    <p class="reveal__label">{{ $t('game.reveal.answer') }}</p>
    <h1 v-if="winner" class="reveal__title reveal__title--win">
      <DeskBadge :desk="winner.podium" :size="54" />
      {{ $t('game.reveal.winner', { name: winner.displayName, stage: view.stage ?? 0 }) }}
      <span class="reveal__points">+{{ view.points }}</span>
    </h1>
    <h1 v-else class="reveal__title">{{ $t('game.reveal.nobody') }}</h1>

    <AnswerGrid :answers="view.question.answers" :correct-ids="view.correctAnswerIds" />
  </section>
</template>

<script setup lang="ts">
import type { EngineParticipant } from '@quizzup/game-engine'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import DeskBadge from '@/components/game/DeskBadge.vue'
import type { RevealView } from '@/game/selectors'

defineProps<{ view: RevealView; winner: EngineParticipant | undefined }>()
</script>

<style scoped>
.reveal {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.reveal > :last-child {
  width: 100%;
}

.reveal__label {
  margin: 0;
  color: var(--text-2);
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.reveal__title {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
  text-align: center;
  color: var(--text-1);
}

.reveal__title--win {
  color: var(--text-0);
}

.reveal__points {
  color: var(--accent-cyan);
  text-shadow: 0 0 24px var(--glow-cyan);
}
</style>
