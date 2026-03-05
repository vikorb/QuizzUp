<template>
  <div class="seg-wrapper" role="tablist" aria-label="Language">
    <UiButton
      class="seg-btn"
      :class="{ 'is-active': currentLocale === 'fr' }"
      variant="seg"
      type="button"
      role="tab"
      :aria-selected="currentLocale === 'fr'"
      @click="$emit('set-locale', 'fr')"
    >
      <span class="seg-code">{{ $t('navbar.lang.fr.code') }}</span>
      <span class="seg-name">{{ $t('navbar.lang.fr.name') }}</span>
    </UiButton>

    <UiButton
      class="seg-btn"
      :class="{ 'is-active': currentLocale === 'en' }"
      variant="seg"
      type="button"
      role="tab"
      :aria-selected="currentLocale === 'en'"
      @click="$emit('set-locale', 'en')"
    >
      <span class="seg-code">{{ $t('navbar.lang.en.code') }}</span>
      <span class="seg-name">{{ $t('navbar.lang.en.name') }}</span>
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue'
import type { LocaleCode } from '@/plugins/i18n'

defineProps<{
  currentLocale: LocaleCode
}>()

defineEmits<{
  (e: 'set-locale', value: LocaleCode): void
}>()
</script>

<style scoped>
.seg-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.seg-btn {
  width: 100%;
}

.seg-code {
  font-weight: 900;
  letter-spacing: 0.06em;
}

.seg-name {
  font-size: 12px;
  color: var(--text-2);
}

.seg-btn.is-active .seg-name {
  color: rgba(255, 255, 255, 0.9);
}
</style>
