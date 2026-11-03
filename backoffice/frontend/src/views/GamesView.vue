<template>
  <SectionLayout :title="$t('games.title')" :subtitle="$t('games.subtitle')">
    <StatBar :stats="stats" />

    <GamesToolbar
      v-model:state-filter="stateFilter"
      :company-id="companyId ? String(companyId) : ''"
      :company-options="companyOptions"
      :show-company="showCompanySelector"
      :can-create="companyId !== null"
      @update:company-id="handleCompanyChange"
      @create="goToCreate"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <GamesTable
      :company-id="companyId ?? 0"
      :games="filteredGames"
      :loading="loading"
      :error="error"
      @retry="loadPage"
      @open="goToDetail"
      @aborted="handleGameAborted"
      @error="handleActionError"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { GAME_STATE_FINISHED, GAME_STATE_PENDING, GAME_STATE_RUNNING } from '@quizzup/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import StatBar, { type Stat } from '@/components/ui/StatBar.vue'
import { getCreateGameRoute, getGameDetailRoute, getGamesRoute } from '@/router/games'
import { loadCompaniesService } from '@/services/companiesService'
import { listGamesService } from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { Game, GameStateFilter } from '@/types/game'
import { createErrorBanner, createSuccessBanner, getBannerVariant } from '@/utils/banner'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { GAME_BANNER_ABORTED, GAME_BANNER_CREATED, getGameBannerMessage } from '@/utils/game/banner'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getGameRoomName } from '@/utils/game/format'
import {
  countGamesByState,
  filterGamesByState,
  isGameState,
  updateGameInList,
} from '@/utils/game/state'

import GamesTable from './games/GamesTable.vue'
import GamesToolbar from './games/GamesToolbar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const games = ref<Game[]>([])
const companies = ref<Company[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const stateFilterValue = ref<GameStateFilter>('')
const selectedCompanyId = ref<number | null>(null)

const isSuperAdmin = computed(() => isSuperadminRole(authState.me.value?.role))

// Superadmin : compagnie choisie dans le sélecteur (ou ?companyId=) ; sinon la sienne.
const companyId = computed(
  () => selectedCompanyId.value ?? resolveGameCompanyId(authState.me.value, route.query.companyId)
)

const stateFilter = computed<string>({
  get: () => stateFilterValue.value,
  set: (value) => {
    stateFilterValue.value = isGameState(value) ? value : ''
  },
})

const filteredGames = computed(() => filterGamesByState(games.value, stateFilterValue.value))

const companyOptions = computed<SelectFieldOption[]>(() =>
  companies.value.map((company) => ({
    label: company.name || `#${company.id}`,
    value: String(company.id),
  }))
)

const showCompanySelector = computed(() => isSuperAdmin.value && companyOptions.value.length > 0)

const ratioOf = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0)

const stats = computed<Stat[]>(() => {
  const total = games.value.length
  const pending = countGamesByState(games.value, GAME_STATE_PENDING)
  const running = countGamesByState(games.value, GAME_STATE_RUNNING)
  const finished = countGamesByState(games.value, GAME_STATE_FINISHED)

  return [
    { label: t('games.stats.total'), value: total },
    {
      label: t('games.stats.pending'),
      value: pending,
      tone: 'warn',
      ratio: ratioOf(pending, total),
    },
    { label: t('games.stats.running'), value: running, tone: 'ok', ratio: ratioOf(running, total) },
    {
      label: t('games.stats.finished'),
      value: finished,
      tone: 'accent',
      ratio: ratioOf(finished, total),
    },
  ]
})

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getGameBannerMessage(actionBanner.value, t))

/** Contexte de compagnie à garder dans les liens (seulement utile au superadmin). */
const companyContext = computed(() => ({
  companyId: isSuperAdmin.value ? companyId.value : null,
}))

function clearActionBanner(): void {
  actionBanner.value = null
}

async function loadCompanies(): Promise<void> {
  if (!isSuperAdmin.value) {
    return
  }

  const result = await loadCompaniesService()

  companies.value = result.ok ? result.companies : []
}

async function loadPage(): Promise<void> {
  if (companyId.value === null) {
    games.value = []
    error.value = 'invalid_params'
    return
  }

  loading.value = true
  error.value = null

  try {
    const result = await listGamesService(companyId.value)

    if (!result.ok) {
      error.value = result.error
      games.value = []
      return
    }

    games.value = result.data.games
  } catch {
    error.value = 'server_error'
    games.value = []
  } finally {
    loading.value = false
  }
}

/** Retour du formulaire de lancement : bandeau de succès, puis on nettoie l'URL. */
function showCreatedBanner(): void {
  const createdGameId = parseGameId(route.query.created)

  if (createdGameId === null) {
    return
  }

  const createdGame = games.value.find((game) => game.id === createdGameId)

  actionBanner.value = createSuccessBanner(GAME_BANNER_CREATED, {
    room: createdGame ? getGameRoomName(createdGame) : `#${createdGameId}`,
  })

  void router.replace(getGamesRoute(companyContext.value))
}

function handleCompanyChange(value: string): void {
  const nextCompanyId = parseGameId(value)

  if (nextCompanyId === null || nextCompanyId === companyId.value) {
    return
  }

  clearActionBanner()
  selectedCompanyId.value = nextCompanyId
  void router.replace(getGamesRoute({ companyId: nextCompanyId }))
}

function goToCreate(): void {
  void router.push(getCreateGameRoute(companyContext.value))
}

function goToDetail(gameId: number): void {
  void router.push(getGameDetailRoute(gameId, companyContext.value))
}

function handleGameAborted(abortedGame: Game): void {
  games.value = updateGameInList(games.value, abortedGame)

  actionBanner.value = createSuccessBanner(GAME_BANNER_ABORTED, {
    room: getGameRoomName(abortedGame),
  })
}

function handleActionError(errorCode: string): void {
  actionBanner.value = createErrorBanner(errorCode)
}

watch(selectedCompanyId, () => {
  void loadPage()
})

onMounted(async () => {
  void loadCompanies()
  await loadPage()
  showCreatedBanner()
})
</script>
