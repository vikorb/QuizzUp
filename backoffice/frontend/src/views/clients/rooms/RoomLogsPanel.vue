<template>
  <BaseCard
    id="room-logs"
    :title="$t('rooms.logs.title', { name: roomName })"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="loadError"
    :empty="logs.length === 0"
    :loading-label="$t('rooms.logs.loading')"
    :empty-label="$t('rooms.logs.empty')"
    error-namespace="rooms.errors"
    class="room-logs-card"
  >
    <template #actions>
      <SelectField
        id="room-logs-level"
        class="room-logs__filter"
        :model-value="levelFilter"
        :label="$t('rooms.logs.filters.levelLabel')"
        :options="levelOptions"
        @update:model-value="handleLevelChange"
      />

      <UiButton v-if="loadError" variant="default" type="button" @click="reload">
        {{ $t('rooms.table.retry') }}
      </UiButton>

      <UiButton
        class="room-logs__refresh"
        variant="icon"
        type="button"
        :disabled="busy"
        :title="$t('rooms.logs.actions.refresh')"
        :aria-label="$t('rooms.logs.actions.refresh')"
        @click="reload"
      >
        <MdIcon :path="mdiRefresh" :size="18" />
      </UiButton>

      <UiButton
        class="room-logs__close"
        variant="icon"
        type="button"
        :title="$t('rooms.logs.actions.close')"
        :aria-label="$t('rooms.logs.actions.close')"
        @click="emit('close')"
      >
        <MdIcon :path="mdiClose" :size="18" />
      </UiButton>
    </template>

    <ul class="room-logs__list">
      <li v-for="log in logs" :key="log.id" class="room-logs__item" :data-level="log.level">
        <div class="room-logs__meta">
          <StatusPill
            :tone="getRoomLogTone(log.level)"
            :label="$t(`rooms.logs.levels.${log.level}`)"
          />
          <time class="room-logs__date" :datetime="log.occurredAt">
            {{ formatGameDate(log.occurredAt, String(locale)) }}
          </time>
          <code class="room-logs__code">{{ log.code }}</code>
          <span v-if="log.occurrences > 1" class="room-logs__count">
            {{ $t('rooms.logs.occurrences', { count: log.occurrences }) }}
          </span>
        </div>

        <p class="room-logs__message">{{ truncateRoomLogMessage(log.message) }}</p>

        <details class="room-logs__details">
          <summary>{{ $t('rooms.logs.details.toggle') }}</summary>

          <dl class="room-logs__context">
            <div class="room-logs__context-row">
              <dt>{{ $t('rooms.logs.details.appVersion') }}</dt>
              <dd>{{ log.appVersion }}</dd>
            </div>

            <div
              v-for="entry in getRoomLogContextEntries(log.context)"
              :key="entry.key"
              class="room-logs__context-row"
            >
              <dt>{{ $t(`rooms.logs.context.${entry.key}`) }}</dt>
              <dd>{{ entry.value }}</dd>
            </div>
          </dl>
        </details>
      </li>
    </ul>

    <p v-if="moreError" class="room-logs__more-error" role="alert">
      {{ $t(getApiErrorKey(moreError, 'rooms.errors')) }}
    </p>

    <div v-if="hasMore" class="room-logs__more">
      <UiButton
        class="room-logs__more-btn"
        variant="default"
        type="button"
        :disabled="busy"
        @click="loadMore"
      >
        {{ $t(loadingMore ? 'rooms.logs.actions.loadingMore' : 'rooms.logs.actions.loadMore') }}
      </UiButton>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiClose, mdiRefresh } from '@mdi/js'
