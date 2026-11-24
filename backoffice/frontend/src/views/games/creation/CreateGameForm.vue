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

        <!-- Le format se choisit à la création : le serveur refuse de le modifier ensuite. -->
        <SelectField
          v-if="!game"
          id="game-format"
          v-model="form.format"
          :label="$t('games.form.format')"
          :options="formatOptions"
          :disabled="isBusy"
          :error="errorLabel(fieldErrors.format)"
          required
        />
      </div>

      <div v-if="isCustomFormat" class="game-form__grid game-form__grid--counts">
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

      <p
        v-if="isCustomFormat && formPlan"
        class="game-form__notice"
        data-test="game-format-estimate"
      >
        {{
          $t('games.form.formatEstimate', { min: formPlan.minMinutes, max: formPlan.maxMinutes })
        }}
      </p>

      <RoomPresenceBadge
        v-if="selectedRoomPresence"
        :room="selectedRoomPresence.room"
        :uncertain="liveUncertain"
        :now="now"
      />
    </section>

    <section class="game-form__section" data-test="game-schedule-section">
      <h3 class="game-form__section-title">{{ $t('games.form.sections.schedule') }}</h3>

      <label v-if="!game" class="game-form__check" for="game-scheduled">
        <input
          id="game-scheduled"
          type="checkbox"
          data-test="game-scheduled"
          :checked="form.scheduled"
          :disabled="isBusy"
          @change="onScheduledChange"
        />
        <span>{{ $t('games.form.scheduled') }}</span>
      </label>

      <template v-if="form.scheduled">
        <p class="game-form__notice" data-test="game-schedule-timezone">
          {{ $t('games.form.scheduleTimezone', { zone: timeZone }) }}
        </p>

        <div class="game-form__grid game-form__grid--schedule">
          <FormField
            id="game-date"
            v-model="form.scheduledDate"
            type="date"
            name="scheduledDate"
            :label="$t('games.form.date')"
            :disabled="isBusy"
            :error="errorLabel(fieldErrors.scheduledAt)"
            required
          />

          <FormField
            id="game-time"
            v-model="form.scheduledTime"
            type="time"
            name="scheduledTime"
            :label="$t('games.form.time')"
            :disabled="isBusy"
            :invalid="!!fieldErrors.scheduledAt"
            described-by="game-date_error"
            required
          />

          <FormField
            id="game-duration"
            v-model="form.durationMinutes"
            name="durationMinutes"
            inputmode="numeric"
            autocomplete="off"
            :label="$t('games.form.durationMinutes')"
            :hint="durationHint"
            :disabled="isBusy"
            :error="errorLabel(fieldErrors.durationMinutes, durationBounds)"
          />

          <FormField
            id="game-players-count"
            v-model="form.playersCount"
            name="playersCount"
            inputmode="numeric"
            autocomplete="off"
            :label="$t('games.form.playersCount')"
            :hint="$t('games.form.playersCountHint', { max: GAME_MAX_PLAYERS })"
            :disabled="isBusy"
            :error="errorLabel(fieldErrors.playersCount, { max: GAME_MAX_PLAYERS })"
          />

          <FormField
            id="game-external-ref"
            v-model="form.externalRef"
            name="externalRef"
            autocomplete="off"
            :label="$t('games.form.externalRef')"
            :hint="$t('games.form.externalRefHint', { max: GAME_EXTERNAL_REF_MAX_LENGTH })"
            :disabled="isBusy"
            :error="errorLabel(fieldErrors.externalRef, { max: GAME_EXTERNAL_REF_MAX_LENGTH })"
          />
        </div>
      </template>
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
            {{
              $t(
                form.scheduled
                  ? 'games.form.participantsHintScheduled'
                  : 'games.form.participantsHint',
                { max: desksCount }
              )
            }}
          </p>
          <p
            v-if="participantsLocked"
            class="game-form__notice game-form__notice--warn"
            role="status"
            data-test="game-participants-locked"
          >
            {{ $t('games.form.participantsLocked') }}
          </p>
        </div>

        <UiButton
          variant="default"
          type="button"
          data-test="game-add-participant"
          :disabled="isBusy || participantsLocked || !canAddParticipant"
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
          :disabled="isBusy || participantsLocked"
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
      :submit-label="$t(submitLabels.submit)"
      :submitting-label="$t(submitLabels.submitting)"
      :loading="saving"
      :disabled="isBusy || hasNoActiveRoom"
      @cancel="emit('cancel')"
    />
  </form>
