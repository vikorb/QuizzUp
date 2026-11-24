<template>
  <BaseCard
    id="room-diagnostic"
    :title="$t('rooms.diagnostic.title', { name: roomName })"
    :no-hover="true"
    :loading="state === 'connecting'"
    :loading-label="$t('rooms.diagnostic.loading')"
    class="room-diagnostic-card"
  >
    <template #actions>
      <RoomPresenceBadge :room="room" :uncertain="uncertain" :now="now" />
    </template>

    <p v-if="errorKey" class="room-diagnostic__error" role="alert" data-test="diagnostic-error">
      {{ $t(errorKey) }}
    </p>

    <dl class="room-diagnostic__rows">
      <div
        v-for="row in rows"
        :key="row.id"
        class="room-diagnostic__row"
        :data-test="`diagnostic-row-${row.id}`"
      >
        <dt>{{ row.label }}</dt>
        <dd>
          <StatusPill v-if="row.tone" :tone="row.tone" :label="row.value" />
          <span v-else class="room-diagnostic__text">{{ row.value }}</span>
        </dd>
      </div>
    </dl>
  </BaseCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import RoomPresenceBadge from '@/components/ui/RoomPresenceBadge.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import { useLiveCompany } from '@/composables/useLiveCompany'
import type { Room } from '@/types/room'
import { getRoomDiagnosticRows } from '@/utils/room/diagnostics'
import { getRoomDisplayName } from '@/utils/room/list'

const props = defineProps<{
  companyId: number
  room: Room
}>()

const { t, locale } = useI18n()

// Le flux n'est ouvert que le temps où le bloc est affiché (lecture seule, rien n'est enregistré).
const { rooms, state, errorKey, uncertain, now } = useLiveCompany(() => props.companyId)

const roomName = computed(() => getRoomDisplayName(props.room))
const room = computed(() => rooms.value[props.room.id] ?? null)
const rows = computed(() =>
  getRoomDiagnosticRows(room.value, uncertain.value, t, String(locale.value))
)
</script>

<style scoped>
.room-diagnostic-card {
  margin-top: 10px;
  scroll-margin-top: 90px;
}

.room-diagnostic__rows {
  display: grid;
  margin: 0;
}

.room-diagnostic__row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 2fr;
  align-items: center;
  gap: 8px 16px;
  min-height: 48px;
  border-bottom: 1px solid var(--border);
}

.room-diagnostic__row:last-child {
  border-bottom: none;
}

.room-diagnostic__row dt {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}

.room-diagnostic__row dd {
  margin: 0;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.room-diagnostic__error {
  margin: 0 0 8px;
  color: var(--danger);
}

@media (max-width: 600px) {
  .room-diagnostic__row {
    grid-template-columns: 1fr;
    padding: 8px 0;
  }
}
</style>
