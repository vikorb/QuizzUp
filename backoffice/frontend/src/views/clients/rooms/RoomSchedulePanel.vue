<template>
  <BaseCard
    id="room-schedule"
    :title="$t('rooms.schedule.title', { name: roomName })"
    :neon="true"
    :no-hover="true"
    :loading="loading"
    :error="loadError"
    :loading-label="$t('rooms.schedule.loading')"
    error-namespace="rooms.errors"
    class="room-schedule-card"
  >
    <template #actions>
      <UiButton v-if="loadError" variant="default" type="button" @click="loadSchedule">
        {{ $t('rooms.table.retry') }}
      </UiButton>

      <UiButton
        class="room-schedule__close"
        variant="icon"
        type="button"
        :disabled="busy"
        :title="$t('rooms.schedule.actions.close')"
        :aria-label="$t('rooms.schedule.actions.close')"
        @click="emit('close')"
      >
        <MdIcon :path="mdiClose" :size="18" />
      </UiButton>
    </template>

    <form class="room-schedule" novalidate @submit.prevent="onSubmit">
      <span
        class="room-schedule__state"
        :class="{ 'room-schedule__state--set': hasSchedule }"
        :data-schedule="hasSchedule ? 'set' : 'unset'"
      >
        <MdIcon :path="hasSchedule ? mdiCalendarCheck : mdiMinusCircleOutline" :size="14" />
        {{ $t(hasSchedule ? 'rooms.schedule.state.set' : 'rooms.schedule.state.unset') }}
      </span>

      <div class="room-schedule__fields">
        <div class="room-schedule__field">
          <label class="room-schedule__label" for="room-schedule-timezone">
            {{ $t('rooms.schedule.fields.timezone.label') }}
          </label>
          <select
            id="room-schedule-timezone"
            v-model="form.timezone"
            class="room-schedule__input"
            :class="{ 'room-schedule__input--error': shownErrors.timezone }"
            name="timezone"
            :disabled="busy"
            :aria-invalid="Boolean(shownErrors.timezone)"
          >
            <option v-for="zone in timezones" :key="zone" :value="zone">{{ zone }}</option>
          </select>
          <p v-if="shownErrors.timezone" class="room-schedule__error">
            {{ shownErrors.timezone }}
          </p>
        </div>

        <FormField
          id="room-schedule-slot-minutes"
          v-model="form.slotMinutes"
          :label="$t('rooms.schedule.fields.slotMinutes.label')"
          name="slotMinutes"
          inputmode="numeric"
          autocomplete="off"
          :hint="
            $t('rooms.schedule.fields.slotMinutes.hint', ROOM_SCHEDULE_NUMBER_LIMITS.slotMinutes)
          "
          :disabled="busy"
          :error="shownErrors.slotMinutes"
        />

        <FormField
          id="room-schedule-break-minutes"
          v-model="form.breakMinutes"
          :label="$t('rooms.schedule.fields.breakMinutes.label')"
          name="breakMinutes"
          inputmode="numeric"
          autocomplete="off"
          :hint="
            $t('rooms.schedule.fields.breakMinutes.hint', ROOM_SCHEDULE_NUMBER_LIMITS.breakMinutes)
          "
          :disabled="busy"
          :error="shownErrors.breakMinutes"
        />

        <FormField
          id="room-schedule-bookable-desks"
          v-model="form.bookableDesks"
          :label="$t('rooms.schedule.fields.bookableDesks.label')"
          name="bookableDesks"
          inputmode="numeric"
          autocomplete="off"
          :hint="
            $t(
              'rooms.schedule.fields.bookableDesks.hint',
              ROOM_SCHEDULE_NUMBER_LIMITS.bookableDesks
            )
          "
          :disabled="busy"
          :error="shownErrors.bookableDesks"
        />

        <div class="room-schedule__field room-schedule__field--switch">
          <SwitchField
            :model-value="form.publicBooking"
            :label="$t('rooms.schedule.fields.publicBooking.label')"
            :disabled="busy"
            @change="form.publicBooking = $event"
          />
          <span class="room-schedule__switch-text">
            {{ $t('rooms.schedule.fields.publicBooking.label') }}
            <span class="room-schedule__hint">
              {{ $t('rooms.schedule.fields.publicBooking.hint') }}
            </span>
          </span>
        </div>
      </div>

      <fieldset class="room-schedule__days" :disabled="busy">
        <legend class="room-schedule__legend">{{ $t('rooms.schedule.days.title') }}</legend>

        <div
          v-for="key in ROOM_SCHEDULE_DAYS"
          :key="key"
          class="room-schedule__day"
          :data-day="key"
          :data-open="String(form.days[key].open)"
        >
          <div class="room-schedule__day-name">
            <SwitchField
              :model-value="form.days[key].open"
              :label="$t('rooms.schedule.days.toggle', { day: $t(`rooms.schedule.days.${key}`) })"
              :disabled="busy"
              @change="form.days[key].open = $event"
            />
            <span>{{ $t(`rooms.schedule.days.${key}`) }}</span>
          </div>

          <template v-if="form.days[key].open">
            <label class="room-schedule__time">
              <span class="room-schedule__label">{{ $t('rooms.schedule.days.opensAt') }}</span>
              <input
                v-model="form.days[key].opensAt"
                class="room-schedule__input"
                type="time"
                :name="`opensAt-${key}`"
                :disabled="busy"
              />
            </label>

            <label class="room-schedule__time">
              <span class="room-schedule__label">
                {{ $t('rooms.schedule.days.firstSessionAt') }}
              </span>
              <input
                v-model="form.days[key].firstSessionAt"
                class="room-schedule__input"
                type="time"
                :name="`firstSessionAt-${key}`"
                :disabled="busy"
              />
            </label>

            <label class="room-schedule__time">
              <span class="room-schedule__label">{{ $t('rooms.schedule.days.closesAt') }}</span>
              <input
                v-model="form.days[key].closesAt"
                class="room-schedule__input"
                type="time"
                :name="`closesAt-${key}`"
                :disabled="busy"
              />
            </label>
          </template>

          <span v-else class="room-schedule__closed">{{ $t('rooms.schedule.days.closed') }}</span>

          <p v-if="shownErrors.days[key]" class="room-schedule__error room-schedule__day-error">
            {{ shownErrors.days[key] }}
          </p>
        </div>

        <p class="room-schedule__hint">{{ $t('rooms.schedule.days.hint') }}</p>
      </fieldset>

      <section class="room-schedule__preview" aria-live="polite" data-schedule-preview>
        <h3 class="room-schedule__legend">{{ $t('rooms.schedule.preview.title') }}</h3>

        <p v-if="hasLiveErrors" class="room-schedule__hint" data-preview="blocked">
          {{ $t('rooms.schedule.preview.invalid') }}
        </p>

        <p v-else-if="preview.length === 0" class="room-schedule__hint" data-preview="empty">
          {{ $t('rooms.schedule.preview.empty') }}
        </p>

        <ul v-else class="room-schedule__preview-list">
          <li v-for="entry in preview" :key="entry.day" :data-preview-day="entry.day">
            <span class="room-schedule__preview-day">{{
              $t(`rooms.schedule.days.${entry.day}`)
            }}</span>
            <span class="room-schedule__preview-times">
              {{ entry.times.join(', ')
              }}<template v-if="entry.count > entry.times.length">…</template>
            </span>
            <span class="room-schedule__hint">
              {{ $t('rooms.schedule.preview.count', { count: entry.count }, entry.count) }}
            </span>
          </li>
        </ul>
      </section>

      <FormResult :error="formError" :success="successMessage" />

      <FormActions
        :cancel-label="$t('rooms.schedule.actions.cancel')"
        :submit-label="$t('rooms.schedule.actions.save')"
        :submitting-label="$t('rooms.schedule.actions.saving')"
        :loading="saving"
        :disabled="busy"
        @cancel="emit('close')"
      />

      <div v-if="hasSchedule" class="room-schedule__danger">
        <p class="room-schedule__danger-text">{{ $t('rooms.schedule.hints.disable') }}</p>

        <UiButton
          class="room-schedule__disable"
          variant="danger"
          type="button"
          :disabled="busy"
          @click="handleDisable"
        >
          <MdIcon :path="mdiCalendarRemove" :size="18" />
          {{
            $t(disabling ? 'rooms.schedule.actions.disabling' : 'rooms.schedule.actions.disable')
          }}
        </UiButton>
      </div>
    </form>
  </BaseCard>
