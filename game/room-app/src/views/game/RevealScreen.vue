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

    <div v-if="credit" class="reveal__credit">
      <img
        v-if="credit.coverUrl && credit.coverUrl !== failedCover"
        class="reveal__cover"
        :src="credit.coverUrl"
        alt=""
        @error="failedCover = credit.coverUrl"
      />
      <div class="reveal__credit-text">
        <span class="reveal__credit-track">{{
          $t('game.reveal.creditTrack', { artist: credit.artist, title: credit.title })
        }}</span>
        <span class="reveal__credit-source">{{ $t('game.reveal.creditDeezer') }}</span>
      </div>
    </div>

    <AnswerGrid :answers="view.question.answers" :correct-ids="view.correctAnswerIds" />
  </section>
</template>

<script setup lang="ts">
import type { EngineParticipant } from '@quizzup/game-engine'
import { MINI_GAME_FLASH_BLIND_TEST, QUESTION_MEDIA_TYPE_IMAGE } from '@quizzup/shared'
import { computed, ref } from 'vue'

import AnswerGrid from '@/components/game/AnswerGrid.vue'
import DeskBadge from '@/components/game/DeskBadge.vue'
import { getMediaCredit } from '@/game/mediaCredits'
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

/** Extrait fourni par un service tiers : crédité ici seulement, la réponse est révélée. */
const credit = computed(() => getMediaCredit(props.view.question.id))

/** Pochette illisible : retirée, sans icône d'image cassée. */
const failedCover = ref<string | null>(null)

const isBlindTest = computed(() => props.view.miniGame === MINI_GAME_FLASH_BLIND_TEST)

/**
 * Joueurs dont le score bouge sur cette question (gains, pénalités, vols), plus ceux qui
 * ont juste sans gagner de points (mise passée, gain volé) : ils restent affichés.
 */
const lines = computed(() =>
  props.view.results
    .filter((result) => result.points !== 0 || result.isCorrect)
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

.reveal__credit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  max-width: 100%;
}

.reveal__cover {
  flex: none;
  width: clamp(56px, 9vh, 96px);
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-ctl);
  border: 1px solid var(--border-ui);
}

.reveal__credit-text {
  display: grid;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.reveal__credit-track {
  font-size: var(--stage-text);
  font-weight: 800;
  color: var(--text-1);
}

.reveal__credit-source {
  font-size: var(--stage-small);
  color: var(--text-2);
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
