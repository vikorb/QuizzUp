<template>
  <div class="actions">
    <ThemesTableActionsSwitch
      :theme="props.item"
      :current-role="currentRole"
      :disabled="deleteBusy"
      @updated="handleThemeUpdated"
      @error="handleActionError"
      @busy-change="handleSwitchBusyChange"
    />

    <UiButton
      class="icon"
      variant="icon"
      type="button"
      :disabled="isBusy"
      :title="canEdit ? $t('themes.actions.edit') : $t('themes.actions.readonly')"
      :aria-label="canEdit ? $t('themes.actions.edit') : $t('themes.actions.readonly')"
      @click="handleOpenTheme"
    >
      <MdIcon :path="openIcon" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-delete"
      variant="icon"
      type="button"
      :disabled="isBusy || !canDelete"
      :title="$t('themes.actions.delete')"
      :aria-label="$t('themes.actions.delete')"
      @click="handleDeleteTheme"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiEyeOutline, mdiPencilOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { deleteThemeService } from '@/services/themesService'
import type { Theme } from '@/types/theme'
import { canDeleteTheme, canUpdateTheme } from '@/utils/theme/permissions'

import ThemesTableActionsSwitch from './ThemesTableActionsSwitch.vue'

const props = defineProps<{
  item: Theme
  currentRole: string | null
}>()

const emit = defineEmits<{
  (event: 'open', themeId: number): void
  (event: 'updated', theme: Theme): void
  (event: 'deleted', themeId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()

const deleteBusy = ref(false)
const switchBusy = ref(false)

const isBusy = computed(() => deleteBusy.value || switchBusy.value)
const canEdit = computed(() => canUpdateTheme(props.item, props.currentRole))
const canDelete = computed(() => canDeleteTheme(props.item, props.currentRole))
const openIcon = computed(() => (canEdit.value ? mdiPencilOutline : mdiEyeOutline))

function handleSwitchBusyChange(value: boolean): void {
  switchBusy.value = value
}

function handleThemeUpdated(updatedTheme: Theme): void {
  emit('updated', updatedTheme)
}

function handleActionError(errorCode: string): void {
  emit('error', errorCode)
}

function handleOpenTheme(): void {
  if (isBusy.value) {
    return
  }

  emit('open', props.item.id)
}

async function handleDeleteTheme(): Promise<void> {
  if (isBusy.value || !canDelete.value) {
    return
  }

  const confirmed = window.confirm(
    t('themes.actions.deleteConfirm', {
      theme: props.item.name,
    }),
  )

  if (!confirmed) {
    return
  }

  deleteBusy.value = true

  try {
    await deleteThemeService(props.item.id)
    emit('deleted', props.item.id)
  } catch {
    emit('error', 'deleteFailed')
  } finally {
    deleteBusy.value = false
  }
}
</script>

<style scoped>
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

.icon-delete {
  color: #ff6b6b;
}
</style>
