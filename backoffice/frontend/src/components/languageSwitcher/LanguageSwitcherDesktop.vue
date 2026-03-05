<template>
  <div class="select-wrapper">
    <select :value="currentLocale" class="ui-select" @change="handleChange">
      <option value="fr">{{ $t('navbar.lang.fr.code') }}</option>
      <option value="en">{{ $t('navbar.lang.en.code') }}</option>
    </select>
    <span class="select-arrow">▾</span>
  </div>
</template>

<script setup lang="ts">
import type { LocaleCode } from '@/plugins/i18n'

defineProps<{
  currentLocale: LocaleCode
}>()

const emit = defineEmits<{
  (e: 'set-locale', value: LocaleCode): void
}>()

function handleChange(event: Event): void {
  const el = event.target
  if (!(el instanceof HTMLSelectElement)) return

  const selected = el.value
  if (selected !== 'fr' && selected !== 'en') return

  emit('set-locale', selected satisfies LocaleCode)
}
</script>

<style scoped>
.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.ui-select {
  appearance: none;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-ui);
  color: var(--text-0);
  padding: 6px 30px 6px 12px;
  border-radius: 10px;
  cursor: pointer;
  outline: none;
  transition: var(--tr);
}

.ui-select:hover {
  border-color: var(--border-hover);
  background: rgba(255, 255, 255, 0.07);
}

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--text-2);
  font-size: 10px;
}
</style>
