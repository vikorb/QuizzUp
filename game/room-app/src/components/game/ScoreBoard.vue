<template>
  <section class="scoreboard" :aria-label="$t('game.scoreboard.label')">
    <article
      v-for="line in lines"
      :key="line.participantId"
      class="score"
      :class="{
        'score--active': line.participantId === activeId,
        'score--locked':
          lockedIds?.includes(line.participantId) || eliminatedIds?.includes(line.participantId),
        'score--answered': answeredIds?.includes(line.participantId),
      }"
      :style="{ order: line.podium }"
    >
      <DeskBadge :desk="line.podium" />
      <span class="score__name">{{ line.displayName }}</span>
      <span v-if="eliminatedIds?.includes(line.participantId)" class="score__locked">
        <MdIcon :path="mdiSkullOutline" :size="16" />
        {{ $t('game.scoreboard.eliminated') }}
      </span>
      <span v-else-if="lockedIds?.includes(line.participantId)" class="score__locked">
        <MdIcon :path="mdiLockOutline" :size="16" />
        {{ $t('game.blindTest.locked') }}
      </span>
      <span v-else-if="answeredIds?.includes(line.participantId)" class="score__answered">
        <MdIcon :path="mdiCheckCircleOutline" :size="16" />
        {{ answeredLabel ?? $t('game.scoreboard.answered') }}
      </span>
      <span v-if="tags?.[line.participantId]" class="score__tag">{{
        tags[line.participantId]
      }}</span>
      <span class="score__value">{{ line.score }}</span>
    </article>
  </section>
</template>

<script setup lang="ts">
import { mdiCheckCircleOutline, mdiLockOutline, mdiSkullOutline } from '@mdi/js'

import DeskBadge from '@/components/game/DeskBadge.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import type { LeaderboardLine } from '@/game/selectors'

defineProps<{
  lines: LeaderboardLine[]
  /** Joueur mis en avant (qui répond, qui choisit). */
  activeId?: number | null
  lockedIds?: number[]
  /** Mort subite : éliminés de la manche. */
  eliminatedIds?: number[]
  /** Joueurs qui ont déjà répondu (sans dévoiler leur choix). */
  answeredIds?: number[]
  /** Libellé de l'étiquette « a répondu » (« A misé » pendant les paris). */
  answeredLabel?: string
  /** Étiquette courte par joueur (multiplicateur, mise). */
  tags?: Record<number, string>
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

.score--answered {
  border-color: var(--ok);
}

.score__answered {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ok);
  font-size: 12px;
  font-weight: 700;
}

.score__tag {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: var(--surface-1);
  color: var(--accent-cyan);
  font-size: 13px;
  font-weight: 800;
}

.score__value {
  font-weight: 900;
  font-size: clamp(22px, 2.2vw, 36px);
  font-variant-numeric: tabular-nums;
}
</style>
