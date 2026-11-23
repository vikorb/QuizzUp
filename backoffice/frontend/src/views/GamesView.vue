<template>
  <SectionLayout :title="$t('games.title')" :subtitle="$t('games.subtitle')">
    <GamesToolbar
      v-model:state-filter="stateFilter"
      v-model:room-filter="roomFilter"
      v-model:from="fromDay"
      v-model:to="toDay"
      :room-options="roomOptions"
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

    <LiveConnectionNote :state="liveState" :error-key="liveErrorKey" />

    <GamesTable
      :company-id="companyId ?? 0"
      :games="games"
      :loading="loading"
      :error="error"
      :live-rooms="liveRooms"
      :live-uncertain="liveUncertain"
      :now="liveNow"
      @retry="loadPage"
      @open="goToDetail"
      @aborted="handleGameAborted"
      @error="handleActionError"
    />

    <BasePagination
      :offset="offset"
      :total="total"
      :limit="GAME_LIST_DEFAULT_LIMIT"
      :disabled="loading"
      @update:offset="offset = $event"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { GAME_LIST_DEFAULT_LIMIT } from '@quizzup/shared'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import LiveConnectionNote from '@/components/ui/LiveConnectionNote.vue'
import { useLiveCompany } from '@/composables/useLiveCompany'
import { getCreateGameRoute, getGameDetailRoute, getGamesRoute } from '@/router/games'
import { loadCompaniesService } from '@/services/companiesService'
import { listGameRoomsService, listGamesService } from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { Game, GameRoom, GamesQuery, GameStateFilter } from '@/types/game'
import { createErrorBanner, createSuccessBanner, getBannerVariant } from '@/utils/banner'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { GAME_BANNER_ABORTED, GAME_BANNER_CREATED, getGameBannerMessage } from '@/utils/game/banner'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getGameRoomName, getLocalDayBounds } from '@/utils/game/format'
import { isGameState, updateGameInList } from '@/utils/game/state'

import GamesTable from './games/GamesTable.vue'
import GamesToolbar from './games/GamesToolbar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const games = ref<Game[]>([])
const total = ref(0)
const offset = ref(0)
const rooms = ref<GameRoom[]>([])
const companies = ref<Company[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const stateFilterValue = ref<GameStateFilter>('')
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

const {
  rooms: liveRooms,
  state: liveState,
  errorKey: liveErrorKey,
  uncertain: liveUncertain,
  now: liveNow,
} = useLiveCompany(companyId)

const stateFilter = computed<string>({
  get: () => stateFilterValue.value,
  set: (value) => {
    stateFilterValue.value = isGameState(value) ? value : ''
  },
})

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

// Même garde que `loadPage` : les salles d'une compagnie quittée ne remplacent pas celles de la courante.
let lastRoomsRequest = 0

async function loadRooms(): Promise<void> {
  const request = (lastRoomsRequest += 1)
  const result = companyId.value === null ? null : await listGameRoomsService(companyId.value)

  if (request !== lastRoomsRequest) {
    return
  }

  rooms.value = result?.ok ? result.data.rooms : []
}

function buildQuery(): GamesQuery {
  return {
    state: stateFilterValue.value || undefined,
    roomId: parseGameId(roomFilter.value) ?? undefined,
    from: getLocalDayBounds(fromDay.value, 'start') ?? undefined,
    to: getLocalDayBounds(toDay.value, 'end') ?? undefined,
    limit: GAME_LIST_DEFAULT_LIMIT,
    offset: offset.value,
  }
}

// Une réponse plus ancienne que la dernière demande (filtre changé entre-temps) est ignorée.
let lastRequest = 0

async function loadPage(): Promise<void> {
  if (companyId.value === null) {
    games.value = []
    total.value = 0
    error.value = 'invalid_params'
    return
  }

  const request = (lastRequest += 1)

  loading.value = true
  error.value = null

  try {
    const result = await listGamesService(companyId.value, buildQuery())

    if (request !== lastRequest) {
      return
    }

    if (!result.ok) {
      error.value = result.error
      games.value = []
      total.value = 0
      return
    }

    games.value = result.data.games
    total.value = result.data.total
  } catch {
    if (request === lastRequest) {
      error.value = 'server_error'
      games.value = []
      total.value = 0
    }
  } finally {
    if (request === lastRequest) {
      loading.value = false
    }
  }
}

/** Retour du formulaire de lancement : bandeau de succès, puis on nettoie l'URL. */
function showCreatedBanner(): void {
  const createdGameId = parseGameId(route.query.created)

  if (createdGameId === null) {
    return
  }

  const createdGame = games.value.find((game) => Number(game.id) === createdGameId)

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
  roomFilter.value = ''
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
  // Avec un filtre d'état, la partie arrêtée n'a plus sa place dans la vue et `total` change : on recharge.
  if (stateFilterValue.value) {
    void loadPage()
  } else {
    games.value = updateGameInList(games.value, abortedGame)
  }

  actionBanner.value = createSuccessBanner(GAME_BANNER_ABORTED, {
    room: getGameRoomName(abortedGame),
  })
}

function handleActionError(errorCode: string): void {
  actionBanner.value = createErrorBanner(errorCode)
}

// Un filtre change : retour à la première page. Si on y est déjà, c'est le filtre qui recharge ;
// sinon le retour à la page 0 déclenche le rechargement (watcher de `offset`).
watch([selectedCompanyId, stateFilterValue, roomFilter, fromDay, toDay], () => {
  if (offset.value === 0) {
    void loadPage()
  } else {
    offset.value = 0
  }
})

watch(offset, () => {
  void loadPage()
})

watch(selectedCompanyId, () => {
  void loadRooms()
})

onMounted(async () => {
  void loadCompanies()
  void loadRooms()
  await loadPage()
  showCreatedBanner()
})
</script>