</template>

<script setup lang="ts">
import { mdiCalendarCheck, mdiCalendarRemove, mdiClose, mdiMinusCircleOutline } from '@mdi/js'
import { ROOM_SCHEDULE_DAYS, type RoomSchedule } from '@quizzup/shared'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import FormActions from '@/components/ui/form/FormActions.vue'
import FormField from '@/components/ui/form/FormField.vue'
import FormResult from '@/components/ui/form/FormResult.vue'
import SwitchField from '@/components/ui/form/SwitchField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { loadCompanyRoomService, updateRoomScheduleService } from '@/services/roomsService'
import type { Room, RoomScheduleFieldErrors, RoomScheduleFormValues } from '@/types/room'
import { getRoomDisplayName } from '@/utils/room/list'
import {
  buildRoomSchedule,
  createDefaultRoomScheduleFormValues,
  getRoomScheduleApiError,
  getRoomScheduleTimezones,
  hasRoomScheduleFormErrors,
  previewRoomSchedule,
  ROOM_SCHEDULE_NUMBER_LIMITS,
  toRoomScheduleFormValues,
  validateRoomScheduleForm,
} from '@/utils/room/schedule'

const props = defineProps<{
  companyId: number
  room: Room
}>()

const emit = defineEmits<{
  (event: 'saved', room: Room): void
  (event: 'close'): void
}>()

