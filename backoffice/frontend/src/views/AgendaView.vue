<template>
  <SectionLayout :title="$t('agenda.title')" :subtitle="$t('agenda.subtitle')">
    <AgendaToolbar
      :room-options="roomOptions"
      :room-id="roomId"
      :date="date"
      :show-company="showCompanySelector"
      :company-id="companyId ? String(companyId) : ''"
      :company-options="companyOptions"
      :presence-room="presenceRoom"
      :presence-uncertain="liveUncertain"
      :now="liveNow"
      @update:room-id="handleRoomChange"
      @update:date="handleDateChange"
      @update:company-id="handleCompanyChange"
      @shift="handleShift"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <LiveConnectionNote :state="liveState" :error-key="liveErrorKey" />

    <p v-if="selectedRoom" class="agenda-timezone" data-test="agenda-timezone">
      {{ $t('agenda.timezone', { zone: timeZone }) }}
    </p>

    <AgendaList
      :entries="entries"
      :time-zone="timeZone"
      :now-ms="nowMs"
      :loading="loading"
      :error="error"
      :no-room="activeRooms.length === 0"
      :can-manage-settings="canManageSettings"
      :company-id="companyId ?? 0"
      :busy-game-id="busyGameId"
      @retry="load(true)"
      @schedule="goToSchedule"
      @view="goToDetail"
      @open="handleOpen"
      @cancel="handleCancel"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { ROOM_STATUS_ACTIVE } from '@quizzup/shared'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import LiveConnectionNote from '@/components/ui/LiveConnectionNote.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useLiveCompany } from '@/composables/useLiveCompany'
import { getAgendaRoute, getCreateGameRoute, getGameDetailRoute } from '@/router/games'
import { loadCompaniesService } from '@/services/companiesService'
import {
  cancelGameService,
  listGameRoomsService,
  listGamesService,
  openGameService,
} from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { Game, GameRoom } from '@/types/game'
import { createErrorBanner, createSuccessBanner, getBannerVariant } from '@/utils/banner'
import { canManageCompanyDetails, isSuperadminRole } from '@/utils/company/details/permissions'
import {
  buildAgendaTimeline,
  formatAgendaTime,
  getAgendaWindow,
  getLocalDate,
  getRoomTimezone,
  isCalendarDate,
  shiftDate,
} from '@/utils/game/agenda'
import { resolveGameCompanyId } from '@/utils/game/company'
import { getGameErrorKey } from '@/utils/game/errors'
import { getGameRoomName } from '@/utils/game/format'

import AgendaList from './agenda/AgendaList.vue'
import AgendaToolbar from './agenda/AgendaToolbar.vue'

/** Une salle ne programme pas plus de sessions par jour : la pagination n'est jamais atteinte. */
const AGENDA_PAGE_LIMIT = 200

const { t, locale } = useI18n()
const { confirm } = useConfirm()
const route = useRoute()
const router = useRouter()

const games = ref<Game[]>([])
const rooms = ref<GameRoom[]>([])
const companies = ref<Company[]>([])
const roomId = ref('')
/** Jour du calendrier de la salle (`YYYY-MM-DD`), vide tant que les salles ne sont pas chargées. */
const date = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
const busyGameId = ref<number | null>(null)
const selectedCompanyId = ref<number | null>(null)
/** Heure de la dernière lecture : sert à « non lancée » et au créneau ouvrable, sans minuterie. */
const nowMs = ref(Date.now())

const role = computed(() => authState.me.value?.role)
const isSuperAdmin = computed(() => isSuperadminRole(role.value))
const canManageSettings = computed(() => canManageCompanyDetails(role.value))

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

const activeRooms = computed(() => rooms.value.filter((room) => room.status === ROOM_STATUS_ACTIVE))

const roomOptions = computed<SelectFieldOption[]>(() =>
  activeRooms.value.map((room) => ({ label: room.name, value: String(room.id) }))
)

const selectedRoom = computed(() =>
  activeRooms.value.find((room) => String(room.id) === roomId.value)
)

const timeZone = computed(() => getRoomTimezone(selectedRoom.value?.schedule))

const presenceRoom = computed(() => liveRooms.value[Number(roomId.value)] ?? null)

const entries = computed(() =>
  date.value && selectedRoom.value
    ? buildAgendaTimeline({
        schedule: selectedRoom.value.schedule ?? null,
        date: date.value,
        now: new Date(nowMs.value),
        games: games.value,
      })
    : []
)

const companyOptions = computed<SelectFieldOption[]>(() =>
  companies.value.map((company) => ({
    label: company.name || `#${company.id}`,
    value: String(company.id),
  }))
)

const showCompanySelector = computed(() => isSuperAdmin.value && companyOptions.value.length > 0)

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => {
  const banner = actionBanner.value

  if (!banner) {
    return null
  }

  return banner.variant === 'error'
    ? t(getGameErrorKey(banner.code))
    : t(`agenda.banners.${banner.code}`, banner.params ?? {})
})

/** Contexte de compagnie à garder dans les liens (seulement utile au superadmin). */
const companyContext = computed(() => ({
  companyId: isSuperAdmin.value ? companyId.value : null,
}))