</template>

<script setup lang="ts">
import { mdiAccountPlusOutline } from '@mdi/js'
import type { MiniGame, RoomLive } from '@quizzup/shared'
import {
  GAME_EXTERNAL_REF_MAX_LENGTH,
  GAME_FORMAT_CUSTOM,
  GAME_FORMATS,
  GAME_MAX_PLAYERS,
  GAME_MAX_QUESTIONS_PER_ROUND,
  GAME_MAX_ROUNDS,
  SESSION_DEFAULT_MINUTES,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
} from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import RoomPresenceBadge from '@/components/ui/RoomPresenceBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { createGameService, updateGameService } from '@/services/gamesService'
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
  applyGamePrefill,
  buildCreateGamePayload,
  buildUpdateGamePayload,
  canAddGameParticipant,
  canRemoveGameParticipant,
  closeGameSecondPlayer,
  createDefaultGameFormValues,
  createGameFieldErrors,
  createGameFormValuesFromGame,
  createGameParticipantFieldErrors,
  createGameParticipantFormValues,
  fitGameParticipantsToDesks,
  type GamePrefill,
  getActiveGameRooms,
  getGameFormPlan,
  getGamePodiums,
  getGameRoomDesksCount,
  getGameRoomTimeZone,
  getNextFreePodium,
  hasGameFormErrors,
  hasMaskedParticipantEmails,
  openGameSecondPlayer,
  setGameScheduled,
  validateGameForm,
} from '@/utils/game/form'
import { getGameRoomName } from '@/utils/game/format'
import { getRoomPresenceKind, getRoomPresenceLabelKey } from '@/utils/room/presence'
import { isBlank } from '@/utils/validation'

import GameMiniGamesField from './GameMiniGamesField.vue'
import GameParticipantFields from './GameParticipantFields.vue'

/** Erreurs de l'API qui concernent le choix de la salle. */
const ROOM_ERROR_CODES = ['room_busy', 'room_inactive', 'room_not_found']
/** Erreurs de l'API qui concernent le jour et l'heure : elles s'affichent près du champ date. */
const SCHEDULE_ERROR_CODES = ['slot_taken', 'session_in_past', 'session_too_far']

const props = withDefaults(
  defineProps<{
    companyId: number
    rooms: GameRoom[]
    /** Session programmée à modifier : le formulaire en part et appelle la modification. */
    game?: Game | null
    /** Salle et heure lues dans l'adresse (lien d'un créneau de l'agenda), pour une création. */
    prefill?: GamePrefill
    roomsLoading?: boolean
    /** Présence des salles reçue du flux en direct ; absente, aucune présence n'est affichée. */
    liveRooms?: Record<number, RoomLive>
    liveUncertain?: boolean
    now?: number
  }>(),
  {
    game: null,
    prefill: undefined,
    roomsLoading: false,
    liveRooms: undefined,
    liveUncertain: true,
    now: 0,
  }
)

const emit = defineEmits<{
  (event: 'created', game: Game): void
  (event: 'saved', game: Game): void
  (event: 'cancel'): void
}>()

const { t } = useI18n()

const form = reactive<GameFormValues>(
  props.game
    ? createGameFormValuesFromGame(
        props.game,
        getGameRoomTimeZone(props.rooms, String(props.game.roomId))
      )
    : createDefaultGameFormValues()
)
const fieldErrors = reactive<GameFieldErrors>(createGameFieldErrors(form.participants.length))
// Un préremplissage ne vaut qu'une fois : il attend que les salles soient là, puis cède la main.
let prefillPending = !props.game && props.prefill !== undefined
const saving = ref(false)
const formError = ref<string | null>(null)
/** Avertissement après un changement de salle qui a déplacé ou retiré des participants. */
const roomChangeNotice = ref<{ moved: string[]; removed: string[] } | null>(null)