const { t } = useI18n()
const { confirm } = useConfirm()

const loading = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const disabling = ref(false)
const submitted = ref(false)
const formError = ref<string | null>(null)
const successMessage = ref<string | null>(null)
/** Réglages enregistrés côté serveur ; `null` : pas de créneaux. */
const savedSchedule = ref<RoomSchedule | null>(null)
const form = reactive<RoomScheduleFormValues>(
  createDefaultRoomScheduleFormValues(props.room.config)
)

const busy = computed(() => loading.value || saving.value || disabling.value)
const roomName = computed(() => getRoomDisplayName(props.room))
const hasSchedule = computed(() => savedSchedule.value !== null)
const timezones = computed(() => getRoomScheduleTimezones(form.timezone))

// Validation en direct (elle pilote l'aperçu) ; les messages ne s'affichent qu'après un envoi.
const liveErrors = computed(() => validateRoomScheduleForm(form, t))
const hasLiveErrors = computed(() => hasRoomScheduleFormErrors(liveErrors.value))
const noErrors: RoomScheduleFieldErrors = { days: {} }
const shownErrors = computed(() => (submitted.value ? liveErrors.value : noErrors))
const preview = computed(() =>
  hasLiveErrors.value ? [] : previewRoomSchedule(buildRoomSchedule(form))
)

function resetMessages(): void {
  formError.value = null
  successMessage.value = null
}

function applySchedule(schedule: RoomSchedule | null | undefined): void {
  savedSchedule.value = schedule ?? null
  Object.assign(form, toRoomScheduleFormValues(schedule, props.room.config))
  submitted.value = false
}

async function loadSchedule(): Promise<void> {
  loadError.value = null
  resetMessages()
  loading.value = true

  try {
    const result = await loadCompanyRoomService(props.companyId, props.room.id)

    if (!result.ok) {
      loadError.value = result.error
      return
    }

    applySchedule(result.data.room.schedule)
  } finally {
    loading.value = false
  }
}

async function save(schedule: RoomSchedule | null): Promise<void> {
  resetMessages()
  saving.value = schedule !== null
  disabling.value = schedule === null

  try {
    const result = await updateRoomScheduleService(props.companyId, props.room.id, { schedule })

    if (!result.ok) {
      formError.value = getRoomScheduleApiError(result.error, t)
      return
    }

    applySchedule(result.data.room.schedule ?? schedule)
    successMessage.value = t(
      schedule === null ? 'rooms.schedule.success.disabled' : 'rooms.schedule.success.saved'
    )
    emit('saved', result.data.room)
  } finally {
    saving.value = false
    disabling.value = false
  }
}