// Une réponse lente ne doit pas écraser celle d'un jour demandé après elle.
let loadSequence = 0

function clearActionBanner(): void {
  actionBanner.value = null
}

/** Garde la salle choisie si elle existe encore, sinon la première salle active ; jour = aujourd'hui. */
function ensureSelection(): void {
  if (!activeRooms.value.some((room) => String(room.id) === roomId.value)) {
    roomId.value = activeRooms.value[0] ? String(activeRooms.value[0].id) : ''
  }

  if (date.value === '') {
    date.value = getLocalDate(Date.now(), timeZone.value)
  }
}

/**
 * Lit les salles (`reloadRooms`) puis les sessions du jour affiché. `silent` : pas d'état de
 * chargement, pour rafraîchir sous les yeux de l'utilisateur (après une action, au retour du focus).
 */
async function load(reloadRooms: boolean, silent = false): Promise<void> {
  if (companyId.value === null) {
    games.value = []
    error.value = 'invalid_params'
    loading.value = false
    return
  }

  const sequence = ++loadSequence

  if (!silent) {
    loading.value = true
  }

  error.value = null

  try {
    if (reloadRooms) {
      const roomsResult = await listGameRoomsService(companyId.value)

      if (sequence !== loadSequence) {
        return
      }

      if (!roomsResult.ok) {
        rooms.value = []
        games.value = []
        error.value = roomsResult.error
        return
      }

      rooms.value = roomsResult.data.rooms
      ensureSelection()
    }

    if (!selectedRoom.value || !date.value) {
      games.value = []
      return
    }

    nowMs.value = Date.now()

    const gamesResult = await listGamesService(companyId.value, {
      roomId: selectedRoom.value.id,
      ...getAgendaWindow(date.value, timeZone.value),
      limit: AGENDA_PAGE_LIMIT,
    })

    if (sequence !== loadSequence) {
      return
    }

    if (!gamesResult.ok) {
      games.value = []
      error.value = gamesResult.error
      return
    }

    games.value = gamesResult.data.games
  } catch {
    if (sequence === loadSequence) {
      games.value = []
      error.value = 'server_error'
    }
  } finally {
    if (sequence === loadSequence) {
      loading.value = false
    }
  }
}

async function loadCompanies(): Promise<void> {
  if (!isSuperAdmin.value) {
    return
  }

  const result = await loadCompaniesService()

  companies.value = result.ok ? result.companies : []
}

function handleCompanyChange(value: string): void {
  const nextCompanyId = Number(value)

  if (!Number.isInteger(nextCompanyId) || nextCompanyId <= 0 || nextCompanyId === companyId.value) {
    return
  }

  clearActionBanner()
  selectedCompanyId.value = nextCompanyId
  roomId.value = ''
  date.value = ''
  void router.replace(getAgendaRoute({ companyId: nextCompanyId }))
  void load(true)
}

function handleRoomChange(value: string): void {
  if (value === roomId.value) {
    return
  }

  roomId.value = value
  void load(false)
}

function handleDateChange(value: string): void {
  // Un champ date vidé à la main n'est pas un jour : on garde l'affichage courant.
  if (!isCalendarDate(value) || value === date.value) {
    return
  }

  date.value = value
  void load(false)
}

function handleShift(days: number): void {
  if (date.value) {
    handleDateChange(shiftDate(date.value, days))
  }
}

function goToDetail(game: Game): void {
  void router.push(getGameDetailRoute(game.id, companyContext.value))
}

function goToSchedule(startsAt: string): void {
  void router.push(
    getCreateGameRoute({
      ...companyContext.value,
      roomId: Number(roomId.value),
      scheduledAt: startsAt,
    })
  )
}

/** Appelle une action sur une session, affiche son résultat, puis relit l'agenda (même en cas d'échec). */
async function runAction(
  game: Game,
  action: typeof openGameService,
  successCode: 'opened' | 'cancelled'
): Promise<void> {
  if (busyGameId.value !== null || companyId.value === null) {
    return
  }

  busyGameId.value = game.id

  try {
    const result = await action(companyId.value, game.id)

    actionBanner.value = result.ok
      ? createSuccessBanner(successCode, { room: getGameRoomName(game) })
      : createErrorBanner(result.error)
  } catch {
    actionBanner.value = createErrorBanner('server_error')
  } finally {
    busyGameId.value = null
  }

  await load(false, true)
}

function handleOpen(game: Game): Promise<void> {
  return runAction(game, openGameService, 'opened')
}

async function handleCancel(game: Game): Promise<void> {
  if (busyGameId.value !== null) {
    return
  }

  const confirmed = await confirm({
    title: t('agenda.actions.cancelTitle'),
    message: t('agenda.actions.cancelConfirm', {
      room: getGameRoomName(game),
      time: formatAgendaTime(game.scheduledAt ?? game.createdAt, timeZone.value, locale.value),
    }),
    confirmLabel: t('agenda.actions.cancel'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (confirmed) {
    await runAction(game, cancelGameService, 'cancelled')
  }
}

// En attendant l'événement `schedule_changed` du direct : un onglet qui reprend le focus relit l'agenda.
function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && !loading.value) {
    void load(false, true)
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)
  void loadCompanies()
  void load(true)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.agenda-timezone {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}
</style>
