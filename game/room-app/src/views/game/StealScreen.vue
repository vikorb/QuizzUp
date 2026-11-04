<template>
  <section class="steal">
    <header class="steal__head">
      <DeskBadge v-if="thief" :desk="thief.podium" :size="54" />
      <div>
        <h1 class="steal__title">
          {{ $t('game.steal.title', { name: thief?.displayName ?? '' }) }}
        </h1>
        <p class="steal__hint">
          {{ $t('game.steal.hint', { n: POINT_STEAL_AMOUNT }) }}
        </p>
      </div>
    </header>

    <ol class="steal__targets">
      <li
        v-for="participant in participants"
        :key="participant.id"
        class="steal__target"
        :class="{
          'steal__target--off': !view.targetIds.includes(participant.id),
          [`steal__target--${letters[participant.podium - 1]?.toLowerCase()}`]: true,
        }"
      >
        <span class="steal__letter">{{ letters[participant.podium - 1] }}</span>
        <DeskBadge :desk="participant.podium" :size="40" />
        <span class="steal__name">{{ participant.displayName }}</span>
      </li>
    </ol>

    <footer class="steal__foot">
      <TimerBar
        :value="view.remainingRatio"
        :tone="view.remainingRatio < 0.3 ? 'warn' : 'default'"
      />
      <p class="steal__auto">{{ $t('game.steal.auto') }}</p>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { type EngineParticipant, POINT_STEAL_AMOUNT } from '@quizzup/game-engine'
import { computed } from 'vue'

import DeskBadge from '@/components/game/DeskBadge.vue'
import TimerBar from '@/components/game/TimerBar.vue'
import type { StealView } from '@/game/miniGameViews'
import { BUZZER_BUTTONS } from '@/hardware/buzzers'

const props = defineProps<{ view: StealView; participants: EngineParticipant[] }>()

const letters = BUZZER_BUTTONS
const thief = computed(() =>
  props.participants.find((participant) => participant.id === props.view.thiefId)
)
</script>

<style scoped>
.steal {
  display: grid;
  align-content: center;
  gap: var(--stage-gap);
  width: min(1400px, 100%);
  margin: 0 auto;
}

.steal__head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  text-align: left;
}

.steal__title {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.steal__hint {
  margin: 4px 0 0;
  color: var(--text-1);
  font-size: var(--stage-small);
}

.steal__targets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--stage-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.steal__target {
  --answer-color: var(--answer-a);
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid var(--border-2);
  border-left: 6px solid var(--answer-color);
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  transition: var(--tr);
}

.steal__target--b {
  --answer-color: var(--answer-b);
}

.steal__target--c {
  --answer-color: var(--answer-c);
}

.steal__target--d {
  --answer-color: var(--answer-d);
}

.steal__target--off {
  opacity: 0.3;
}

.steal__letter {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  font-weight: 900;
  font-size: var(--stage-text);
  color: var(--bg-0);
  background: var(--answer-color);
}

.steal__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--stage-text);
  font-weight: 800;
}

.steal__foot {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.steal__foot > :first-child {
  width: min(720px, 100%);
}

.steal__auto {
  margin: 0;
  color: var(--text-2);
  font-size: var(--stage-small);
}
</style>
