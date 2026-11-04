<template>
  <SwitchField
    :model-value="isActive"
    :disabled="isSwitchDisabled"
    :label="switchTitle"
    @change="toggleStatus"
  />
</template>

<script setup lang="ts">
import { ROOM_STATUS_ACTIVE, ROOM_STATUS_INACTIVE } from '@quizzup/shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SwitchField from '@/components/ui/form/SwitchField.vue'
import { useConfirm } from '@/composables/useConfirm'
import { updateRoomStatusService } from '@/services/roomsService'
import type { Room, RoomTableRow } from '@/types/room'
import { getRoomDisplayName } from '@/utils/room/list'
import { isRoomActive, isRoomDeleted } from '@/utils/room/status'

const props = defineProps<{
  companyId: number
  room: RoomTableRow
  disabled?: boolean
}>()

const emit = defineEmits<{
  (event: 'updated', room: Room): void
  (event: 'error', errorCode: string): void
  (event: 'busy-change', value: boolean): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()
const busy = ref(false)
const isActive = computed(() => isRoomActive(props.room.status))
const isDeleted = computed(() => isRoomDeleted(props.room.status))
const isSwitchDisabled = computed(() => props.disabled || busy.value || isDeleted.value)
const roomName = computed(() => getRoomDisplayName(props.room))

const switchTitle = computed(() =>
  isActive.value ? t('rooms.table.actions.disable') : t('rooms.table.actions.enable')
)

function setBusy(value: boolean): void {
  busy.value = value
  emit('busy-change', value)
}

async function toggleStatus(): Promise<void> {
  if (isSwitchDisabled.value) {
    return
  }

  const nextStatus = isActive.value ? ROOM_STATUS_INACTIVE : ROOM_STATUS_ACTIVE

  const confirmKey = isActive.value
    ? 'rooms.table.actions.disableConfirm'
    : 'rooms.table.actions.enableConfirm'

  const actionLabel = isActive.value
    ? t('rooms.table.actions.disable')
    : t('rooms.table.actions.enable')

  const confirmed = await confirm({
    title: actionLabel,
    message: t(confirmKey, {
      name: roomName.value,
    }),
    confirmLabel: actionLabel,
    cancelLabel: t('confirm.cancel'),
  })

  if (!confirmed) {
    return
  }

  setBusy(true)

  try {
    const result = await updateRoomStatusService(props.companyId, props.room.id, nextStatus)

    if (!result.ok) {
      emit('error', result.error)
      return
    }

    emit('updated', result.data.room)
  } finally {
    setBusy(false)
  }
}
</script>
