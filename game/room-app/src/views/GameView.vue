<template>
  <main v-if="state" class="game stage-bg">
    <RoomTopBar>
      <span v-if="round">{{
        $t('game.round', { current: round.position, total: state.setup.roundsCount })
      }}</span>
      <span v-if="themeName" class="game__theme">{{ themeName }}</span>
      <span v-if="questionNumber && round">
        {{ $t('game.question', { current: questionNumber, total: round.questions.length }) }}
      </span>
      <template #actions>
        <UiButton
          v-if="!isOver"
          variant="icon"
          :aria-label="$t('room.toolbar.abort')"
          :title="$t('room.toolbar.abort')"
          @click="onAbort"
        >
          <MdIcon :path="mdiStopCircleOutline" :size="20" />
        </UiButton>
      </template>
    </RoomTopBar>

    <div class="game__stage">
      <RoundIntroScreen
        v-if="phase.name === 'round_intro' && round"
        :position="round.position"
        :total="state.setup.roundsCount"
        :mini-game="round.miniGame"
      />
      <ThemeChoiceScreen
        v-else-if="phase.name === 'theme_choice' && round"
        :themes="offeredThemes"
        :chooser="getParticipant(state, round.chooserParticipantId)"
        :reason="round.chooserReason"
        :remaining-ratio="getRemaining(phase.deadline, now) / state.setup.timings.themeChoiceMs"
      />
      <BlindTestScreen
        v-else-if="blindTest"
        :view="blindTest"
        :answering="getParticipant(state, blindTest.answeringParticipantId)"
      />
      <RevealScreen
        v-else-if="reveal"
        :view="reveal"
        :winner="getParticipant(state, reveal.winnerId)"
      />
      <RoundSummaryScreen
        v-else-if="phase.name === 'round_summary' && round"
        :position="round.position"
        :is-last="round.position >= state.setup.roundsCount"
        :lines="leaderboard"
      />
      <FinishedScreen
        v-else-if="isOver"
        :lines="leaderboard"
        :aborted="phase.name === 'aborted'"
        :no-content="phase.name === 'finished' && phase.reason === 'no_content'"
        @new-game="onNewGame"
        @home="onHome"
      />
    </div>

    <ScoreBoard
      v-if="!isOver"
      :lines="leaderboard"
      :active-id="activeId"
      :locked-ids="blindTest?.lockedOutIds"
    />
  </main>
</template>

<script setup lang="ts">
import { mdiStopCircleOutline } from '@mdi/js'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

import RoomTopBar from '@/components/game/RoomTopBar.vue'
import ScoreBoard from '@/components/game/ScoreBoard.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  getBlindTestView,
  getCurrentRound,
  getLeaderboard,
  getParticipant,
  getQuestionNumber,
  getRemaining,
  getRevealView,
  getThemeName,
} from '@/game/selectors'
import { abortGame, closeGame, pressBuzzer, useRoomGame } from '@/game/useRoomGame'
import { useBuzzers } from '@/hardware/useBuzzers'
import BlindTestScreen from '@/views/game/BlindTestScreen.vue'
import FinishedScreen from '@/views/game/FinishedScreen.vue'
import RevealScreen from '@/views/game/RevealScreen.vue'
import RoundIntroScreen from '@/views/game/RoundIntroScreen.vue'
import RoundSummaryScreen from '@/views/game/RoundSummaryScreen.vue'
import ThemeChoiceScreen from '@/views/game/ThemeChoiceScreen.vue'

const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()
const { state, now } = useRoomGame()

const phase = computed(() => state.value?.phase ?? { name: 'lobby' as const })
const round = computed(() => (state.value ? getCurrentRound(state.value) : undefined))
const isOver = computed(() => phase.value.name === 'finished' || phase.value.name === 'aborted')
const leaderboard = computed(() => (state.value ? getLeaderboard(state.value) : []))
const blindTest = computed(() => (state.value ? getBlindTestView(state.value, now.value) : null))
const reveal = computed(() => (state.value ? getRevealView(state.value) : null))
const questionNumber = computed(() => (state.value ? getQuestionNumber(state.value) : null))
const themeName = computed(() =>
  state.value && round.value ? getThemeName(state.value, round.value.themeId) : ''
)
const offeredThemes = computed(() =>
  round.value && state.value
    ? round.value.offeredThemeIds.map((id) => ({ id, name: getThemeName(state.value!, id) }))
    : []
)

/** Pupitre mis en avant : celui qui répond, sinon celui qui choisit le thème. */
const activeId = computed(() => {
  if (blindTest.value?.answeringParticipantId) {
    return blindTest.value.answeringParticipantId
  }
  if (phase.value.name === 'theme_choice') {
    return round.value?.chooserParticipantId ?? null
  }
  return reveal.value?.winnerId ?? null
})

useBuzzers(pressBuzzer)

onMounted(async () => {
  // Après un rechargement, la reprise passe par l'écran de lancement : il faut un clic
  // pour rouvrir le plein écran, débloquer le son et recharger les extraits.
  if (!state.value) {
    await router.replace({ name: 'launch' })
  }
})

// Quitter l'écran (bouton Précédent, URL) en pleine partie l'arrête, après confirmation.
onBeforeRouteLeave(async () => {
  if (!state.value || isOver.value) {
    return true
  }
  const ok = await confirm({ message: t('room.toolbar.abortConfirm'), variant: 'danger' })
  if (ok) {
    abortGame()
    closeGame()
  }
  return ok
})

async function onAbort(): Promise<void> {
  const ok = await confirm({ message: t('room.toolbar.abortConfirm'), variant: 'danger' })
  if (ok) {
    abortGame()
  }
}

async function onNewGame(): Promise<void> {
  closeGame()
  await router.push({ name: 'lobby' })
}

async function onHome(): Promise<void> {
  closeGame()
  await router.push({ name: 'launch' })
}
</script>

<style scoped>
.game {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
}

.game__stage {
  display: grid;
  min-height: 0;
  padding: 0 clamp(16px, 3vw, 48px);
  overflow-y: auto;
}

.game__theme {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: var(--surface-1);
  color: var(--text-0);
}
</style>
