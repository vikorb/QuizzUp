<template>
  <form class="game-form" novalidate @submit.prevent="onSubmit">
    <section class="game-form__section">
      <h3 class="game-form__section-title">{{ $t('games.form.sections.room') }}</h3>

      <p v-if="roomsLoading" class="game-form__notice">{{ $t('games.form.roomsLoading') }}</p>
      <p v-else-if="hasNoActiveRoom" class="game-form__notice game-form__notice--warn">
        {{ $t('games.form.noActiveRoom') }}
      </p>

      <div
        v-if="roomChangeNotice"
        class="game-form__notice game-form__notice--warn"
        role="status"
        data-test="game-room-change-notice"
      >
        <p v-if="roomChangeNotice.moved.length > 0">
          {{
            $t('games.form.roomChange.moved', {
              max: desksCount,
              list: roomChangeNotice.moved.join(', '),
            })
          }}
        </p>
        <p v-if="roomChangeNotice.removed.length > 0">
          {{ $t('games.form.roomChange.removed', { list: roomChangeNotice.removed.join(', ') }) }}
        </p>
      </div>

      <div class="game-form__grid game-form__grid--room">
        <SelectField
          id="game-room"
          v-model="form.roomId"
          :label="$t('games.form.room')"
          :placeholder="$t('games.form.roomPlaceholder')"
          :options="roomOptions"
          :disabled="isBusy || hasNoActiveRoom"
          :error="errorLabel(fieldErrors.roomId)"
          required
        />

        <FormField
          id="game-rounds"
          v-model="form.roundsCount"
          :label="$t('games.form.roundsCount')"
          name="roundsCount"
          inputmode="numeric"
          autocomplete="off"
          :hint="$t('games.form.roundsHint', { max: GAME_MAX_ROUNDS })"
          :disabled="isBusy"
          :error="errorLabel(fieldErrors.roundsCount, { max: GAME_MAX_ROUNDS })"
          required
        />

        <FormField
          id="game-questions"
          v-model="form.questionsPerRound"
          :label="$t('games.form.questionsPerRound')"
          name="questionsPerRound"
          inputmode="numeric"
          autocomplete="off"
          :hint="$t('games.form.questionsHint', { max: GAME_MAX_QUESTIONS_PER_ROUND })"
          :disabled="isBusy"
          :error="errorLabel(fieldErrors.questionsPerRound, { max: GAME_MAX_QUESTIONS_PER_ROUND })"
          required
        />
      </div>
    </section>

    <section class="game-form__section">
      <GameMiniGamesField
        :model-value="form.miniGames"
        :disabled="isBusy"
        :error="errorLabel(fieldErrors.miniGames)"
        @update:model-value="updateMiniGames"
      />
    </section>

    <section class="game-form__section">
      <div class="game-form__section-head">
        <div>
          <h3 class="game-form__section-title">{{ $t('games.form.sections.participants') }}</h3>
          <p class="game-form__notice">
            {{ $t('games.form.participantsHint', { max: desksCount }) }}
          </p>
        </div>

        <UiButton
          variant="default"
          type="button"
          data-test="game-add-participant"
          :disabled="isBusy || !canAddParticipant"
          @click="addParticipant"
        >
          <span class="game-form__button-content">
            <MdIcon :path="mdiAccountPlusOutline" :size="18" />
            <span>{{ $t('games.form.addParticipant') }}</span>
          </span>
        </UiButton>
      </div>

      <div class="game-form__participants">
        <GameParticipantFields
          v-for="(participant, index) in form.participants"
          :key="participant.key"
          :participant="participant"
          :index="index"
          :errors="getParticipantErrors(index)"
          :podium-options="getPodiumOptions(index)"
          :can-remove="canRemoveParticipant"
          :disabled="isBusy"
          @update="
            (field: GameParticipantField, value: string | boolean) =>
              updateParticipant(index, field, value)
          "
          @remove="removeParticipant(index)"
          @add-second-player="addSecondPlayer(index)"
          @remove-second-player="removeSecondPlayer(index)"
        />
      </div>
    </section>

    <FormResult :error="formError" />

    <FormActions
      :cancel-label="$t('games.form.cancel')"
      :submit-label="$t('games.form.submit')"
      :submitting-label="$t('games.form.submitting')"
      :loading="saving"
      :disabled="isBusy || hasNoActiveRoom"
      @cancel="emit('cancel')"
    />
  </form>
</template>

