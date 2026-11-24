<template>
  <BaseCard
    :title="$t('apiKeys.logs.title')"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :empty="!loading && !loadError && logs.length === 0"
    :loading-label="$t('apiKeys.logs.loading')"
    :empty-label="$t('apiKeys.logs.empty')"
    class="api-logs-card"
    data-test="api-logs-card"
  >
    <template #actions>
      <SelectField
        id="api-logs-key"
        class="api-logs__filter"
        :model-value="keyFilter"
        :label="$t('apiKeys.logs.filters.key')"
        :options="keyOptions"
        @update:model-value="keyFilter = String($event)"
      />

      <SelectField
        id="api-logs-status"
        class="api-logs__filter"
        :model-value="statusFilter"
        :label="$t('apiKeys.logs.filters.statusClass')"
        :options="statusOptions"
        @update:model-value="statusFilter = String($event)"
      />

      <UiButton
        variant="icon"
        type="button"
        data-test="api-logs-refresh"
        :disabled="busy"
        :title="$t('apiKeys.logs.refresh')"
        :aria-label="$t('apiKeys.logs.refresh')"
        @click="reload"
      >
        <MdIcon :path="mdiRefresh" :size="18" />
      </UiButton>
    </template>

    <p v-if="loadError" class="api-logs__error" role="alert" data-test="api-logs-error">
      {{ $t(getApiKeyErrorKey(loadError)) }}
    </p>

    <BaseTable
      v-else-if="logs.length > 0"
      :columns="columns"
      :items="logs"
      row-key="id"
      data-test="api-logs-table"
    >
      <template #cell-createdAt="{ item }">
        <time class="api-logs__num" :datetime="(item as ApiLog).createdAt">
          {{ formatGameDate((item as ApiLog).createdAt, String(locale)) }}
        </time>
      </template>

      <template #cell-keyPrefix="{ item }">
        <code class="api-logs__num">{{ (item as ApiLog).keyPrefix }}…</code>
      </template>

      <template #cell-route="{ item }">
        <code class="api-logs__route">{{ (item as ApiLog).route }}</code>
      </template>

      <template #cell-statusCode="{ item }">
        <StatusPill
          :tone="getStatusTone((item as ApiLog).statusCode)"
          :label="String((item as ApiLog).statusCode)"
        />
      </template>

      <template #cell-errorCode="{ item }">
        <span data-test="api-log-error">{{ getErrorLabel((item as ApiLog).errorCode) }}</span>
      </template>

      <template #cell-gameId="{ item }">
        <RouterLink
          v-if="(item as ApiLog).gameId !== null"
          class="api-logs__game"
          data-test="api-log-game"
          :to="{ name: 'games-detail', params: { gameId: (item as ApiLog).gameId } }"
        >
          {{ $t('apiKeys.logs.game', { id: (item as ApiLog).gameId }) }}
        </RouterLink>
        <span v-else>—</span>
      </template>
    </BaseTable>

    <p v-if="moreError" class="api-logs__error" role="alert" data-test="api-logs-more-error">
      {{ $t(getApiKeyErrorKey(moreError)) }}
    </p>

    <div v-if="nextBefore !== null" class="api-logs__more">
      <UiButton
        variant="default"
        type="button"
        data-test="api-logs-older"
        :disabled="busy"
        @click="loadOlder"
      >
        {{ $t(loadingMore ? 'apiKeys.logs.loadingOlder' : 'apiKeys.logs.older') }}
      </UiButton>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiRefresh } from '@mdi/js'
import type { ApiKey, ApiLog, ApiLogStatusClass } from '@quizzup/shared'
import { API_LOG_STATUS_CLASSES } from '@quizzup/shared'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable, { type BaseTableColumn } from '@/components/ui/BaseTable.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { listApiLogsService } from '@/services/apiKeysService'
import { getApiKeyErrorKey } from '@/utils/apiKey/errors'
import { formatGameDate } from '@/utils/game/format'

const props = defineProps<{
  companyId: number
  apiKeys: ApiKey[]
}>()

const ALL = 'all'

