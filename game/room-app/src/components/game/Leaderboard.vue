<template>
  <ol class="board">
    <li
      v-for="line in lines"
      :key="line.participantId"
      class="board__line"
      :class="{ 'board__line--first': line.rank === 1 }"
    >
      <span class="board__rank">{{ line.rank }}</span>
      <DeskBadge :desk="line.podium" :size="44" />
      <span class="board__name">{{ line.displayName }}</span>
      <span v-if="showRoundPoints && line.roundPoints > 0" class="board__delta">
        +{{ line.roundPoints }}
      </span>
      <span class="board__score">{{ $t('game.points', { n: line.score }) }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import DeskBadge from '@/components/game/DeskBadge.vue'
import type { LeaderboardLine } from '@/game/selectors'

defineProps<{ lines: LeaderboardLine[]; showRoundPoints?: boolean }>()
</script>

<style scoped>
.board {
  display: grid;
  gap: 14px;
  width: min(900px, 100%);
  margin: 0;
  padding: 0;
  list-style: none;
}

.board__line {
  text-align: left;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 16px 22px;
  border-radius: 18px;
  border: 1px solid var(--border-ui);
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  animation: slide-in 0.5s ease both;
}

.board__line:nth-child(2) {
  animation-delay: 0.1s;
}

.board__line:nth-child(3) {
  animation-delay: 0.2s;
}

.board__line:nth-child(4) {
  animation-delay: 0.3s;
}

.board__line--first {
  border-color: var(--border-hover);
  box-shadow: 0 0 30px var(--glow-pink);
}

.board__rank {
  width: 40px;
  font-size: var(--stage-text);
  font-weight: 900;
  color: var(--accent-pink);
  text-align: center;
}

.board__name {
  flex: 1;
  font-size: var(--stage-text);
  font-weight: 800;
}

.board__delta {
  color: var(--accent-cyan);
  font-weight: 800;
  font-size: var(--stage-small);
}

.board__score {
  font-size: var(--stage-text);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
