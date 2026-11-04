<template>
  <section class="bet">
    <header class="bet__head">
      <p class="bet__label">{{ $t('game.bet.label') }}</p>
      <h1 class="bet__title">{{ $t('game.bet.title') }}</h1>
      <p class="bet__hint">{{ $t('game.bet.hint') }}</p>
    </header>

    <ol class="bet__options">
      <li
        v-for="(option, index) in options"
        :key="option.key"
        class="bet__option"
        :class="`bet__option--${letters[index]?.toLowerCase()}`"
      >
        <span class="bet__letter">{{ letters[index] }}</span>
        <span class="bet__name">{{ $t(`game.bet.options.${option.key}`) }}</span>
        <span class="bet__stake">{{ option.detail }}</span>
      </li>
    </ol>

    <footer class="bet__foot">
      <TimerBar
        :value="view.remainingRatio"
        :tone="view.remainingRatio < 0.3 ? 'warn' : 'default'"
      />
      <p class="bet__count" role="status">
        {{ $t('game.bet.count', { n: view.betIds.length, total: playersCount }) }}
      </p>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { DOUBLE_OR_NOTHING_ALL_IN_MIN, DOUBLE_OR_NOTHING_STAKES } from '@quizzup/game-engine'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import TimerBar from '@/components/game/TimerBar.vue'
import type { BetView } from '@/game/miniGameViews'
import { BUZZER_BUTTONS } from '@/hardware/buzzers'

defineProps<{ view: BetView; playersCount: number }>()

const { t } = useI18n()
const letters = BUZZER_BUTTONS

const options = computed(() => [
  { key: 'pass', detail: t('game.points', { n: DOUBLE_OR_NOTHING_STAKES[0] }) },
  { key: 'single', detail: t('game.points', { n: DOUBLE_OR_NOTHING_STAKES[1] }) },
  { key: 'double', detail: t('game.points', { n: DOUBLE_OR_NOTHING_STAKES[2] }) },
  { key: 'allIn', detail: t('game.bet.allInDetail', { n: DOUBLE_OR_NOTHING_ALL_IN_MIN }) },
])
</script>

<style scoped>
.bet {
  display: grid;
  align-content: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.bet__head {
  display: grid;
  justify-items: center;
  gap: 8px;
  text-align: center;
}

.bet__label {
  margin: 0;
  color: var(--accent-pink);
  font-weight: 800;
  font-size: var(--stage-small);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.bet__title {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.bet__hint {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
}

.bet__options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--stage-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bet__option {
  --answer-color: var(--answer-a);
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 22px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-2);
  border-top: 6px solid var(--answer-color);
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  text-align: center;
}

.bet__option--b {
  --answer-color: var(--answer-b);
}

.bet__option--c {
  --answer-color: var(--answer-c);
}

.bet__option--d {
  --answer-color: var(--answer-d);
}

.bet__letter {
  display: grid;
  place-items: center;
  width: clamp(44px, 4vw, 64px);
  height: clamp(44px, 4vw, 64px);
  border-radius: 14px;
  font-weight: 900;
  font-size: var(--stage-text);
  color: var(--bg-0);
  background: var(--answer-color);
}

.bet__name {
  font-size: var(--stage-text);
  font-weight: 900;
}

.bet__stake {
  color: var(--accent-cyan);
  font-weight: 800;
}

.bet__foot {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.bet__foot > :first-child {
  width: min(720px, 100%);
}

.bet__count {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
  font-weight: 700;
}
</style>
