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

    <GameConsentCheckbox
      :id="consentId"
      :name="`participants.${index}.emailConsent`"
      data-test="game-participant-consent"
      :checked="participant.emailConsent"
      :required="consentRequired"
      :disabled="disabled"
      :error="errorLabel(errors.emailConsent)"
      @change="emitUpdate('emailConsent', $event)"
    />

    <div
      v-if="participant.hasSecondPlayer"
      class="participant__second"
      data-test="game-second-player"
    >
      <div class="participant__second-head">
        <h4 class="participant__second-title">{{ $t('games.form.secondPlayer') }}</h4>

        <UiButton
          class="icon icon-delete"
          variant="icon"
          type="button"
          data-test="game-second-player-remove"
          :disabled="disabled"
          :title="$t('games.form.removeSecondPlayer')"
          :aria-label="$t('games.form.removeSecondPlayer')"
          @click="emit('remove-second-player')"
        >
          <MdIcon :path="mdiDeleteOutline" :size="18" />
        </UiButton>
      </div>

      <div class="participant__grid participant__grid--second">
        <FormField
          :id="`game-participant-${participant.key}-second-name`"
          :model-value="participant.secondDisplayName"
          :label="$t('games.form.displayName')"
          :name="`participants.${index}.secondPlayer.displayName`"
          :placeholder="$t('games.form.secondDisplayNamePlaceholder')"
          autocomplete="off"
          :disabled="disabled"
          :error="errorLabel(errors.secondDisplayName)"
          required
          @update:model-value="emitUpdate('secondDisplayName', $event)"
        />

        <FormField
          :id="`game-participant-${participant.key}-second-email`"
          :model-value="participant.secondEmail"
          :label="$t('games.form.email')"
          :name="`participants.${index}.secondPlayer.email`"
          type="email"
          inputmode="email"
          autocomplete="off"
          :placeholder="$t('games.form.emailPlaceholder')"
          :hint="$t('games.form.emailHint')"
          :disabled="disabled"
          :error="errorLabel(errors.secondEmail)"
          @update:model-value="emitUpdate('secondEmail', $event)"
        />
      </div>

      <GameConsentCheckbox
        :id="secondConsentId"
        :name="`participants.${index}.secondPlayer.emailConsent`"
        data-test="game-second-player-consent"
        :checked="participant.secondEmailConsent"
        :required="secondConsentRequired"
        :disabled="disabled"
        :error="errorLabel(errors.secondEmailConsent)"
        @change="emitUpdate('secondEmailConsent', $event)"
      />
    </div>

    <div v-else class="participant__second-add">
      <UiButton
        variant="default"
        type="button"
        data-test="game-second-player-add"
        :disabled="disabled"
        @click="emit('add-second-player')"
      >
        <span class="participant__button-content">
          <MdIcon :path="mdiAccountPlusOutline" :size="18" />
          <span>{{ $t('games.form.addSecondPlayer') }}</span>
        </span>
      </UiButton>
    </div>
  </fieldset>
</template>

<script setup lang="ts">
import { mdiAccountPlusOutline, mdiDeleteOutline } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import FormField from '@/components/ui/form/FormField.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { SelectFieldOption } from '@/types/form'
import type {
  GameParticipantField,
  GameParticipantFieldErrors,
  GameParticipantFormValues,
} from '@/types/game'
import { isBlank } from '@/utils/validation'

import GameConsentCheckbox from './GameConsentCheckbox.vue'

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
  (event: 'update', field: GameParticipantField, value: string | boolean): void
  (event: 'remove'): void
  (event: 'add-second-player'): void
  (event: 'remove-second-player'): void
}>()

const { t } = useI18n()

const consentId = computed(() => `game-participant-${props.participant.key}-consent`)
const consentRequired = computed(() => !isBlank(props.participant.email))
const secondConsentId = computed(() => `game-participant-${props.participant.key}-second-consent`)
const secondConsentRequired = computed(() => !isBlank(props.participant.secondEmail))

function errorLabel(errorKey: string): string | undefined {
  return errorKey ? t(errorKey) : undefined
}

function emitUpdate(field: GameParticipantField, value: string | boolean): void {
  emit('update', field, value)
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

.participant__second {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px dashed var(--border-ui);
  border-radius: 12px;
  background: var(--bg-field);
}

.participant__second-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.participant__second-title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--text-0);
}

.participant__grid--second {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.participant__second-add {
  display: flex;
}

.participant__button-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  .participant__grid,
  .participant__grid--second {
    grid-template-columns: 1fr;
  }
}
</style>