const { t, te, locale } = useI18n()

const logs = ref<ApiLog[]>([])
const nextBefore = ref<number | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref<string | null>(null)
const moreError = ref<string | null>(null)
const keyFilter = ref<string>(ALL)
const statusFilter = ref<string>(ALL)

// Une réponse arrivée après un changement de filtre ou de compagnie est ignorée.
let requestTicket = 0

const busy = computed(() => loading.value || loadingMore.value)

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'createdAt', label: t('apiKeys.logs.columns.createdAt') },
  { key: 'keyPrefix', label: t('apiKeys.logs.columns.keyPrefix') },
  { key: 'method', label: t('apiKeys.logs.columns.method') },
  { key: 'route', label: t('apiKeys.logs.columns.route') },
  { key: 'statusCode', label: t('apiKeys.logs.columns.statusCode') },
  { key: 'errorCode', label: t('apiKeys.logs.columns.errorCode') },
  { key: 'gameId', label: t('apiKeys.logs.columns.gameId') },
])

const keyOptions = computed(() => [
  { value: ALL, label: t('apiKeys.logs.filters.allKeys') },
  ...props.apiKeys.map((apiKey) => ({
    value: String(apiKey.id),
    label: `${apiKey.name} (${apiKey.keyPrefix}…)`,
  })),
])

const statusOptions = computed(() => [
  { value: ALL, label: t('apiKeys.logs.filters.allStatuses') },
  ...API_LOG_STATUS_CLASSES.map((statusClass) => ({
    value: statusClass,
    label: t(`apiKeys.logs.filters.statusClasses.${statusClass}`),
  })),
])

function getStatusTone(statusCode: number): 'ok' | 'warn' | 'danger' {
  if (statusCode >= 500) {
    return 'danger'
  }

  return statusCode >= 400 ? 'warn' : 'ok'
}

// Un code que l'écran ne connaît pas (version plus récente de l'API) s'affiche tel quel.
function getErrorLabel(code: string | null): string {
  if (code === null) {
    return '—'
  }

  const key = `apiKeys.logs.errorCodes.${code}`

  return te(key) ? t(key) : code
}

function parseStatusClass(value: string): ApiLogStatusClass | undefined {
  return API_LOG_STATUS_CLASSES.find((statusClass) => statusClass === value)
}

async function fetchLogs(append: boolean): Promise<void> {
  const ticket = ++requestTicket

  loadError.value = null
  moreError.value = null

  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
  }

  try {
    const result = await listApiLogsService(props.companyId, {
      apiKeyId: keyFilter.value === ALL ? undefined : Number(keyFilter.value),
      statusClass: parseStatusClass(statusFilter.value),
      before: append ? (nextBefore.value ?? undefined) : undefined,
    })

    if (ticket !== requestTicket) {
      return
    }

    if (!result.ok) {
      // Un échec de « Plus ancien » garde la liste déjà lue.
      if (append) {
        moreError.value = result.error
      } else {
        logs.value = []
        nextBefore.value = null
        loadError.value = result.error
      }

      return
    }

    logs.value = append ? [...logs.value, ...result.data.logs] : result.data.logs
    nextBefore.value = result.data.nextBefore
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

function loadOlder(): void {
  if (busy.value || nextBefore.value === null) {
    return
  }

  void fetchLogs(true)
}

watch(
  () => [props.companyId, keyFilter.value, statusFilter.value] as const,
  () => {
    logs.value = []
    nextBefore.value = null
    void fetchLogs(false)
  },
  { immediate: true }
)
</script>

<style scoped>
.api-logs-card {
  margin-top: 18px;
}

.api-logs__filter {
  width: 200px;
}

.api-logs-card :deep(.ui-btn--icon) {
  width: 48px;
  height: 48px;
  color: var(--text-2);
}

.api-logs__num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.api-logs__route {
  overflow-wrap: anywhere;
}

.api-logs__game {
  color: var(--accent-cyan);
}

.api-logs__more {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.api-logs__error {
  margin: 0;
  padding: 14px 8px;
  color: var(--danger);
}
</style>
