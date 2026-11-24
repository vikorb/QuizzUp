<template>
  <SectionLayout :title="$t('stats.title')" :subtitle="$t('stats.subtitle')">
    <StatsToolbar
      v-model:room-filter="roomFilter"
      v-model:from="fromDay"
      v-model:to="toDay"
      :room-options="roomOptions"
      :company-id="companyId ? String(companyId) : ''"
      :company-options="companyOptions"
      :show-company="showCompanySelector"
      @update:company-id="handleCompanyChange"
    />

    <p v-if="!fromDay" class="stats-note">
      {{ $t('stats.defaultPeriod', { days: STATS_DEFAULT_PERIOD_DAYS }) }}
    </p>

    <div v-if="loading" class="stats-state" role="status">
      {{ $t('stats.loading') }}
    </div>

    <div v-else-if="error" class="stats-state stats-state--error" role="alert">
      <p>{{ $t(getStatsErrorKey(error), { days: STATS_MAX_PERIOD_DAYS }) }}</p>
      <UiButton type="button" @click="loadStats">{{ $t('stats.retry') }}</UiButton>
    </div>

    <div v-else-if="stats && isEmpty" class="stats-state">
      {{ $t('stats.empty') }}
    </div>

    <div v-else-if="stats" class="stats-content">
      <StatsSummary :stats="stats" />

      <div class="stats-details">
        <StatsRoomsCard :rooms="stats.sessions.byRoom" />
        <StatsSlotsCard :slots="stats.busiestSlots" />
      </div>
    </div>
  </SectionLayout>
</template>

<script setup lang="ts">
import { STATS_DEFAULT_PERIOD_DAYS, STATS_MAX_PERIOD_DAYS } from '@quizzup/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { loadCompaniesService } from '@/services/companiesService'
import { listGameRoomsService } from '@/services/gamesService'
import { loadStatsService } from '@/services/statsService'
import { authState } from '@/state/authState'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { GameRoom } from '@/types/game'
import type { CompanyStats, StatsQuery } from '@/types/stats'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getLocalDayBounds } from '@/utils/game/format'
import { getStatsErrorKey } from '@/utils/stats/errors'
import { getBrowserTimeZone } from '@/utils/stats/format'

import StatsRoomsCard from './stats/StatsRoomsCard.vue'
import StatsSlotsCard from './stats/StatsSlotsCard.vue'
import StatsSummary from './stats/StatsSummary.vue'
import StatsToolbar from './stats/StatsToolbar.vue'

const route = useRoute()
const router = useRouter()

const stats = ref<CompanyStats | null>(null)
const rooms = ref<GameRoom[]>([])
const companies = ref<Company[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const roomFilter = ref('')
// Jours du calendrier local (`<input type="date">`), convertis en instants pour l'API.
const fromDay = ref('')
const toDay = ref('')
const selectedCompanyId = ref<number | null>(null)

const isSuperAdmin = computed(() => isSuperadminRole(authState.me.value?.role))

// Superadmin : compagnie choisie dans le sélecteur (ou ?companyId=) ; sinon la sienne.
const companyId = computed(
  () => selectedCompanyId.value ?? resolveGameCompanyId(authState.me.value, route.query.companyId)
)

const companyOptions = computed<SelectFieldOption[]>(() =>
  companies.value.map((company) => ({
    label: company.name || `#${company.id}`,
    value: String(company.id),
  }))
)

const showCompanySelector = computed(() => isSuperAdmin.value && companyOptions.value.length > 0)

const roomOptions = computed<SelectFieldOption[]>(() =>
  rooms.value.map((room) => ({ label: room.name, value: String(room.id) }))
)

const isEmpty = computed(
  () => stats.value !== null && stats.value.sessions.finished + stats.value.sessions.aborted === 0
)

async function loadCompanies(): Promise<void> {
  if (!isSuperAdmin.value) {
    return
  }

  const result = await loadCompaniesService()

  companies.value = result.ok ? result.companies : []
}

// Même garde que `loadStats` : les salles d'une compagnie quittée ne remplacent pas celles de la courante.
let lastRoomsRequest = 0

async function loadRooms(): Promise<void> {
  const request = (lastRoomsRequest += 1)
  const result = companyId.value === null ? null : await listGameRoomsService(companyId.value)

  if (request !== lastRoomsRequest) {
    return
  }

  rooms.value = result?.ok ? result.data.rooms : []
}

function buildQuery(): StatsQuery {
  return {
    roomId: parseGameId(roomFilter.value) ?? undefined,
    from: getLocalDayBounds(fromDay.value, 'start') ?? undefined,
    to: getLocalDayBounds(toDay.value, 'end') ?? undefined,
    tz: getBrowserTimeZone(),
  }
}

// Une réponse plus ancienne que la dernière demande (filtre changé entre-temps) est ignorée.
let lastRequest = 0

async function loadStats(): Promise<void> {
  if (companyId.value === null) {
    stats.value = null
    error.value = 'invalid_params'
    return
  }

  const request = (lastRequest += 1)

  loading.value = true
  error.value = null

  try {
    const result = await loadStatsService(companyId.value, buildQuery())

    if (request !== lastRequest) {
      return
    }

    if (result.ok) {
      stats.value = result.data
    } else {
      stats.value = null
      error.value = result.error
    }
  } catch {
    if (request === lastRequest) {
      stats.value = null
      error.value = 'server_error'
    }
  } finally {
    if (request === lastRequest) {
      loading.value = false
    }
  }
}

function handleCompanyChange(value: string): void {
  const nextCompanyId = parseGameId(value)

  if (nextCompanyId === null || nextCompanyId === companyId.value) {
    return
  }

  roomFilter.value = ''
  selectedCompanyId.value = nextCompanyId
  void router.replace({ name: 'stats', query: { companyId: String(nextCompanyId) } })
}

watch([selectedCompanyId, roomFilter, fromDay, toDay], () => {
  void loadStats()
})

watch(selectedCompanyId, () => {
  void loadRooms()
})

onMounted(() => {
  void loadCompanies()
  void loadRooms()
  void loadStats()
})
</script>

<style scoped>
.stats-note {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--text-2);
}

.stats-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px 0;
  color: var(--text-2);
}

.stats-state p {
  margin: 0;
}

.stats-state--error {
  color: var(--danger);
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 18px;
}

.stats-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 18px;
  align-items: start;
}

@media (max-width: 560px) {
  .stats-details {
    grid-template-columns: 1fr;
  }
}
</style>
