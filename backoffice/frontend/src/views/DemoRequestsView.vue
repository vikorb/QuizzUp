<template>
  <SectionLayout
    data-surface="console"
    :title="$t('demoRequests.title')"
    :subtitle="$t('demoRequests.subtitle')"
  >
    <BaseToolBar
      :title="$t('filters')"
      :reset-label="$t('resetFilters')"
      :reset-icon="mdiRefresh"
      :reset-disabled="filter === DEFAULT_FILTER"
      @reset="filter = DEFAULT_FILTER"
    >
      <SelectField
        id="demo-requests-filter"
        :model-value="filter"
        :label="$t('demoRequests.filters.label')"
        :options="filterOptions"
        @update:model-value="handleFilterChange"
      />
    </BaseToolBar>

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <BaseCard
      :title="$t('demoRequests.table.title')"
      :neon="true"
      :no-hover="true"
      :loading="isLoading"
      :error="loadErrorCode"
      :empty="visibleRequests.length === 0"
      :loading-label="$t('demoRequests.table.loading')"
      :empty-label="$t('demoRequests.table.empty')"
      error-namespace="demoRequests.errors"
      class="demo-requests-card"
    >
      <template #actions>
        <UiButton v-if="loadErrorCode" variant="default" type="button" @click="loadDemoRequests">
          {{ $t('demoRequests.table.retry') }}
        </UiButton>
      </template>

      <BaseTable :columns="columns" :items="tableItems" row-key="id">
        <template #cell-createdAt="{ value }">
          <span class="num">{{ formatDate(value) }}</span>
        </template>

        <template #cell-name="{ item }">
          <span class="name">{{ item.name }}</span>
          <span class="sub">{{ item.centerName }}</span>
        </template>

        <template #cell-email="{ item }">
          <span class="email">{{ item.email }}</span>
          <span v-if="item.phone" class="sub num">{{ item.phone }}</span>
        </template>

        <template #cell-roomsCount="{ value }">
          <span class="num">{{ value }}</span>
        </template>

        <template #cell-message="{ value }">
          <span v-if="value" class="message" :title="String(value)">{{ value }}</span>
          <span v-else class="sub">—</span>
        </template>

        <template #cell-processedAt="{ value }">
          <StatusPill
            :tone="value ? 'ok' : 'warn'"
            :label="value ? $t('demoRequests.status.processed') : $t('demoRequests.status.pending')"
          />
        </template>

        <template #cell-actions="{ item }">
          <div class="actions">
            <UiButton
              v-if="!item.processedAt"
              class="icon"
              variant="icon"
              type="button"
              :disabled="busyId === item.id"
              :title="$t('demoRequests.actions.markProcessed')"
              :aria-label="$t('demoRequests.actions.markProcessed')"
              @click="markProcessed(toDemoRequest(item))"
            >
              <MdIcon :path="mdiCheckCircleOutline" :size="18" />
            </UiButton>

            <UiButton
              class="icon icon-delete"
              variant="icon"
              type="button"
              :disabled="busyId === item.id"
              :title="$t('demoRequests.actions.delete')"
              :aria-label="$t('demoRequests.actions.delete')"
              @click="deleteRequest(toDemoRequest(item))"
            >
              <MdIcon :path="mdiDeleteOutline" :size="18" />
            </UiButton>
          </div>
        </template>
      </BaseTable>
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import { mdiCheckCircleOutline, mdiDeleteOutline, mdiRefresh } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseTable, { type BaseTableColumn } from '@/components/ui/BaseTable.vue'
import BaseToolBar from '@/components/ui/BaseToolBar.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  deleteDemoRequestService,
  loadDemoRequestsService,
  updateDemoRequestService,
} from '@/services/demoRequestsService'
import type { ActionBanner } from '@/types/banner'
import type { DemoRequest, DemoRequestFilter } from '@/types/demoRequest'
import {
  createErrorBanner,
  createSuccessBanner,
  getBannerMessage,
  getBannerVariant,
} from '@/utils/banner'

const DEFAULT_FILTER: DemoRequestFilter = 'pending'
const FILTERS: DemoRequestFilter[] = ['pending', 'processed', 'all']

