<template>
  <SectionLayout :title="$t('games.detail.title')" :subtitle="$t('games.detail.subtitle')">
    <BaseBanner
      :variant="actionBannerVariant"
      :message="actionBannerMessage"
      @dismiss="clearActionBanner"
    />

    <BaseCard
      :title="cardTitle"
      :neon="true"
      :no-hover="true"
      :loading="loading"
      :error="isNotFound ? null : error"
      :empty="isNotFound"
      :loading-label="$t('games.detail.loading')"
      :empty-label="$t('games.detail.notFound')"
      error-namespace="games.errors"
      class="game-details-card"
    >
      <template #actions>
        <UiButton
          v-if="canAbort"
          variant="danger"
          type="button"
          data-test="game-detail-abort"
          :disabled="aborting"
          @click="handleAbort"
        >
          <span class="game-details__button-content">
            <MdIcon :path="mdiStopCircleOutline" :size="18" />
            <span>{{ $t('games.actions.abort') }}</span>
          </span>
        </UiButton>

        <UiButton variant="default" type="button" @click="goBack">
          {{ $t('games.actions.back') }}
        </UiButton>
      </template>

      <dl v-if="game" class="game-details">
        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.room') }}</dt>
          <dd class="game-details__strong">{{ getGameRoomName(game) }}</dd>
        </div>

        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.state') }}</dt>
          <dd>
            <StatusPill
              :tone="getGameStateTone(game.state)"
              :label="$t(getGameStateLabelKey(game.state))"
            />
          </dd>
        </div>

        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.format') }}</dt>
          <dd>
            {{
              $t('games.detail.fields.formatValue', {
                rounds: game.roundsCount,
                questions: game.questionsPerRound,
              })
            }}
          </dd>
        </div>

        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.miniGames') }}</dt>
          <dd data-test="game-detail-mini-games">{{ miniGamesLabel }}</dd>
        </div>

        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.createdAt') }}</dt>
          <dd>{{ formatGameDate(game.createdAt, locale) }}</dd>
        </div>

        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.startedAt') }}</dt>
          <dd>{{ formatGameDate(game.startedAt, locale) }}</dd>
        </div>

        <div class="game-details__item">
          <dt>{{ $t('games.detail.fields.finishedAt') }}</dt>
          <dd>{{ formatGameDate(game.finishedAt, locale) }}</dd>
        </div>
      </dl>
    </BaseCard>

    <GameParticipantsTable v-if="game" :participants="game.participants ?? []" />
  </SectionLayout>
</template>

<script setup lang="ts">
import { mdiStopCircleOutline } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import SectionLayout from '@/components/SectionLayout.vue'
import BaseBanner from '@/components/ui/BaseBanner.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import StatusPill from '@/components/ui/StatusPill.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { getGamesRoute } from '@/router/games'
import { abortGameService, loadGameService } from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { ActionBanner } from '@/types/banner'
import type { Game } from '@/types/game'
import { createErrorBanner, createSuccessBanner, getBannerVariant } from '@/utils/banner'
import { isSuperadminRole } from '@/utils/company/details/permissions'
import { GAME_BANNER_ABORTED, getGameBannerMessage } from '@/utils/game/banner'
import { parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { formatGameDate, getGameMiniGameLabelKey, getGameRoomName } from '@/utils/game/format'
import { canAbortGame, getGameStateLabelKey, getGameStateTone } from '@/utils/game/state'

import GameParticipantsTable from './detail/GameParticipantsTable.vue'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { confirm } = useConfirm()

const game = ref<Game | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const aborting = ref(false)
const actionBanner = ref<ActionBanner | null>(null)

const companyId = computed(() => resolveGameCompanyId(authState.me.value, route.query.companyId))
const gameId = computed(() => parseGameId(route.params.gameId))

const isNotFound = computed(() => error.value === 'not_found')
const canAbort = computed(() => canAbortGame(game.value))

const cardTitle = computed(() =>
  gameId.value === null
    ? t('games.detail.title')
    : t('games.detail.infoTitle', { id: gameId.value })
)

// « Tous » quand la partie n'a pas de restriction (null ou absent), sinon les noms choisis.
const miniGamesLabel = computed(() => {
  const miniGames = game.value?.miniGames

  return miniGames?.length
    ? miniGames.map((miniGame) => t(getGameMiniGameLabelKey(miniGame))).join(', ')
    : t('games.detail.fields.miniGamesAll')
})

const actionBannerVariant = computed(() => getBannerVariant(actionBanner.value))
const actionBannerMessage = computed(() => getGameBannerMessage(actionBanner.value, t))

function clearActionBanner(): void {
  actionBanner.value = null
}

async function loadPage(): Promise<void> {
  if (companyId.value === null || gameId.value === null) {
    error.value = 'invalid_params'
    game.value = null
    return
  }

  loading.value = true
  error.value = null

  try {
    const result = await loadGameService(companyId.value, gameId.value)

    if (!result.ok) {
      error.value = result.error
      game.value = null
      return
    }

    game.value = result.data.game
  } catch {
    error.value = 'server_error'
    game.value = null
  } finally {
    loading.value = false
  }
}

async function handleAbort(): Promise<void> {
  const currentGame = game.value

  if (!currentGame || companyId.value === null || aborting.value || !canAbort.value) {
    return
  }

  const confirmed = await confirm({
    title: t('games.actions.abortTitle'),
    message: t('games.actions.abortConfirm', { room: getGameRoomName(currentGame) }),
    confirmLabel: t('games.actions.abort'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  aborting.value = true
  clearActionBanner()

  try {
    const result = await abortGameService(companyId.value, currentGame.id)

    if (!result.ok) {
      actionBanner.value = createErrorBanner(result.error)
      return
    }

    game.value = result.data.game
    actionBanner.value = createSuccessBanner(GAME_BANNER_ABORTED, {
      room: getGameRoomName(result.data.game),
    })
  } catch {
    actionBanner.value = createErrorBanner('server_error')
  } finally {
    aborting.value = false
  }
}

function goBack(): void {
  void router.push(
    getGamesRoute({
      companyId: isSuperadminRole(authState.me.value?.role) ? companyId.value : null,
    })
  )
}

onMounted(loadPage)
</script>

<style scoped>
.game-details-card {
  margin-top: 10px;
}

.game-details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 0;
}

.game-details__item {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border-ui);
  border-radius: 14px;
  background: var(--surface-0);
}

.game-details__item dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.game-details__item dd {
  margin: 0;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.game-details__strong {
  font-weight: 800;
  color: var(--text-0);
}

.game-details__button-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 900px) {
  .game-details {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .game-details {
    grid-template-columns: 1fr;
  }
}
</style>