import type { RoomLog } from '@quizzup/shared'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadRoomLogsService } from '@/services/roomsService'
import type { Room } from '@/types/room'
import { getApiErrorKey } from '@/utils/api'
import { formatGameDate } from '@/utils/game/format'
import { getRoomDisplayName } from '@/utils/room/list'
import {
  DEFAULT_ROOM_LOG_LEVEL_FILTER,
  getRoomLogContextEntries,
  getRoomLogLevelFilterOptions,
  getRoomLogTone,
  hasMoreRoomLogs,
  parseRoomLogLevelFilter,
  type RoomLogLevelFilter,
  truncateRoomLogMessage,
} from '@/utils/room/logs'

const props = defineProps<{
  companyId: number
  room: Room
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()

const { t, locale } = useI18n()

const logs = ref<RoomLog[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref<string | null>(null)
const moreError = ref<string | null>(null)
const hasMore = ref(false)
const levelFilter = ref<RoomLogLevelFilter>(DEFAULT_ROOM_LOG_LEVEL_FILTER)

// Une réponse arrivée après un changement de filtre ou de salle est ignorée.
let requestTicket = 0

const busy = computed(() => loading.value || loadingMore.value)
const roomName = computed(() => getRoomDisplayName(props.room))
const levelOptions = computed(() => getRoomLogLevelFilterOptions(t))

async function fetchLogs(append: boolean): Promise<void> {
  const ticket = ++requestTicket
  const lastLog = logs.value[logs.value.length - 1]

  loadError.value = null
  moreError.value = null

  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
  }

  try {
    const result = await loadRoomLogsService(props.companyId, props.room.id, {
      level: levelFilter.value === 'all' ? undefined : levelFilter.value,
      before: append ? lastLog?.id : undefined,
    })

    if (ticket !== requestTicket) {
      return
    }

    if (!result.ok) {
      // Un échec de « charger plus » garde la liste déjà lue.
      if (append) {
        moreError.value = result.error
      } else {
        logs.value = []
        hasMore.value = false
        loadError.value = result.error
      }

      return
    }

    logs.value = append ? [...logs.value, ...result.data.logs] : result.data.logs
    hasMore.value = hasMoreRoomLogs(result.data.logs)
  } finally {
    if (ticket === requestTicket) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function reload(): void {
  void fetchLogs(false)
}

function loadMore(): void {
  if (busy.value || logs.value.length === 0) {
    return
  }

  void fetchLogs(true)
}

function handleLevelChange(value: string): void {
  levelFilter.value = parseRoomLogLevelFilter(value)
}

watch(
  () => [props.companyId, props.room.id, levelFilter.value] as const,
  () => {
    logs.value = []
    hasMore.value = false
    void fetchLogs(false)
  },
  { immediate: true }
)
</script>

<style scoped>
.room-logs-card {
  margin-top: 10px;
  scroll-margin-top: 90px;
}

.room-logs__filter {
  width: 180px;
}

.room-logs-card :deep(.ui-btn--icon) {
  width: 48px;
  height: 48px;
}

.room-logs-card :deep(.ui-btn) {
  min-height: 48px;
}

.room-logs-card :deep(.ui-btn:focus-visible),
.room-logs__details summary:focus-visible {
  outline: 2px solid var(--border-hover);
  outline-offset: 2px;
}

.room-logs__close,
.room-logs__refresh {
  color: var(--text-2);
}

.room-logs__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.room-logs__item {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}

.room-logs__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  font-size: 12px;
  color: var(--text-3);
}

.room-logs__date,
.room-logs__count {
  font-variant-numeric: tabular-nums;
}

.room-logs__code {
  font-weight: 700;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.room-logs__message {
  margin: 0;
  color: var(--text-0);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.room-logs__details summary {
  display: flex;
  align-items: center;
  min-height: 48px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
  cursor: pointer;
}

.room-logs__context {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
  margin: 0 0 4px;
}

.room-logs__context-row {
  display: grid;
  gap: 2px;
}

.room-logs__context-row dt {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}

.room-logs__context-row dd {
  margin: 0;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.room-logs__more {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.room-logs__more-error {
  margin: 10px 0 0;
  color: var(--danger);
}
</style>