const isBusy = computed(() => saving.value || props.roomsLoading)
const activeRooms = computed(() => getActiveGameRooms(props.rooms))
// Aucune salle à choisir : ni active, ni (en modification) celle de la session.
const hasNoActiveRoom = computed(() => !props.roomsLoading && roomOptions.value.length === 0)
// Pupitres de la salle choisie : seuls ceux-là sont proposés (4 tant qu'aucune salle n'est choisie).
const desksCount = computed(() => getGameRoomDesksCount(props.rooms, form.roomId))
const canAddParticipant = computed(() => canAddGameParticipant(form.participants, desksCount.value))
// Emails masqués (rôle `user`) : renvoyer les participants les effacerait, on ne les modifie pas ici.
const participantsLocked = computed(() =>
  props.game ? hasMaskedParticipantEmails(props.game) : false
)
const canRemoveParticipant = computed(
  () => !participantsLocked.value && canRemoveGameParticipant(form.participants, form.scheduled)
)
// Jour et heure se lisent dans le fuseau de la salle choisie, comme l'agenda.
const timeZone = computed(() => getGameRoomTimeZone(props.rooms, form.roomId))
const durationBounds = { min: SESSION_MIN_MINUTES, max: SESSION_MAX_MINUTES }
const durationHint = computed(() =>
  t(props.game ? 'games.form.durationHintEdit' : 'games.form.durationHint', {
    ...durationBounds,
    default:
      props.rooms.find((room) => String(room.id) === form.roomId)?.schedule?.slotMinutes ??
      SESSION_DEFAULT_MINUTES,
  })
)
const isCustomFormat = computed(() => form.format === GAME_FORMAT_CUSTOM)
// Estimation des nombres saisis (format personnalisé) ; `null` tant qu'ils sont invalides.
const formPlan = computed(() => getGameFormPlan(form))
// Chaque format fixe annonce ses nombres et sa durée avec les mini-jeux cochés ; `custom` n'a que son nom.
const formatOptions = computed<SelectFieldOption[]>(() =>
  GAME_FORMATS.map((format) => {
    const name = t(`games.form.formats.${format}`)
    const plan = format === GAME_FORMAT_CUSTOM ? null : getGameFormPlan(form, format)

    return {
      label: plan
        ? t('games.form.formatOption', {
            name,
            rounds: plan.roundsCount,
            questions: plan.questionsPerRound,
            min: plan.minMinutes,
            max: plan.maxMinutes,
          })
        : name,
      value: format,
    }
  })
)
const submitLabels = computed(() => {
  if (props.game) {
    return { submit: 'games.form.save', submitting: 'games.form.saving' }
  }

  return form.scheduled
    ? { submit: 'games.form.submitScheduled', submitting: 'games.form.submittingScheduled' }
    : { submit: 'games.form.submit', submitting: 'games.form.submitting' }
})

function getRoomPresence(roomId: number): { room: RoomLive | null } | null {
  return props.liveRooms ? { room: props.liveRooms[roomId] ?? null } : null
}

// Une liste déroulante n'affiche pas de pastille : la présence est écrite après le nom de la salle,
// seulement quand le direct est certain (sinon le nom seul : pas de « inconnue » à chaque ligne).
function getRoomOptionLabel(room: GameRoom): string {
  const presence = props.liveUncertain ? null : getRoomPresence(room.id)

  return presence
    ? `${room.name} · ${t(getRoomPresenceLabelKey(getRoomPresenceKind(presence.room, props.liveUncertain)))}`
    : room.name
}

const selectedRoomPresence = computed(() =>
  form.roomId ? getRoomPresence(Number(form.roomId)) : null
)

// En modification, la salle actuelle reste proposée même devenue inactive : sans elle, la session
// ne s'enregistrerait plus (le serveur ne contrôle la salle que si on en change).
const roomOptions = computed<SelectFieldOption[]>(() => {
  const options = activeRooms.value.map((room) => ({
    label: getRoomOptionLabel(room),
    value: String(room.id),
  }))
  const { game } = props

  if (game && !options.some((option) => option.value === String(game.roomId))) {
    const room = props.rooms.find((item) => item.id === game.roomId)

    options.push({ label: room?.name ?? getGameRoomName(game), value: String(game.roomId) })
  }

  return options
})

function syncParticipantErrors(): void {
  fieldErrors.participants = form.participants.map(() => createGameParticipantFieldErrors())
}

