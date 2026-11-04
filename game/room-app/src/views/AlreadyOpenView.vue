<template>
  <main class="already-open">
    <div class="already-open__card neon neon--no-hover" role="alert">
      <MdIcon :path="mdiMonitorMultiple" :size="56" />
      <h1 class="already-open__title">{{ $t('room.alreadyOpen.title') }}</h1>
      <p class="already-open__text">{{ $t('room.alreadyOpen.text') }}</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { mdiMonitorMultiple } from '@mdi/js'

import MdIcon from '@/components/ui/MdIcon.vue'
</script>

<style scoped>
.already-open {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
}

.already-open__card {
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 640px;
  padding: 36px 40px;
  border-radius: 22px;
  border: 1px solid var(--warn);
  background: var(--bg-elevated);
  color: var(--warn);
  text-align: center;
}

.already-open__title {
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
}

.already-open__text {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
}
</style>
