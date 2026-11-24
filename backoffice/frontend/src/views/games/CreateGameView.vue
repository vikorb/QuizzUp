<template>
  <SectionLayout :title="$t(`games.${mode}.title`)" :subtitle="$t(`games.${mode}.subtitle`)">
    <BaseCard
      :title="$t(`games.${mode}.cardTitle`)"
      :neon="true"
      :no-hover="true"
      :loading="isEdit && (gameLoading || roomsLoading)"
      :loading-label="$t('games.edit.loading')"
      :error="roomsError ?? gameError"
      error-namespace="games.errors"
      class="game-form-card"
    >
      <template #actions>
        <UiButton
          v-if="roomsError ?? gameError"
          variant="default"
          type="button"
          data-test="game-form-retry"
          @click="loadAll"
        >
          {{ $t('games.form.retry') }}
        </UiButton>

        <UiButton variant="default" type="button" @click="goBack">
          {{ $t('games.form.cancel') }}
        </UiButton>
      </template>

      <LiveConnectionNote :state="liveState" :error-key="liveErrorKey" />

      <CreateGameForm
        v-if="companyId !== null && (!isEdit || editedGame)"
        :company-id="companyId"
        :rooms="rooms"
        :game="editedGame"
        :prefill="prefill"
        :rooms-loading="roomsLoading"
        :live-rooms="liveRooms"
        :live-uncertain="liveUncertain"
        :now="liveNow"
        @created="handleCreated"
        @saved="handleSaved"
        @cancel="goBack"
      />
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import { GAME_STATE_SCHEDULED } from '@quizzup/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import LiveConnectionNote from '@/components/ui/LiveConnectionNote.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useLiveCompany } from '@/composables/useLiveCompany'
import { getAgendaRoute, getGamesRoute } from '@/router/games'
import { listGameRoomsService, loadGameService } from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { Game, GameRoom } from '@/types/game'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { type AgendaSavedBanner, getLocalDate } from '@/utils/game/agenda'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getGameRoomTimeZone, parseGamePrefill } from '@/utils/game/form'

import CreateGameForm from './creation/CreateGameForm.vue'

const route = useRoute()
const router = useRouter()

const rooms = ref<GameRoom[]>([])
const roomsLoading = ref(false)
const roomsError = ref<string | null>(null)

// Même écran pour lancer, programmer et modifier une session : la route d'édition porte `gameId`.
const isEdit = route.params.gameId !== undefined
const mode = isEdit ? 'edit' : 'create'
const editedGame = ref<Game | null>(null)
const gameLoading = ref(isEdit)
const gameError = ref<string | null>(null)
// Lu une fois : le formulaire ne le consomme qu'une fois les salles chargées.
const prefill = isEdit ? undefined : parseGamePrefill(route.query)

const companyId = computed(() => resolveGameCompanyId(authState.me.value, route.query.companyId))

const {
  rooms: liveRooms,
  state: liveState,
  errorKey: liveErrorKey,
  uncertain: liveUncertain,
  now: liveNow,
} = useLiveCompany(companyId)

const companyContext = computed(() => ({
  companyId: isSuperadminRole(authState.me.value?.role) ? companyId.value : null,
}))

async function loadRooms(): Promise<void> {
  if (companyId.value === null) {
    roomsError.value = 'invalid_params'
    return
  }

  roomsLoading.value = true
  roomsError.value = null

  try {
    const result = await listGameRoomsService(companyId.value)

    if (!result.ok) {
      roomsError.value = result.error
      rooms.value = []
      return
    }

    rooms.value = result.data.rooms
  } catch {
    roomsError.value = 'server_error'
    rooms.value = []
  } finally {
    roomsLoading.value = false
  }
}

/** Seule une session encore programmée se modifie ; l'état est relu, il a pu changer depuis l'agenda. */
async function loadGame(): Promise<void> {
  const gameId = parseGameId(route.params.gameId)

  if (!isEdit) {
    return
  }

  gameLoading.value = true
  gameError.value = null
  editedGame.value = null

  try {
    if (companyId.value === null || gameId === null) {
      gameError.value = 'invalid_params'
      return
    }

    const result = await loadGameService(companyId.value, gameId)

    if (!result.ok) {
      gameError.value = result.error
    } else if (result.data.game.state !== GAME_STATE_SCHEDULED) {
      gameError.value = 'game_not_scheduled'
    } else {
      editedGame.value = result.data.game
    }
  } catch {
    gameError.value = 'server_error'
  } finally {
    gameLoading.value = false
  }
}

function loadAll(): void {
  void loadRooms()
  void loadGame()
}

function goToAgenda(): void {
  void router.push(getAgendaRoute(companyContext.value))
}

/** Retour à l'agenda sur la salle et le jour (local à la salle) de la session, avec un bandeau de succès. */
function goToAgendaOf(game: Game, saved: AgendaSavedBanner): void {
  const startsAt = game.scheduledAt ? Date.parse(game.scheduledAt) : Number.NaN

  void router.push(
    getAgendaRoute({
      ...companyContext.value,
      ...(Number.isNaN(startsAt)
        ? {}
        : {
            roomId: Number(game.roomId),
            date: getLocalDate(startsAt, getGameRoomTimeZone(rooms.value, String(game.roomId))),
          }),
      saved,
    })
  )
}

// Annuler ne fait aucun appel : on revient à l'écran d'où l'on vient (agenda ou liste).
function goBack(): void {
  if (isEdit || prefill?.scheduledAt) {
    goToAgenda()
    return
  }

  void router.push(getGamesRoute(companyContext.value))
}

// Une session programmée n'est pas lancée : la liste des parties dirait le contraire, l'agenda la montre.
function handleCreated(game: Game): void {
  if (game.scheduledAt) {
    goToAgendaOf(game, 'scheduled')
    return
  }

  void router.push(getGamesRoute({ ...companyContext.value, createdGameId: game.id }))
}

function handleSaved(game: Game): void {
  goToAgendaOf(game, 'updated')
}

onMounted(loadAll)
</script>

<style scoped>
.game-form-card {
  margin-top: 10px;
}
</style>