// Une seule salle active : on la présélectionne pour gagner un clic à l'opérateur. Le lien d'un
// créneau de l'agenda passe après : sa salle l'emporte, et son heure se lit dans le fuseau de cette salle.
watch(
  activeRooms,
  (rooms) => {
    const [onlyRoom] = rooms

    if (!form.roomId && rooms.length === 1 && onlyRoom) {
      form.roomId = String(onlyRoom.id)
    }

    if (prefillPending && rooms.length > 0 && props.prefill) {
      prefillPending = false
      applyGamePrefill(form, props.rooms, props.prefill)
      syncParticipantErrors()
    }
  },
  { immediate: true }
)

function onScheduledChange(event: Event): void {
  if (event.target instanceof HTMLInputElement) {
    setGameScheduled(form, event.target.checked)
    syncParticipantErrors()
  }
}

function describeParticipant(participant: GameParticipantFormValues, index: number): string {
  const name =
    participant.displayName.trim() || t('games.form.roomChange.participant', { n: index + 1 })

  return `${name} (${t('games.form.podiumOption', { podium: participant.podium })})`
}

// Autre salle, autres pupitres : les participants hors de la nouvelle salle changent de pupitre
// (premier libre) ; s'il n'y a plus de place, les derniers sont retirés. Rien n'est fait en
// silence : un avertissement nomme les participants déplacés (avec leur nouveau pupitre) et retirés.
watch(desksCount, (count) => {
  // Joueurs verrouillés : ils ne partent pas avec la modification, rien à ajuster ni à signaler.
  if (participantsLocked.value) {
    return
  }

  const before = form.participants.map((participant) => ({
    key: participant.key,
    podium: participant.podium,
  }))
  const removedIndexes = fitGameParticipantsToDesks(form.participants, count)
  const removed = removedIndexes
    .flatMap((index) => {
      const participant = form.participants[index]

      return participant ? [describeParticipant(participant, index)] : []
    })
    .reverse()
  const moved = form.participants
    .map((participant, index) => ({ participant, index }))
    .filter(({ participant, index }) => participant.podium !== before[index]?.podium)
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

  // La case « offres » n'a pas d'erreur à effacer : l'API la refuse seulement sans email.
  if (field === 'marketingConsent' || field === 'secondMarketingConsent') {
    participant[field] = value === true
    return
  }

  if (field === 'emailConsent' || field === 'secondEmailConsent') {
    participant[field] = value === true
  } else {
    participant[field] = String(value)
  }

  // Sans email, la case « offres » est inactive : on la décoche pour ne rien envoyer par erreur.
  if (field === 'email' && isBlank(participant.email)) {
    participant.marketingConsent = false
  } else if (field === 'secondEmail' && isBlank(participant.secondEmail)) {
    participant.secondMarketingConsent = false
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
  if (code === 'format_fixes_counts') {
    fieldErrors.format = getGameErrorKey(code)
    return
  }

  if (ROOM_ERROR_CODES.includes(code)) {
    fieldErrors.roomId = getGameErrorKey(code)
    return
  }

  if (SCHEDULE_ERROR_CODES.includes(code)) {
    fieldErrors.scheduledAt = getGameErrorKey(code)
    return
  }

  formError.value = t(getGameErrorKey(code))
}

async function onSubmit(): Promise<void> {
  if (isBusy.value || hasNoActiveRoom.value) {
    return
  }

  resetErrors()

  const errors = validateGameForm(form, desksCount.value, timeZone.value)

  if (hasGameFormErrors(errors)) {
    Object.assign(fieldErrors, errors)
    return
  }

  saving.value = true

  try {
    const { game } = props
    const result = game
      ? await updateGameService(
          props.companyId,
          game.id,
          buildUpdateGamePayload(form, timeZone.value, game, {
            includeParticipants: !participantsLocked.value,
          })
        )
      : await createGameService(
          props.companyId,
          buildCreateGamePayload(form, timeZone.value, props.prefill?.scheduledAt)
        )

    if (!result.ok) {
      applyApiError(result.error)
      return
    }

    if (game) {
      emit('saved', result.data.game)
    } else {
      emit('created', result.data.game)
    }
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
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  align-items: start;
}

.game-form__grid--counts {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
}

.game-form__grid--schedule {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;
}

.game-form__check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  color: var(--text-1);
  font-size: 14px;
  cursor: pointer;
}

.game-form__check input {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--primary);
  cursor: pointer;
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

  .game-form__grid--schedule {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
