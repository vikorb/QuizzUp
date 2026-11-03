<template>
  <section class="scoreboard" :aria-label="$t('game.scoreboard.label')">
    <article
      v-for="line in lines"
      :key="line.participantId"
      class="score"
      :class="{
        'score--active': line.participantId === activeId,
        'score--locked': lockedIds?.includes(line.participantId),
      }"
      :style="{ order: line.podium }"
    >
      <DeskBadge :desk="line.podium" />
      <span class="score__name">{{ line.displayName }}</span>
      <span v-if="lockedIds?.includes(line.participantId)" class="score__locked">
        <MdIcon :path="mdiLockOutline" :size="16" />
        {{ $t('game.blindTest.locked') }}
      </span>
      <span class="score__value">{{ line.score }}</span>
    </article>
  </section>
</template>

<script setup lang="ts">
import { mdiLockOutline } from '@mdi/js'

import DeskBadge from '@/components/game/DeskBadge.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import type { LeaderboardLine } from '@/game/selectors'

defineProps<{
  lines: LeaderboardLine[]
  /** Joueur mis en avant (qui répond, qui choisit). */
  activeId?: number | null
  lockedIds?: number[]
}>()
</script>

<style scoped>
.scoreboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  padding: 14px clamp(16px, 2.4vw, 36px) 18px;
}

.score {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid var(--border-ui);
  background: var(--bg-card);
  transition: var(--tr);
}

.score--active {
  border-color: var(--border-hover);
  background: linear-gradient(135deg, var(--glow-blue), var(--glow-pink)), var(--bg-card-hi);
  box-shadow: 0 0 26px var(--glow-pink);
  transform: translateY(-4px);
}

.score--locked {
  opacity: 0.45;
}

.score__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 800;
  font-size: var(--stage-small);
}

.score__locked {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--danger);
  font-size: 12px;
  font-weight: 700;
}

.score__value {
  font-weight: 900;
  font-size: clamp(22px, 2.2vw, 36px);
  font-variant-numeric: tabular-nums;
}
</style>
