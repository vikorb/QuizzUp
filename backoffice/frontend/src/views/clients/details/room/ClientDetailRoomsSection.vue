<template>
  <div v-if="canShowRoomsSection" id="rooms" class="rooms-section">
    <RoomsToolBar
      v-model="searchQuery"
      v-model:status-filter="statusFilter"
      :can-manage="canManageRooms"
      :can-see-deleted="canSeeDeletedRooms"
      @create="handleCreateRoom"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <RoomForm
      v-if="canManageRooms && formMode"
      :key="formKey"
      :mode="formMode"
      :company-id="companyId"
      :room="editedRoom"
      @saved="handleRoomSaved"
      @cancel="closeForm"
    />

    <RoomsTable
      :company-id="companyId"
      :rooms="filteredRooms"
      :loading="roomsLoading"
      :error="roomsErrorCode"
      :can-manage="canManageRooms"
      @updated="handleRoomUpdated"
      @deleted="handleRoomDeleted"
      @edit="handleEditRoom"
      @error="handleTableError"
      @retry="loadRooms"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseBanner from '@/components/ui/BaseBanner.vue'
import { loadCompanyRoomsService } from '@/services/roomsService'
import type { ActionBanner } from '@/types/banner'
import type { Room, RoomFormMode, RoomStatusFilter } from '@/types/room'
import type { TimerHandle } from '@/types/timer'
import { createErrorBanner, getBannerMessage, getBannerVariant } from '@/utils/banner'
import {
  createRoomDeletedBanner,
  createRoomSavedBanner,
  createRoomUpdatedBanner,
} from '@/utils/room/detailsBanner'
import {
  DEFAULT_ROOM_STATUS_FILTER,
  filterRooms,
  filterRoomsByStatus,
  filterVisibleRooms,
} from '@/utils/room/filters'
import {
  addRoomToList,
  findRoomById,
  removeRoomFromList,
  updateRoomInList,
} from '@/utils/room/list'
import { clearTimer, scheduleTimer } from '@/utils/timer'

import RoomForm from '../../rooms/RoomForm.vue'
import RoomsTable from '../../rooms/RoomsTable.vue'
import RoomsToolBar from '../../rooms/RoomsToolBar.vue'

const props = withDefaults(
  defineProps<{
    companyId: number
    canShowRoomsSection: boolean
    canManageRooms?: boolean
    canSeeDeletedRooms?: boolean
  }>(),
  {
    canManageRooms: false,
    canSeeDeletedRooms: false,
  }
)

const { t } = useI18n()
const rooms = ref<Room[]>([])
const roomsLoading = ref(false)
const roomsErrorCode = ref<string | null>(null)
const searchQuery = ref('')
const statusFilter = ref<RoomStatusFilter>(DEFAULT_ROOM_STATUS_FILTER)
const formMode = ref<RoomFormMode | null>(null)
const editedRoomId = ref<number | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const actionBannerTimer = ref<TimerHandle | null>(null)
const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const editedRoom = computed(() =>
  editedRoomId.value === null ? null : (findRoomById(rooms.value, editedRoomId.value) ?? null)
)

const formKey = computed(() => `${formMode.value ?? 'closed'}-${editedRoomId.value ?? 'new'}`)

const filteredRooms = computed(() => {
  if (!props.canShowRoomsSection) {
    return []
  }

  const visibleRooms = filterVisibleRooms(rooms.value, props.canSeeDeletedRooms)
  const searchedRooms = filterRooms(visibleRooms, searchQuery.value)

  return filterRoomsByStatus(searchedRooms, statusFilter.value)
})

function dismissActionBannerLater(): void {
  actionBannerTimer.value = scheduleTimer(actionBannerTimer.value, () => {
    actionBanner.value = null
    actionBannerTimer.value = null
  })
}

function clearActionBanner(): void {
  actionBannerTimer.value = clearTimer(actionBannerTimer.value)
  actionBanner.value = null
}

function showSuccessBanner(banner: ActionBanner): void {
  clearActionBanner()
  actionBanner.value = banner
  dismissActionBannerLater()
}

function closeForm(): void {
  formMode.value = null
  editedRoomId.value = null
}

function resetSection(): void {
  rooms.value = []
  roomsErrorCode.value = null
  closeForm()
  clearActionBanner()
}

async function loadRooms(): Promise<void> {
  if (!props.canShowRoomsSection) {
    rooms.value = []
    roomsErrorCode.value = null
    return
  }

  if (!Number.isFinite(props.companyId)) {
    rooms.value = []
    roomsErrorCode.value = 'invalid_params'
    return
  }

  roomsErrorCode.value = null
  clearActionBanner()
  roomsLoading.value = true

  try {
    const result = await loadCompanyRoomsService(props.companyId)

    if (!props.canShowRoomsSection) {
      rooms.value = []
      roomsErrorCode.value = null
      return
    }

    if (!result.ok) {
      roomsErrorCode.value = result.error
      rooms.value = []
      return
    }

    rooms.value = result.data.rooms
  } finally {
    roomsLoading.value = false
  }
}

function handleCreateRoom(): void {
  if (!props.canShowRoomsSection || !props.canManageRooms) {
    return
  }

  editedRoomId.value = null
  formMode.value = 'create'
}

function handleEditRoom(roomId: number): void {
  if (!props.canShowRoomsSection || !props.canManageRooms) {
    return
  }

  if (!findRoomById(rooms.value, roomId)) {
    return
  }

  editedRoomId.value = roomId
  formMode.value = 'edit'
}

function handleRoomSaved(savedRoom: Room): void {
  if (!props.canShowRoomsSection) {
    return
  }

  const mode = formMode.value ?? 'create'

  rooms.value = addRoomToList(rooms.value, savedRoom)
  closeForm()
  showSuccessBanner(createRoomSavedBanner(savedRoom, mode))
}

function handleRoomUpdated(updatedRoom: Room): void {
  if (!props.canShowRoomsSection) {
    return
  }

  showSuccessBanner(createRoomUpdatedBanner(rooms.value, updatedRoom))
  rooms.value = updateRoomInList(rooms.value, updatedRoom)
}

function handleRoomDeleted(roomId: number): void {
  if (!props.canShowRoomsSection) {
    return
  }

  showSuccessBanner(createRoomDeletedBanner(rooms.value, roomId))

  if (editedRoomId.value === roomId) {
    closeForm()
  }

  // Hors superadmin, l'API ne renvoie plus les salles supprimées : on aligne la liste locale.
  if (!props.canSeeDeletedRooms) {
    rooms.value = removeRoomFromList(rooms.value, roomId)
  }
}

function handleTableError(error: string): void {
  if (!props.canShowRoomsSection) {
    return
  }

  actionBannerTimer.value = clearTimer(actionBannerTimer.value)
  actionBanner.value = createErrorBanner(error)
}

watch(
  () => [props.canShowRoomsSection, props.companyId] as const,
  ([canShowRooms]) => {
    if (!canShowRooms) {
      resetSection()
      return
    }

    loadRooms()
  },
  { immediate: true }
)

watch(
  () => props.canManageRooms,
  (canManage) => {
    if (!canManage) {
      closeForm()
    }
  }
)

onBeforeUnmount(() => {
  actionBannerTimer.value = clearTimer(actionBannerTimer.value)
})
</script>

<style scoped>
.rooms-section {
  margin-top: 18px;
  scroll-margin-top: 90px;
}
</style>
