<template>
  <SelectField
    class="lang-select"
    :model-value="currentLocale"
    :options="localeOptions"
    :aria-label="$t('navbar.language')"
    @update:model-value="onChange"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import SelectField from '@/components/ui/form/SelectField.vue'
import type { LocaleCode } from '@/plugins/i18n'
import type { SelectFieldOption } from '@/types/form'

defineProps<{
  currentLocale: LocaleCode
}>()

const emit = defineEmits<{
  (e: 'set-locale', value: LocaleCode): void
}>()

const { t } = useI18n()

// Une liste déroulante (et non des boutons) : prête à accueillir beaucoup de langues.
const localeOptions = computed<SelectFieldOption[]>(() => [
  { value: 'fr', label: t('navbar.lang.fr.name') },
  { value: 'en', label: t('navbar.lang.en.name') },
])

function onChange(value: string): void {
  if (value === 'fr' || value === 'en') {
    emit('set-locale', value satisfies LocaleCode)
  }
}
</script>

<style scoped>
.lang-select {
  width: 100%;
}
</style>
