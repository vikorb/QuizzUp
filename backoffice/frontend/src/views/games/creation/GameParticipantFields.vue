<template>
  <fieldset class="participant" :data-test="`game-participant-${index}`">
    <legend class="participant__title">
      {{ $t('games.form.participant', { index: index + 1 }) }}
    </legend>

    <UiButton
      class="icon icon-delete participant__remove"
      variant="icon"
      type="button"
      data-test="game-participant-remove"
      :disabled="disabled || !canRemove"
      :title="$t('games.form.removeParticipant', { index: index + 1 })"
      :aria-label="$t('games.form.removeParticipant', { index: index + 1 })"
      @click="emit('remove')"
    >
      <MdIcon :path="mdiDeleteOutline" :size="18" />
    </UiButton>

    <div class="participant__grid">
      <SelectField
        :id="`game-participant-${participant.key}-podium`"
        :model-value="participant.podium"
        :label="$t('games.form.podium')"
        :options="podiumOptions"
        :disabled="disabled"
        :error="errorLabel(errors.podium)"
        required
        @update:model-value="emitUpdate('podium', $event)"
      />

      <FormField
        :id="`game-participant-${participant.key}-name`"
        :model-value="participant.displayName"
        :label="$t('games.form.displayName')"
        :name="`participants.${index}.displayName`"
        :placeholder="$t('games.form.displayNamePlaceholder')"
        autocomplete="off"
        :disabled="disabled"
        :error="errorLabel(errors.displayName)"
        required
        @update:model-value="emitUpdate('displayName', $event)"
      />

      <FormField
        :id="`game-participant-${participant.key}-email`"
        :model-value="participant.email"
        :label="$t('games.form.email')"
        :name="`participants.${index}.email`"
        type="email"
        inputmode="email"
        autocomplete="off"
        :placeholder="$t('games.form.emailPlaceholder')"
        :hint="$t('games.form.emailHint')"
        :disabled="disabled"
        :error="errorLabel(errors.email)"
        @update:model-value="emitUpdate('email', $event)"
      />
    </div>

    <div class="participant__consent-block">
      <label
        class="participant__consent"
        :class="{
          'participant__consent--error': !!errors.emailConsent,
          'participant__consent--checked': participant.emailConsent,
        }"
        :for="consentId"
      >
        <input
          :id="consentId"
          class="participant__checkbox"
          type="checkbox"
          :name="`participants.${index}.emailConsent`"
          data-test="game-participant-consent"
          :checked="participant.emailConsent"
          :disabled="disabled"
          :aria-invalid="!!errors.emailConsent"
          :aria-describedby="consentDescribedBy"
          @change="onConsentChange"
        />
        <span class="participant__consent-text">
          {{ $t('games.form.consent') }}
          <span v-if="consentRequired" class="participant__req" aria-hidden="true">*</span>
        </span>
      </label>

      <p v-if="errors.emailConsent" :id="`${consentId}_error`" class="participant__error">
        {{ errorLabel(errors.emailConsent) }}
      </p>
      <p v-else :id="`${consentId}_hint`" class="participant__hint">
        {{ $t('games.form.consentHint') }}
      </p>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { mdiDeleteOutline } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { SelectFieldOption } from '@/types/form'
import type { GameParticipantFieldErrors, GameParticipantFormValues } from '@/types/game'
import { isBlank } from '@/utils/validation'

type ParticipantField = 'podium' | 'displayName' | 'email' | 'emailConsent'

const props = withDefaults(
  defineProps<{
    participant: GameParticipantFormValues
    index: number
    errors: GameParticipantFieldErrors
    podiumOptions: SelectFieldOption[]
    canRemove?: boolean
    disabled?: boolean
  }>(),
  {
    canRemove: true,
    disabled: false,
  }
)

const emit = defineEmits<{
  (event: 'update', field: ParticipantField, value: string | boolean): void
  (event: 'remove'): void
}>()

const { t } = useI18n()

const consentId = computed(() => `game-participant-${props.participant.key}-consent`)
const consentRequired = computed(() => !isBlank(props.participant.email))
const consentDescribedBy = computed(() =>
  props.errors.emailConsent ? `${consentId.value}_error` : `${consentId.value}_hint`
)

function errorLabel(errorKey: string): string | undefined {
  return errorKey ? t(errorKey) : undefined
}

function emitUpdate(field: ParticipantField, value: string | boolean): void {
  emit('update', field, value)
}

function onConsentChange(event: Event): void {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  emitUpdate('emailConsent', target.checked)
}
</script>

<style scoped>
.participant {
  position: relative;
  display: grid;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--border-ui);
  border-radius: 16px;
  background: var(--surface-0);
}

.participant__title {
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 0 44px 0 0;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-0);
}

.participant__grid {
  display: grid;
  grid-template-columns: minmax(140px, 180px) repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 14px;
}

.participant__consent-block {
  display: grid;
  gap: 6px;
}

.participant__consent {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-ui);
  border-radius: 12px;
  background: var(--bg-field);
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
  transition: var(--tr);
}

.participant__consent:hover,
.participant__consent:focus-within {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px var(--glow-soft);
}

.participant__consent--checked {
  border-color: rgba(87, 224, 176, 0.3);
  background: var(--ok-bg);
}

.participant__consent--error {
  border-color: var(--danger);
}

.participant__checkbox {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: var(--primary);
  cursor: pointer;
}

.participant__checkbox:disabled {
  cursor: not-allowed;
}

.participant__req {
  color: var(--accent-pink);
  font-weight: 800;
}

.participant__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.participant__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}

.participant__remove {
  position: absolute;
  top: 14px;
  right: 14px;
}

.icon-delete {
  color: var(--danger);
}

@media (max-width: 900px) {
  .participant__grid {
    grid-template-columns: 1fr;
  }
}
</style>