async function onSubmit(): Promise<void> {
  if (busy.value) {
    return
  }

  resetMessages()
  submitted.value = true

  if (hasLiveErrors.value) {
    return
  }

  await save(buildRoomSchedule(form))
}

async function handleDisable(): Promise<void> {
  if (busy.value || !hasSchedule.value) {
    return
  }

  const confirmed = await confirm({
    title: t('rooms.schedule.actions.disable'),
    message: t('rooms.schedule.actions.disableConfirm', { name: roomName.value }),
    confirmLabel: t('rooms.schedule.actions.disable'),
    cancelLabel: t('confirm.cancel'),
    variant: 'danger',
  })

  if (!confirmed) {
    return
  }

  await save(null)
}

watch(
  // Sources séparées : un getter qui renvoie un tableau neuf se déclencherait à chaque nouvel objet `room`.
  [() => props.companyId, () => props.room.id],
  () => {
    void loadSchedule()
  },
  { immediate: true }
)
</script>

<style scoped>
.room-schedule-card {
  margin-top: 10px;
  scroll-margin-top: 90px;
}

.room-schedule {
  display: grid;
  gap: 18px;
}

/* Même puce que le compte de salle ; teinte « édition » quand des créneaux sont réglés. */
.room-schedule__state {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.room-schedule__state--set {
  border-color: var(--edit);
  color: var(--edit);
  background: var(--edit-bg);
}

.room-schedule__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.room-schedule__field {
  display: grid;
  align-content: start;
  gap: 8px;
}

.room-schedule__field--switch {
  grid-template-columns: auto 1fr;
  align-items: center;
  min-height: 48px;
  gap: 12px;
}

.room-schedule__switch-text {
  display: grid;
  gap: 2px;
  color: var(--text-1);
  font-size: 14px;
}

.room-schedule__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

/* Champs natifs (select, time) habillés comme FormField. */
.room-schedule :deep(.ff__control) {
  min-height: 48px;
}

.room-schedule__input {
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: 1px solid var(--border-ui);
  border-radius: 14px;
  background: var(--bg-field);
  color: var(--text-0);
  font: inherit;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  transition: var(--tr);
}

.room-schedule__input:hover {
  border-color: var(--border-2);
}

.room-schedule__input:focus-visible {
  outline: none;
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px var(--glow-soft);
}

.room-schedule__input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.room-schedule__input--error {
  border-color: var(--danger);
}

.room-schedule__days {
  display: grid;
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.room-schedule__legend {
  margin: 0 0 6px;
  padding: 0;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-0);
}

.room-schedule__day {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) repeat(3, minmax(120px, 160px));
  align-items: end;
  gap: 8px 12px;
  min-height: 48px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.room-schedule__day-name {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  color: var(--text-0);
  font-weight: 700;
}

.room-schedule__time {
  display: grid;
  gap: 4px;
}

.room-schedule__closed {
  grid-column: 2 / -1;
  align-self: center;
  color: var(--text-3);
  font-size: 13px;
}

.room-schedule__day-error {
  grid-column: 1 / -1;
}

.room-schedule__preview {
  display: grid;
  gap: 6px;
}

.room-schedule__preview-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.room-schedule__preview-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}

.room-schedule__preview-day {
  min-width: 96px;
  font-weight: 700;
  color: var(--text-0);
}

.room-schedule__preview-times {
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.room-schedule__danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  border-radius: 12px;
  background: var(--danger-bg);
}

.room-schedule__danger-text {
  flex: 1 1 260px;
  margin: 0;
  font-size: 13px;
  color: var(--text-1);
}

.room-schedule__disable,
.room-schedule__close {
  min-height: 48px;
}

.room-schedule__close {
  min-width: 48px;
  color: var(--text-2);
}

.room-schedule__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.room-schedule__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

@media (max-width: 768px) {
  .room-schedule__day {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .room-schedule__day-name {
    grid-column: 1 / -1;
  }

  .room-schedule__closed {
    grid-column: 1 / -1;
  }
}
</style>
