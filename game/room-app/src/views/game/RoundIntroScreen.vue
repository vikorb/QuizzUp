<template>
  <section class="intro">
    <p class="intro__round">{{ $t('game.round', { current: position, total }) }}</p>
    <p class="intro__drawing">{{ $t('game.intro.drawing') }}</p>
    <h1 class="intro__name">{{ $t(`game.miniGames.${miniGame}.name`) }}</h1>
    <p class="intro__pitch">{{ $t(`game.miniGames.${miniGame}.pitch`) }}</p>

    <ul class="intro__rules">
      <li v-for="(rule, index) in rules" :key="index">{{ rule }}</li>
    </ul>

    <ol class="intro__stages">
      <li v-for="stage in BLIND_TEST_STAGES" :key="stage.stage" class="intro__stage">
        <span class="intro__stage-time">
          {{ $t('game.blindTest.stageDuration', { seconds: stage.durationMs / 1000 }) }}
        </span>
        <span class="intro__stage-points">{{ $t('game.points', { n: stage.points }) }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import type { MiniGame } from '@quizzup/shared'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { BLIND_TEST_STAGES } from '@/game/selectors'

const props = defineProps<{ position: number; total: number; miniGame: MiniGame }>()

const { tm, rt } = useI18n()

const rules = computed(() =>
  (tm(`game.miniGames.${props.miniGame}.rules`) as unknown as string[]).map((rule) => rt(rule))
)
</script>

<style scoped>
.intro {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 14px;
  text-align: center;
}

.intro__round {
  margin: 0;
  color: var(--accent-pink);
  font-weight: 800;
  font-size: var(--stage-small);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.intro__drawing {
  margin: 0;
  color: var(--text-2);
  font-size: var(--stage-small);
  animation: fade-out 1.2s ease forwards;
}

.intro__name {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple), var(--accent-pink));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 24px var(--glow-pink));
  animation: reveal 0.9s cubic-bezier(0.2, 0.9, 0.3, 1.2) 0.4s both;
}

.intro__pitch {
  margin: 0;
  font-size: var(--stage-text);
  color: var(--text-0);
}

.intro__rules {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  color: var(--text-1);
  font-size: var(--stage-small);
}

.intro__stages {
  display: flex;
  gap: 16px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.intro__stage {
  display: grid;
  gap: 4px;
  min-width: 120px;
  padding: 14px 18px;
  border-radius: 16px;
  border: 1px solid var(--border-2);
  background: var(--bg-card);
}

.intro__stage-time {
  font-size: var(--stage-text);
  font-weight: 900;
}

.intro__stage-points {
  color: var(--accent-cyan);
  font-weight: 800;
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fade-out {
  to {
    opacity: 0;
  }
}
</style>