const { t, locale } = useI18n()
const { confirm } = useConfirm()

const demoRequests = ref<DemoRequest[]>([])
const filter = ref<DemoRequestFilter>(DEFAULT_FILTER)
const isLoading = ref(false)
const loadErrorCode = ref<string | null>(null)
const busyId = ref<number | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getBannerMessage(actionBanner.value, t))

const filterOptions = computed(() =>
  FILTERS.map((value) => ({ value, label: t(`demoRequests.filters.${value}`) }))
)

const columns = computed<BaseTableColumn[]>(() => [
  { key: 'createdAt', label: t('demoRequests.table.columns.createdAt') },
  { key: 'name', label: t('demoRequests.table.columns.contact') },
  { key: 'email', label: t('demoRequests.table.columns.coordinates') },
  { key: 'roomsCount', label: t('demoRequests.table.columns.rooms'), align: 'center' },
  { key: 'message', label: t('demoRequests.table.columns.message') },
  { key: 'processedAt', label: t('demoRequests.table.columns.status') },
  { key: 'actions', label: t('demoRequests.table.columns.actions'), align: 'right' },
])

const visibleRequests = computed(() =>
  demoRequests.value.filter((request) => {
    if (filter.value === 'all') {
      return true
    }

    return (request.processedAt !== null) === (filter.value === 'processed')
  })
)

const tableItems = computed(() => visibleRequests.value.map((request) => ({ ...request })))

function toDemoRequest(item: Record<string, unknown>): DemoRequest {
  return item as DemoRequest
}

function formatDate(value: unknown): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(String(value))
  )
}

function handleFilterChange(value: string): void {
  filter.value = FILTERS.find((candidate) => candidate === value) ?? DEFAULT_FILTER
}

function clearActionBanner(): void {
  actionBanner.value = null
}

async function loadDemoRequests(): Promise<void> {
  loadErrorCode.value = null
  clearActionBanner()
  isLoading.value = true

  try {
    const result = await loadDemoRequestsService()

    if (!result.ok) {
      loadErrorCode.value = result.error
      demoRequests.value = []
      return
    }

    demoRequests.value = result.data.demoRequests
  } finally {
    isLoading.value = false
  }
}

async function markProcessed(request: DemoRequest): Promise<void> {
  if (busyId.value !== null) {
    return
  }

  clearActionBanner()
  busyId.value = request.id

  try {
    const result = await updateDemoRequestService(request.id, true)

    if (!result.ok) {
      actionBanner.value = createErrorBanner(result.error)
      return
    }

    demoRequests.value = demoRequests.value.map((current) =>
      current.id === request.id ? result.data.demoRequest : current
    )
    actionBanner.value = createSuccessBanner('demoRequestProcessed')
  } finally {
    busyId.value = null
  }
}

async function deleteRequest(request: DemoRequest): Promise<void> {
  if (busyId.value !== null) {
    return
  }

  const confirmed = await confirm({
    title: t('demoRequests.actions.delete'),
    message: t('demoRequests.actions.deleteConfirm', { name: request.name }),
    confirmLabel: t('demoRequests.actions.delete'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  clearActionBanner()
  busyId.value = request.id

  try {
    const result = await deleteDemoRequestService(request.id)

    if (!result.ok) {
      actionBanner.value = createErrorBanner(result.error)
      return
    }

    demoRequests.value = demoRequests.value.filter((current) => current.id !== request.id)
    actionBanner.value = createSuccessBanner('demoRequestDeleted')
  } finally {
    busyId.value = null
  }
}

onMounted(() => {
  loadDemoRequests()
})
</script>

<style scoped>
.demo-requests-card {
  max-height: 100%;
  margin-top: 10px;
}

.name {
  display: block;
  font-weight: 800;
  color: var(--text-0);
}

.email {
  display: block;
  color: var(--text-1);
}

.sub {
  display: block;
  color: var(--text-2);
  font-size: 13px;
}

.num {
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.message {
  display: -webkit-box;
  max-width: 320px;
  overflow: hidden;
  color: var(--text-1);
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  white-space: nowrap;
}

/* Même codage couleur que la table des clients : supprimer = danger. */
.icon-delete {
  color: var(--danger);
}
</style>
