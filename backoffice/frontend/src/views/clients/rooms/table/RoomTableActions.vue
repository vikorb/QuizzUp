<template>
  <div class="actions">
    <RoomTableActionsSwitch
      :company-id="props.companyId"
      :room="props.item"
      :disabled="deleteBusy"
      @updated="handleRoomUpdated"
      @error="handleActionError"
      @busy-change="handleSwitchBusyChange"
    />

    <UiButton
      class="icon icon-edit"
      variant="icon"
      type="button"
      :disabled="isBusy || isDeleted"
      :title="$t('rooms.table.actions.edit')"
      :aria-label="$t('rooms.table.actions.edit')"
      @click="handleEditRoom"
    >
      <MdIcon :path="mdiPencilOutline" :size="18" />
    </UiButton>

    <UiButton
      class="icon icon-delete"
      variant="icon"
      type="button"
      :disabled="isBusy || isDeleted"
      :title="$t('rooms.table.actions.delete')"
      :aria-label="$t('rooms.table.actions.delete')"
      @click="handleDeleteRoom"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiPencilOutline } from '@mdi/js'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { deleteRoomService } from '@/services/roomsService'
import type { Room, RoomTableRow } from '@/types/room'
import { getRoomDisplayName } from '@/utils/room/list'
import { isRoomDeleted } from '@/utils/room/status'

import RoomTableActionsSwitch from './RoomTableActionsSwitch.vue'

const props = defineProps<{
  companyId: number
  item: RoomTableRow
}>()

const emit = defineEmits<{
  (event: 'edit', roomId: number): void
  (event: 'updated', room: Room): void
  (event: 'deleted', roomId: number): void
  (event: 'error', errorCode: string): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()
const deleteBusy = ref(false)
const switchBusy = ref(false)

const isBusy = computed(() => deleteBusy.value || switchBusy.value)
const isDeleted = computed(() => isRoomDeleted(props.item.status))

function handleSwitchBusyChange(value: boolean): void {
  switchBusy.value = value
}

function handleRoomUpdated(updatedRoom: Room): void {
  emit('updated', updatedRoom)
}

function handleActionError(errorCode: string): void {
  emit('error', errorCode)
}

function handleEditRoom(): void {
  if (isBusy.value || isDeleted.value) {
    return
  }

  emit('edit', props.item.id)
}

async function handleDeleteRoom(): Promise<void> {
  if (isBusy.value || isDeleted.value) {
    return
  }

  const confirmed = await confirm({
    title: t('rooms.table.actions.delete'),
    message: t('rooms.table.actions.deleteConfirm', {
      name: getRoomDisplayName(props.item),
    }),
    confirmLabel: t('rooms.table.actions.delete'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  deleteBusy.value = true

  try {
    const result = await deleteRoomService(props.companyId, props.item.id)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.room)
    emit('deleted', props.item.id)
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

/* Icônes d'action codées couleur : éditer = bleu doux, supprimer = danger. */
.icon-edit {
  color: var(--edit);
}

.icon-delete {
  color: var(--danger);
}
</style>
