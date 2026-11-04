<template>
  <section class="finished">
    <h1 class="finished__title">
      {{ aborted ? $t('game.aborted.title') : $t('game.finished.title') }}
    </h1>

    <p v-if="noContent" class="finished__note">{{ $t('game.finished.noContent') }}</p>

    <p v-if="winners.length === 1" class="finished__winner">
      <MdIcon :path="mdiTrophy" :size="44" />
      {{ $t('game.finished.winner', { name: winners[0]?.displayName ?? '' }) }}
    </p>
    <p v-else-if="winners.length > 1" class="finished__winner">
      <MdIcon :path="mdiTrophy" :size="44" />
      {{ $t('game.finished.tie') }}
    </p>

    <Leaderboard :lines="lines" />

    <p
      v-if="sync"
      class="finished__sync"
      :class="`finished__sync--${sync}`"
      role="status"
      data-test="finish-sync"
    >
      {{ $t(`game.finished.sync.${sync}`) }}
    </p>

    <div class="finished__actions">
      <UiButton variant="primary" class="finished__btn" @click="emit('new-game')">
        <MdIcon :path="mdiReplay" :size="22" />
        {{ $t('game.finished.newGame') }}
      </UiButton>
      <UiButton class="finished__btn" @click="emit('home')">
        {{ $t('game.finished.home') }}
      </UiButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { mdiReplay, mdiTrophy } from '@mdi/js'
import { computed } from 'vue'

import Leaderboard from '@/components/game/Leaderboard.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { FinishSyncStatus } from '@/game/pendingFinishes'
import type { LeaderboardLine } from '@/game/selectors'

const props = defineProps<{
  lines: LeaderboardLine[]
  aborted: boolean
  noContent: boolean
  /** Envoi des résultats au backoffice ; `null` : rien à afficher (démo, partie hors backoffice). */
  sync?: Exclude<FinishSyncStatus, 'idle'> | null
}>()

const emit = defineEmits<{
  (event: 'new-game'): void
  (event: 'home'): void
}>()

/** Vainqueur(s) : seulement si quelqu'un a marqué. */
const winners = computed(() => props.lines.filter((line) => line.rank === 1 && line.score > 0))
</script>

<style scoped>
.finished {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--stage-gap);
  text-align: center;
}

.finished__title {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.finished__note {
  margin: 0;
  color: var(--warn);
}

.finished__winner {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
  color: var(--warn);
  text-shadow: 0 0 24px var(--warn-bg);
}

.finished__sync {
  margin: 0;
  color: var(--text-2);
  font-size: var(--stage-small);
}

.finished__sync--sent {
  color: var(--ok);
}

.finished__sync--offline,
.finished__sync--auth {
  color: var(--warn);
}

.finished__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
}

.finished__btn {
  padding: 16px 28px;
  font-size: 18px;
  border-radius: 16px;
}
</style>
