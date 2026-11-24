<template>
  <SectionLayout :title="$t('players.title')" :subtitle="$t('players.subtitle')">
    <PlayersToolbar
      v-model:search="searchInput"
      :company-id="companyId ? String(companyId) : ''"
      :company-options="companyOptions"
      :show-company="showCompanySelector"
      :can-export="canManage"
      :exporting="exporting"
      @update:company-id="handleCompanyChange"
      @export="handleExport"
    />

    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <p v-if="searchHasAt" class="players-note" role="status">
      {{ $t('players.filters.searchByName') }}
    </p>

    <p v-if="anonymousPlayers > 0 && !loading && !error" class="players-note">
      {{ $t('players.anonymous', { count: anonymousPlayers }, anonymousPlayers) }}
    </p>

    <PlayersTable
      :players="players"
      :loading="loading"
      :error="error"
      :has-search="search !== ''"
      :can-manage="canManage"
      :busy="busy"
      @retry="loadPage"
      @unsubscribe="handleUnsubscribe"
      @erase="handleErase"
    />

    <BasePagination
      :offset="offset"
      :total="total"
      :limit="PLAYER_LIST_DEFAULT_LIMIT"
      :disabled="loading"
      @update:offset="offset = $event"
    />
  </SectionLayout>
</template>

<script setup lang="ts">
import { PLAYER_LIST_DEFAULT_LIMIT, PLAYER_SEARCH_MAX_LENGTH } from '@quizzup/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useConfirm } from '@/composables/useConfirm'
import { loadCompaniesService } from '@/services/companiesService'
import {
  erasePlayerService,
  exportPlayersService,
  listPlayersService,
  unsubscribePlayerService,
} from '@/services/playersService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Company } from '@/types/company'
import type { SelectFieldOption } from '@/types/form'
import type { Player } from '@/types/player'
import { createErrorBanner, createSuccessBanner, getBannerVariant } from '@/utils/banner'
import { canManageCompanyDetails, isSuperadminRole } from '@/utils/company/details/permissions'
import { downloadBlob } from '@/utils/dom'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getPlayersErrorKey } from '@/utils/player/errors'

import PlayersTable from './players/PlayersTable.vue'
import PlayersToolbar from './players/PlayersToolbar.vue'

const SEARCH_DEBOUNCE_MS = 300
const EXPORT_FILENAME = 'joueurs-offres.csv'

const { t } = useI18n()
const { confirm } = useConfirm()
const route = useRoute()
const router = useRouter()

const players = ref<Player[]>([])
const total = ref(0)
const anonymousPlayers = ref(0)
const offset = ref(0)
const companies = ref<Company[]>([])
const loading = ref(false)
const busy = ref(false)
const exporting = ref(false)
const error = ref<string | null>(null)
const actionBanner = ref<ActionBanner | null>(null)
// Ce que l'utilisateur tape, puis la recherche envoyée au serveur après une courte pause.
const searchInput = ref('')
const search = ref('')
const selectedCompanyId = ref<number | null>(null)

const isSuperAdmin = computed(() => isSuperadminRole(authState.me.value?.role))
// Adresses, export, désinscription et effacement : admin et superadmin (le rôle `user` n'a que la liste).
const canManage = computed(() => canManageCompanyDetails(authState.me.value?.role))

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

// La recherche porte sur le nom : une adresse tapée ici ne part jamais (elle finirait dans les journaux).
const searchHasAt = computed(() => searchInput.value.includes('@'))

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => {
  const banner = actionBanner.value

  if (!banner) {
    return null
  }

  return banner.variant === 'error'
    ? t(getPlayersErrorKey(banner.code))
    : t(`players.banners.${banner.code}`, banner.params ?? {})
})

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

/** Rang du premier joueur de la dernière page qui existe pour ce total. */
function getLastPageOffset(count: number): number {
  return count > 0
    ? Math.floor((count - 1) / PLAYER_LIST_DEFAULT_LIMIT) * PLAYER_LIST_DEFAULT_LIMIT
    : 0
}

// Une réponse plus ancienne que la dernière demande (recherche changée entre-temps) est ignorée.
let lastRequest = 0

