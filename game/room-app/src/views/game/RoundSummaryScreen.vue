<template>
  <section class="summary">
    <h1 class="summary__title">{{ $t('game.summary.title', { position }) }}</h1>
    <Leaderboard :lines="lines" show-round-points />
    <p class="summary__next">{{ isLast ? $t('game.summary.last') : $t('game.summary.next') }}</p>
  </section>
</template>

<script setup lang="ts">
import Leaderboard from '@/components/game/Leaderboard.vue'
import type { LeaderboardLine } from '@/game/selectors'

defineProps<{ position: number; isLast: boolean; lines: LeaderboardLine[] }>()
</script>

<style scoped>
.summary {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--stage-gap);
}

.summary__title {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.summary__next {
  margin: 0;
  color: var(--text-2);
  font-size: var(--stage-small);
}
</style>
