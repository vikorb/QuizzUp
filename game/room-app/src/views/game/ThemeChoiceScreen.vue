<template>
  <section class="choice">
    <header class="choice__head">
      <DeskBadge v-if="chooser" :desk="chooser.podium" :size="54" />
      <div>
        <h1 class="choice__title">
          {{ $t('game.themeChoice.title', { name: chooser?.displayName ?? '' }) }}
        </h1>
        <p v-if="reason" class="choice__reason">{{ $t(`game.themeChoice.reason.${reason}`) }}</p>
      </div>
    </header>

    <ol class="choice__themes">
      <li
        v-for="(theme, index) in themes"
        :key="theme.id"
        class="choice__theme"
        :class="`choice__theme--${letters[index]?.toLowerCase()}`"
      >
        <span class="choice__letter">{{ letters[index] }}</span>
        <span class="choice__name">{{ theme.name }}</span>
      </li>
    </ol>

    <footer class="choice__foot">
      <TimerBar :value="remainingRatio" :tone="remainingRatio < 0.3 ? 'warn' : 'default'" />
      <p class="choice__hint">
        <span v-if="chooser">{{ $t('game.themeChoice.hint', { desk: chooser.podium }) }}</span>
        · {{ $t('game.themeChoice.auto') }}
      </p>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { EngineParticipant } from '@quizzup/game-engine'
import type { RoundChooserReason } from '@quizzup/shared'

import DeskBadge from '@/components/game/DeskBadge.vue'
import TimerBar from '@/components/game/TimerBar.vue'
import { BUZZER_BUTTONS } from '@/hardware/buzzers'

defineProps<{
  themes: { id: number; name: string }[]
  chooser: EngineParticipant | undefined
  reason: RoundChooserReason | null
  remainingRatio: number
}>()

const letters = BUZZER_BUTTONS
</script>

<style scoped>
.choice {
  display: grid;
  align-content: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.choice__head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  text-align: left;
}

.choice__title {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.choice__reason {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: var(--stage-small);
}

.choice__themes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--stage-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.choice__theme {
  --answer-color: var(--answer-a);
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: clamp(90px, 14vh, 160px);
  padding: 18px 26px;
  border-radius: 22px;
  border: 1px solid var(--border-2);
  background: linear-gradient(135deg, var(--surface-2), transparent), var(--bg-card-hi);
  box-shadow: 0 0 32px -16px var(--answer-color);
}

.choice__theme--b {
  --answer-color: var(--answer-b);
}

.choice__theme--c {
  --answer-color: var(--answer-c);
}

.choice__theme--d {
  --answer-color: var(--answer-d);
}

.choice__letter {
  display: grid;
  place-items: center;
  width: clamp(54px, 5vw, 80px);
  height: clamp(54px, 5vw, 80px);
  border-radius: 18px;
  font-weight: 900;
  font-size: var(--stage-text);
  color: var(--bg-0);
  background: var(--answer-color);
}

.choice__name {
  font-size: var(--stage-text);
  font-weight: 800;
}

.choice__foot {
  display: grid;
  gap: 10px;
}

.choice__hint {
  margin: 0;
  color: var(--text-2);
  text-align: center;
  font-size: var(--stage-small);
}
</style>
