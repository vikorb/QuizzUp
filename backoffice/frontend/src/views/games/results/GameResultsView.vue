<template>
  <main class="results-page">
    <div class="results-toolbar">
      <UiButton class="results-btn" type="button" data-test="results-back" @click="goBack">
        {{ $t('games.results.back') }}
      </UiButton>

      <UiButton
        v-if="rows.length > 0"
        class="results-btn"
        variant="primary"
        type="button"
        data-test="results-print"
        @click="printSheet"
      >
        <MdIcon :path="mdiPrinterOutline" :size="18" />
        <span>{{ $t('games.results.print') }}</span>
      </UiButton>
    </div>

    <article class="results-sheet">
      <p v-if="loading" class="results-state" role="status" data-test="results-loading">
        {{ $t('games.results.loading') }}
      </p>

      <p v-else-if="error" class="results-state" role="alert" data-test="results-error">
        {{ $t(getGameErrorKey(error)) }}
      </p>

      <p v-else-if="!canShowGameResults(game)" class="results-state" data-test="results-unfinished">
        {{ $t('games.results.notFinished') }}
      </p>

      <p v-else-if="rows.length === 0" class="results-state" data-test="results-empty">
        {{ $t('games.results.empty') }}
      </p>

      <template v-else-if="game">
        <header class="sheet-head">
          <p v-if="companyName" class="sheet-company" data-test="results-company">
            {{ companyName }}
          </p>
          <h1 class="sheet-title">{{ $t('games.results.title') }}</h1>

          <dl class="sheet-meta">
            <div>
              <dt>{{ $t('games.results.room') }}</dt>
              <dd data-test="results-room">{{ getGameRoomName(game) }}</dd>
            </div>
            <div>
              <dt>{{ $t('games.results.date') }}</dt>
              <dd data-test="results-date">{{ formatGameDate(game.finishedAt, locale) }}</dd>
            </div>
          </dl>
        </header>

        <table class="sheet-ranking">
          <thead>
            <tr>
              <th scope="col">{{ $t('games.results.columns.rank') }}</th>
              <th scope="col">{{ $t('games.results.columns.players') }}</th>
              <th scope="col" class="sheet-score">{{ $t('games.results.columns.score') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              :class="{ 'sheet-winner': row.rank === 1 }"
              data-test="results-row"
            >
              <td class="sheet-rank" data-test="results-rank">{{ row.rank }}</td>
              <td data-test="results-names">
                <span v-for="(name, index) in row.names" :key="index" class="sheet-name">{{
                  name
                }}</span>
              </td>
              <td class="sheet-score" data-test="results-score">{{ row.score }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </article>
  </main>
</template>

<script setup lang="ts">
import { mdiPrinterOutline } from '@mdi/js'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { getGameDetailRoute } from '@/router/games'
import { loadCompanyDetailsService } from '@/services/companiesService'
import { loadGameService } from '@/services/gamesService'
import { authState } from '@/state/authState'
import type { Game } from '@/types/game'
import { getGameRouteCompanyId, parseGameId, resolveGameCompanyId } from '@/utils/game/company'
import { getGameErrorKey } from '@/utils/game/errors'
import { formatGameDate, getGameRoomName } from '@/utils/game/format'
import { rankGameParticipants } from '@/utils/game/ranking'
import { canShowGameResults } from '@/utils/game/state'

const route = useRoute()
const router = useRouter()
const { locale } = useI18n()

const game = ref<Game | null>(null)
const companyName = ref('')
const loading = ref(true)
const error = ref<string | null>(null)

const companyId = computed(() => resolveGameCompanyId(authState.me.value, route.query.companyId))
const gameId = computed(() => parseGameId(route.params.gameId))

const rows = computed(() =>
  canShowGameResults(game.value) ? rankGameParticipants(game.value?.participants ?? []) : []
)

async function loadPage(): Promise<void> {
  if (companyId.value === null || gameId.value === null) {
    error.value = 'invalid_params'
    loading.value = false
    return
  }

  try {
    // Le détail d'une partie ne porte pas le nom du centre : on le lit sur la fiche de la
    // compagnie. Sans lui, la feuille reste imprimable.
    const [gameResult, companyResult] = await Promise.all([
      loadGameService(companyId.value, gameId.value),
      loadCompanyDetailsService(companyId.value).catch(() => null),
    ])

    if (!gameResult.ok) {
      error.value = gameResult.error
      return
    }

    game.value = gameResult.data.game
    companyName.value = companyResult?.ok ? companyResult.data.company.name : ''
  } catch {
    error.value = 'server_error'
  } finally {
    loading.value = false
  }
}

function printSheet(): void {
  window.print()
}

function goBack(): void {
  if (gameId.value === null) {
    void router.push({ name: 'games' })
    return
  }

  void router.push(
    getGameDetailRoute(gameId.value, {
      companyId: getGameRouteCompanyId(authState.me.value, companyId.value),
    })
  )
}

onMounted(loadPage)
</script>

<style scoped>
/* La page n'a pas de menu : elle défile seule (le corps de l'application ne défile pas). */
.results-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  padding: 22px;
  overflow-y: auto;
  color: var(--text-1);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.results-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
}

.results-btn {
  min-height: 48px;
  font-family: inherit;
}

.results-btn:focus-visible {
  outline: 2px solid var(--accent-pink);
  outline-offset: 2px;
}

/* La feuille est la même à l'écran et sur papier : encre sombre sur fond blanc. */
.results-sheet {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
  padding: 12mm;
  border-radius: var(--radius);
  background: var(--print-paper);
  color: var(--print-ink);
  box-shadow: 0 8px 28px var(--shadow-2);
}

.results-state {
  margin: 0;
  color: var(--print-ink-muted);
}

.sheet-head {
  display: grid;
  gap: 6px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--print-rule);
}

.sheet-company {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--print-ink-muted);
}

.sheet-title {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
}

.sheet-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 32px;
  margin: 8px 0 0;
}

.sheet-meta dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--print-ink-muted);
}

.sheet-meta dd {
  margin: 0;
  font-size: 16px;
}

.sheet-ranking {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.sheet-ranking th {
  padding: 8px 12px;
  border-bottom: 1px solid var(--print-ink);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  color: var(--print-ink-muted);
}

.sheet-ranking td {
  padding: 12px;
  border-bottom: 1px solid var(--print-rule);
  font-size: 18px;
  vertical-align: top;
}

.sheet-rank {
  width: 64px;
}

.sheet-name {
  display: block;
  overflow-wrap: anywhere;
}

.sheet-ranking .sheet-score {
  width: 110px;
  text-align: right;
}

.sheet-winner td {
  font-size: 22px;
  font-weight: 800;
}

@media print {
  :global(html),
  :global(body),
  :global(#app) {
    height: auto;
    overflow: visible;
    background: var(--print-paper);
  }

  .results-page {
    display: block;
    height: auto;
    padding: 0;
    overflow: visible;
    background: var(--print-paper);
  }

  .results-toolbar {
    display: none;
  }

  .results-sheet {
    max-width: none;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