<script setup lang="ts">
import { mdiAccountPlusOutline } from '@mdi/js'
import type { MiniGame } from '@quizzup/shared'
import { GAME_MAX_QUESTIONS_PER_ROUND, GAME_MAX_ROUNDS } from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { createGameService } from '@/services/gamesService'
import type { SelectFieldOption } from '@/types/form'
import type {
  Game,
  GameFieldErrors,
  GameFormValues,
  GameParticipantField,
  GameParticipantFieldErrors,
  GameParticipantFormValues,
  GameRoom,
} from '@/types/game'
import { getGameErrorKey } from '@/utils/game/errors'
import {
  buildCreateGamePayload,
  canAddGameParticipant,
  canRemoveGameParticipant,
  closeGameSecondPlayer,
  createDefaultGameFormValues,
  createGameFieldErrors,
  createGameParticipantFieldErrors,
  createGameParticipantFormValues,
  fitGameParticipantsToDesks,
  getActiveGameRooms,
  getGamePodiums,
  getGameRoomDesksCount,
  getNextFreePodium,
  hasGameFormErrors,
  openGameSecondPlayer,
  validateGameForm,
} from '@/utils/game/form'

import GameMiniGamesField from './GameMiniGamesField.vue'
import GameParticipantFields from './GameParticipantFields.vue'

/** Erreurs de l'API qui concernent le choix de la salle. */
const ROOM_ERROR_CODES = ['room_busy', 'room_inactive', 'room_not_found']

const props = withDefaults(
  defineProps<{
    companyId: number
    rooms: GameRoom[]
    roomsLoading?: boolean
  }>(),
  {
    roomsLoading: false,
  }
)