async function loadPage(): Promise<void> {
  if (companyId.value === null) {
    players.value = []
    total.value = 0
    anonymousPlayers.value = 0
    error.value = 'invalid_params'
    return
  }

  const request = (lastRequest += 1)

  loading.value = true
  error.value = null

  try {
    const result = await listPlayersService(companyId.value, {
      search: search.value || undefined,
      limit: PLAYER_LIST_DEFAULT_LIMIT,
      offset: offset.value,
    })

    if (request !== lastRequest) {
      return
    }

    if (!result.ok) {
      error.value = result.error
      players.value = []
      total.value = 0
      anonymousPlayers.value = 0
      return
    }

    // La page demandée n'existe plus (dernier joueur de la page effacé) : le changement de
    // `offset` relance le chargement sur la dernière page qui existe.
    if (result.data.players.length === 0 && offset.value > 0) {
      offset.value = getLastPageOffset(result.data.total)
      return
    }

    players.value = result.data.players
    total.value = result.data.total
    anonymousPlayers.value = result.data.anonymousPlayers
  } catch {
    if (request === lastRequest) {
      error.value = 'server_error'
      players.value = []
      total.value = 0
      anonymousPlayers.value = 0
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

  clearActionBanner()
  selectedCompanyId.value = nextCompanyId
  void router.replace({ name: 'players', query: { companyId: String(nextCompanyId) } })
}

async function handleExport(): Promise<void> {
  if (companyId.value === null || exporting.value) {
    return
  }

  exporting.value = true
  clearActionBanner()

  try {
    const result = await exportPlayersService(companyId.value)

    if (result.ok) {
      downloadBlob(result.data, EXPORT_FILENAME)
    } else {
      actionBanner.value = createErrorBanner(result.error)
    }
  } catch {
    actionBanner.value = createErrorBanner('server_error')
  } finally {
    exporting.value = false
  }
}

/** Action sur un joueur : bandeau selon la réponse, puis la liste est relue dans tous les cas. */
async function runPlayerAction(
  run: (companyId: number, email: string) => Promise<{ ok: boolean; error?: string }>,
  player: Player,
  successCode: string
): Promise<void> {
  if (companyId.value === null || player.email === null || busy.value) {
    return
  }

  busy.value = true
  clearActionBanner()

  try {
    const result = await run(companyId.value, player.email)

    actionBanner.value = result.ok
      ? createSuccessBanner(successCode, { name: player.displayName })
      : createErrorBanner(result.error ?? 'server_error')
  } catch {
    actionBanner.value = createErrorBanner('server_error')
  } finally {
    busy.value = false
  }

  await loadPage()
}

async function handleUnsubscribe(player: Player): Promise<void> {
  const confirmed = await confirm({
    title: t('players.unsubscribe.title'),
    message: t('players.unsubscribe.message', { name: player.displayName, email: player.email }),
    confirmLabel: t('players.unsubscribe.confirm'),
    cancelLabel: t('confirm.cancel'),
  })

  if (confirmed) {
    await runPlayerAction(unsubscribePlayerService, player, 'unsubscribed')
  }
}

async function handleErase(player: Player): Promise<void> {
  const confirmed = await confirm({
    title: t('players.erase.title'),
    message: t('players.erase.message', { name: player.displayName, email: player.email }),
    confirmLabel: t('players.erase.confirm'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (confirmed) {
    await runPlayerAction(erasePlayerService, player, 'erased')
  }
}

// Une recherche change : retour à la première page. Si on y est déjà, c'est la recherche qui
// recharge ; sinon le retour à la page 0 déclenche le rechargement (watcher de `offset`).
watch([selectedCompanyId, search], () => {
  if (offset.value === 0) {
    void loadPage()
  } else {
    offset.value = 0
  }
})

watch(offset, () => {
  void loadPage()
})

let searchTimer: ReturnType<typeof setTimeout> | null = null

function clearSearchTimer(): void {
  if (searchTimer !== null) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
}

// Pas de requête à chaque frappe : la recherche part après une courte pause.
watch(searchInput, (value) => {
  clearSearchTimer()

  if (value.includes('@')) {
    return
  }

  searchTimer = setTimeout(() => {
    searchTimer = null
    search.value = value.trim().slice(0, PLAYER_SEARCH_MAX_LENGTH)
  }, SEARCH_DEBOUNCE_MS)
})

onBeforeUnmount(clearSearchTimer)

onMounted(() => {
  void loadCompanies()
  void loadPage()
})
</script>

<style scoped>
.players-note {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--text-2);
}
</style>
