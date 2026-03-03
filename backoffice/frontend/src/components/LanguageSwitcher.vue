<template>
  <div class="lang-switcher">
    <span class="lang-label">{{ $t('home.languageLabel') }}</span>
    <div class="select-wrapper">
      <select :value="getCurrentLocale()" class="ui-select" @change="handleLocaleChange">
        <option value="fr">FR</option>
        <option value="en">EN</option>
      </select>
      <span class="select-arrow">▾</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCurrentLocale, type LocaleCode,setCurrentLocale } from '@/plugins/i18n'

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

<style scoped>
.lang-switcher {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
}

.lang-label {
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.ui-select {
  appearance: none;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-light);
  color: var(--text-0);
  padding: 6px 30px 6px 12px;
  border-radius: 10px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
}

.ui-select:hover {
  border-color: var(--accent-cyan);
  background: rgba(0, 225, 255, 0.05);
}

.select-arrow {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--accent-cyan);
  font-size: 10px;
}
</style>
