<template>
  <div class="theme-switch">
    <SwitchField
      :model-value="isActive"
      :disabled="isSwitchDisabled"
      :label="switchTitle"
      @change="toggleStatus"
    />
  </div>
</template>

<script setup lang="ts">
import {
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_INACTIVE,
  type ThemeStatus,
} from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { updateThemeStatusService } from '@/services/themesService'
import type { Theme } from '@/types/theme'
import { canUpdateThemeStatus } from '@/utils/theme/permissions'

const props = withDefaults(
  defineProps<{
    theme: Theme
    currentRole: string | null
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'updated', theme: Theme): void
  (event: 'error', errorCode: string): void
  (event: 'busy-change', value: boolean): void
}>()

const { t } = useI18n()
const busy = ref(false)

const currentStatus = computed<ThemeStatus>(() => toThemeStatus(props.theme.status))
const isActive = computed(() => currentStatus.value === THEME_STATUS_ACTIVE)
const isDeleted = computed(() => currentStatus.value === THEME_STATUS_DELETED)

const canChangeStatus = computed(() =>
  canUpdateThemeStatus(props.theme, props.currentRole),
)

const isSwitchDisabled = computed(
  () => props.disabled || busy.value || isDeleted.value || !canChangeStatus.value,
)

const switchTitle = computed(() =>
  isActive.value ? t('themes.actions.disable') : t('themes.actions.enable'),
)

function toThemeStatus(status: unknown): ThemeStatus {
  if (
    status === THEME_STATUS_ACTIVE ||
    status === THEME_STATUS_INACTIVE ||
    status === THEME_STATUS_DELETED
  ) {
    return status
  }

  return THEME_STATUS_INACTIVE
}

function setBusy(value: boolean): void {
  busy.value = value
  emit('busy-change', value)
}

async function toggleStatus(): Promise<void> {
  if (isSwitchDisabled.value) {
    return
  }

  const nextStatus = isActive.value ? THEME_STATUS_INACTIVE : THEME_STATUS_ACTIVE

  const confirmKey = isActive.value
    ? 'themes.actions.disableConfirm'
    : 'themes.actions.enableConfirm'

  const confirmed = window.confirm(
    t(confirmKey, {
      theme: props.theme.name,
    }),
  )

  if (!confirmed) {
    return
  }

  setBusy(true)

  try {
    const result = await updateThemeStatusService(props.theme.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.theme)
  } finally {
    setBusy(false)
  }
}
</script>

<style scoped>
.theme-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
