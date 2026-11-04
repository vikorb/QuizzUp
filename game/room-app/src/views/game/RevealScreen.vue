<template>
  <section class="reveal">
    <img v-if="imageUrl" class="reveal__image" :src="imageUrl" alt="" />
    <p class="reveal__label">{{ $t('game.reveal.answer') }}</p>
    <template v-if="isBlindTest">
      <h1 v-if="winner" class="reveal__title reveal__title--win">
        <DeskBadge :desk="winner.podium" :size="54" />
        {{ $t('game.reveal.winner', { name: winner.displayName, stage: view.stage ?? 0 }) }}
        <span class="reveal__points">+{{ view.points }}</span>
      </h1>
      <h1 v-else class="reveal__title">{{ $t('game.reveal.nobody') }}</h1>
    </template>
    <template v-else>
      <h1 v-if="!view.results.some((result) => result.isCorrect)" class="reveal__title">
        {{ $t('game.reveal.nobody') }}
      </h1>
      <ul v-if="lines.length > 0" class="reveal__results">
        <li
          v-for="line in lines"
          :key="line.participantId"
          class="reveal__result"
          :class="{ 'reveal__result--ok': line.isCorrect }"
        >
          <DeskBadge :desk="line.podium" :size="36" />
          <span class="reveal__name">{{ line.displayName }}</span>
          <span class="reveal__delta" :class="{ 'reveal__delta--minus': line.points < 0 }">{{
            line.points > 0 ? `+${line.points}` : line.points
          }}</span>
        </li>
      </ul>
    </template>

    <AnswerGrid :answers="view.question.answers" :correct-ids="view.correctAnswerIds" />
  </section>
</template>

<script setup lang="ts">
import type { EngineParticipant } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST, QUESTION_MEDIA_TYPE_IMAGE } from '@quizzup/shared'
import { computed } from 'vue'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import DeskBadge from '@/components/game/DeskBadge.vue'
import type { RevealView } from '@/game/selectors'

const props = defineProps<{
  view: RevealView
  winner: EngineParticipant | undefined
  participants?: EngineParticipant[]
}>()

/** Révélation progressive (ou QCM illustré) : l'image enfin nette. */
const imageUrl = computed(() =>
  props.view.question.mediaType === QUESTION_MEDIA_TYPE_IMAGE ? props.view.question.mediaUrl : null
)

const isBlindTest = computed(() => props.view.miniGame === MINI_GAME_FLASH_BLIND_TEST)

/** Joueurs dont le score bouge sur cette question (gains, pénalités, vols). */
const lines = computed(() =>
  props.view.results
    .filter((result) => result.points !== 0)
    .map((result) => {
      const participant = props.participants?.find((item) => item.id === result.participantId)
      return {
        ...result,
        podium: participant?.podium ?? 0,
        displayName: participant?.displayName ?? '',
      }
    })
)
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

.reveal__image {
  height: clamp(100px, 20vh, 220px);
  border-radius: 18px;
  border: 1px solid var(--border-2);
  box-shadow: 0 0 32px -8px var(--glow-cyan);
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

.reveal__results {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.reveal__result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 16px;
  border: 1px solid var(--border-ui);
  background: var(--bg-card);
}

.reveal__result--ok {
  border-color: var(--ok);
  box-shadow: 0 0 22px -6px var(--glow-cyan);
}

.reveal__name {
  font-weight: 800;
  font-size: var(--stage-small);
}

.reveal__delta {
  font-weight: 900;
  font-size: var(--stage-text);
  color: var(--accent-cyan);
}

.reveal__delta--minus {
  color: var(--danger);
}

.reveal__points {
  color: var(--accent-cyan);
  text-shadow: 0 0 24px var(--glow-cyan);
}
</style>
