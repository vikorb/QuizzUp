<template>
  <label style="display: inline-flex; gap: 8px; align-items: center">
    <span>{{ $t('home.languageLabel') }}</span>
    <select :value="getCurrentLocale()" @change="handleLocaleChange">
      <option value="fr">{{ $t('home.languageFrench') }}</option>
      <option value="en">{{ $t('home.languageEnglish') }}</option>
    </select>
  </label>
</template>

<script setup lang="ts">
import { getCurrentLocale, type LocaleCode, setCurrentLocale } from '@/plugins/i18n'

function handleLocaleChange(event: Event): void {
  const targetElement = event.target
  if (!(targetElement instanceof HTMLSelectElement)) {
    return
  }

  const selectedLocaleValue = targetElement.value
  if (selectedLocaleValue !== 'fr' && selectedLocaleValue !== 'en') {
    return
  }

  setCurrentLocale(selectedLocaleValue satisfies LocaleCode)
}
</script>
