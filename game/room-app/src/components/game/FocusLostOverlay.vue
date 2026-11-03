<template>
  <div class="focus-lost" role="alertdialog" aria-live="assertive" @click="refocus">
    <div class="focus-lost__card neon neon--no-hover">
      <MdIcon :path="mdiKeyboardOffOutline" :size="56" />
      <h2 class="focus-lost__title">{{ $t('room.focus.title') }}</h2>
      <p class="focus-lost__text">{{ $t('room.focus.text') }}</p>
      <p class="focus-lost__action">{{ $t('room.focus.action') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mdiKeyboardOffOutline } from '@mdi/js'

import MdIcon from '@/components/ui/MdIcon.vue'

function refocus(): void {
  window.focus()
}
</script>

<style scoped>
.focus-lost {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: var(--overlay);
  backdrop-filter: blur(6px);
  cursor: pointer;
}

.focus-lost__card {
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

.focus-lost__title {
  margin: 0;
  font-size: var(--stage-text);
  font-weight: 900;
}

.focus-lost__text {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-small);
}

.focus-lost__action {
  margin: 8px 0 0;
  color: var(--text-0);
  font-weight: 700;
  font-size: var(--stage-small);
}
</style>