const emit = defineEmits<{
  (event: 'created', game: Game): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

const form = reactive<GameFormValues>(createDefaultGameFormValues())
const fieldErrors = reactive<GameFieldErrors>(createGameFieldErrors())
const saving = ref(false)
const formError = ref<string | null>(null)
/** Avertissement après un changement de salle qui a déplacé ou retiré des participants. */
const roomChangeNotice = ref<{ moved: string[]; removed: string[] } | null>(null)

const isBusy = computed(() => saving.value || props.roomsLoading)
const activeRooms = computed(() => getActiveGameRooms(props.rooms))
const hasNoActiveRoom = computed(() => !props.roomsLoading && activeRooms.value.length === 0)
// Pupitres de la salle choisie : seuls ceux-là sont proposés (4 tant qu'aucune salle n'est choisie).
const desksCount = computed(() => getGameRoomDesksCount(props.rooms, form.roomId))
const canAddParticipant = computed(() => canAddGameParticipant(form.participants, desksCount.value))
const canRemoveParticipant = computed(() => canRemoveGameParticipant(form.participants))

const roomOptions = computed<SelectFieldOption[]>(() =>
  activeRooms.value.map((room) => ({
    label: room.name,
    value: String(room.id),
  }))
)

// Une seule salle active : on la présélectionne pour gagner un clic à l'opérateur.
watch(
  activeRooms,
  (rooms) => {
    if (!form.roomId && rooms.length === 1) {
      form.roomId = String(rooms[0].id)
    }
  },
  { immediate: true }
)

function describeParticipant(participant: GameParticipantFormValues, index: number): string {
  const name =
    participant.displayName.trim() || t('games.form.roomChange.participant', { n: index + 1 })

  return `${name} (${t('games.form.podiumOption', { podium: participant.podium })})`
}

// Autre salle, autres pupitres : les participants hors de la nouvelle salle changent de pupitre
// (premier libre) ; s'il n'y a plus de place, les derniers sont retirés. Rien n'est fait en
// silence : un avertissement nomme les participants déplacés (avec leur nouveau pupitre) et retirés.
watch(desksCount, (count) => {
  const before = form.participants.map((participant) => ({
    key: participant.key,
    podium: participant.podium,
  }))
  const removedIndexes = fitGameParticipantsToDesks(form.participants, count)
  const removed = removedIndexes
    .map((index) => {
      return describeParticipant(form.participants[index], index)
    })
    .reverse()
  const moved = form.participants
    .map((participant, index) => ({ participant, index }))
    .filter(({ participant, index }) => participant.podium !== before[index].podium)
    .filter(({ index }) => !removedIndexes.includes(index))
    .map(({ participant, index }) => describeParticipant(participant, index))

  for (const index of removedIndexes) {
    form.participants.splice(index, 1)
    fieldErrors.participants.splice(index, 1)
  }

  roomChangeNotice.value = moved.length > 0 || removed.length > 0 ? { moved, removed } : null

  fieldErrors.participants.forEach((errors) => {
    Object.assign(errors, { podium: '' })
  })
})

function errorLabel(
  errorKey: string,
  params?: Record<string, string | number>
): string | undefined {
  return errorKey ? t(errorKey, params ?? {}) : undefined
}

function getParticipantErrors(index: number): GameParticipantFieldErrors {
  return fieldErrors.participants[index] ?? createGameParticipantFieldErrors()
}

/** Un pupitre déjà pris par un autre participant est grisé dans la liste. */
function getPodiumOptions(index: number): SelectFieldOption[] {
  const takenPodiums = new Set(
    form.participants
      .filter((_participant, participantIndex) => participantIndex !== index)
      .map((participant) => participant.podium)
  )

  return getGamePodiums(desksCount.value).map((podium) => ({
    label: t('games.form.podiumOption', { podium }),
    value: String(podium),
    disabled: takenPodiums.has(String(podium)),
  }))
}

function resetErrors(): void {
  Object.assign(fieldErrors, createGameFieldErrors(form.participants.length))
  formError.value = null
}

function addParticipant(): void {
  const podium = getNextFreePodium(form.participants, desksCount.value)

  if (podium === null || !canAddParticipant.value) {
    return
  }

  form.participants.push(createGameParticipantFormValues(podium))
  fieldErrors.participants.push(createGameParticipantFieldErrors())
}

function removeParticipant(index: number): void {
  if (!canRemoveParticipant.value) {
    return
  }

  form.participants.splice(index, 1)
  fieldErrors.participants.splice(index, 1)
}

function clearSecondPlayerErrors(index: number): void {
  const errors = fieldErrors.participants[index]

  if (errors) {
    errors.secondDisplayName = ''
    errors.secondEmail = ''
    errors.secondEmailConsent = ''
  }
}

function addSecondPlayer(index: number): void {
  const participant = form.participants[index]

  if (participant) {
    openGameSecondPlayer(participant)
    clearSecondPlayerErrors(index)
  }
}

function removeSecondPlayer(index: number): void {
  const participant = form.participants[index]

  if (participant) {
    closeGameSecondPlayer(participant)
    clearSecondPlayerErrors(index)
  }
}

function updateParticipant(
  index: number,
  field: GameParticipantField,
  value: string | boolean
): void {
  const participant = form.participants[index]

  if (!participant) {
    return
  }

  if (field === 'emailConsent' || field === 'secondEmailConsent') {
    participant[field] = value === true
  } else {
    participant[field] = String(value)
  }

  const errors = fieldErrors.participants[index]

  // Corriger un champ efface son erreur ; vider l'email lève aussi l'exigence de consentement.
  if (errors) {
    errors[field] = ''

    if (field === 'email') {
      errors.emailConsent = ''
    } else if (field === 'secondEmail') {
      errors.secondEmailConsent = ''
    }
  }
}

function updateMiniGames(miniGames: MiniGame[]): void {
  form.miniGames = miniGames
  // Recocher un mini-jeu lève l'erreur « aucun mini-jeu ».
  fieldErrors.miniGames = ''
}

function applyApiError(code: string): void {
  if (ROOM_ERROR_CODES.includes(code)) {
    fieldErrors.roomId = getGameErrorKey(code)
    return
  }

  formError.value = t(getGameErrorKey(code))
}

async function onSubmit(): Promise<void> {
  if (isBusy.value || hasNoActiveRoom.value) {
    return
  }

  resetErrors()

  const errors = validateGameForm(form, desksCount.value)

  if (hasGameFormErrors(errors)) {
    Object.assign(fieldErrors, errors)
    return
  }

  saving.value = true

  try {
    const result = await createGameService(props.companyId, buildCreateGamePayload(form))

    if (!result.ok) {
      applyApiError(result.error)
      return
    }

    emit('created', result.data.game)
  } catch {
    applyApiError('server_error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.game-form {
  display: grid;
  gap: 18px;
}

.game-form__section {
  display: grid;
  gap: 12px;
}

.game-form__section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.game-form__section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--text-0);
}

.game-form__notice {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.game-form__notice--warn {
  padding: 10px 12px;
  border: 1px solid rgba(240, 189, 102, 0.3);
  border-radius: 12px;
  background: var(--warn-bg);
  color: var(--warn);
  font-size: 13px;
}

.game-form__grid {
  display: grid;
  gap: 14px;
}

.game-form__grid--room {
  grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
  align-items: start;
}

.game-form__participants {
  display: grid;
  gap: 12px;
}

.game-form__button-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 820px) {
  .game-form__grid--room {
    grid-template-columns: 1fr;
  }
}
</style>
