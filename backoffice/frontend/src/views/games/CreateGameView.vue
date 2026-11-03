<template>
  <SectionLayout :title="$t('games.create.title')" :subtitle="$t('games.create.subtitle')">
    <BaseCard
      :title="$t('games.create.cardTitle')"
      :neon="true"
      :no-hover="true"
      :error="roomsError"
      error-namespace="games.errors"
      class="game-form-card"
    >
      <template #actions>
        <UiButton variant="default" type="button" @click="goBack">
          {{ $t('games.form.cancel') }}
        </UiButton>
      </template>

      <CreateGameForm
        v-if="companyId !== null"
        :company-id="companyId"
        :rooms="rooms"
        :rooms-loading="roomsLoading"
        @created="handleCreated"
        @cancel="goBack"
      />
    </BaseCard>
  </SectionLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getGamesRoute } from '@/router/games'
import { listGameRoomsService } from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { Game, GameRoom } from '@/types/game'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { resolveGameCompanyId } from '@/utils/game/company'

import CreateGameForm from './creation/CreateGameForm.vue'

const route = useRoute()
const router = useRouter()

const rooms = ref<GameRoom[]>([])
const roomsLoading = ref(false)
const roomsError = ref<string | null>(null)

const companyId = computed(() => resolveGameCompanyId(authState.me.value, route.query.companyId))

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

// Annuler ne fait aucun appel : on revient simplement à la liste.
function goBack(): void {
  void router.push(getGamesRoute(companyContext.value))
}

function handleCreated(game: Game): void {
  void router.push(getGamesRoute({ ...companyContext.value, createdGameId: game.id }))
}

onMounted(loadRooms)
</script>

<style scoped>
.game-form-card {
  margin-top: 10px;
}
</style>
