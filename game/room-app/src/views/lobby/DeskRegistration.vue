<template>
  <article
    class="desk"
    :class="[`desk--${registration.desk}`, { 'desk--filled': filled, 'desk--ping': pinged }]"
  >
    <header class="desk__head">
      <DeskBadge :desk="registration.desk" :size="40" />
      <h2 class="desk__title">{{ $t('room.desk', { n: registration.desk }) }}</h2>
      <span v-if="pinged" class="desk__ping">{{ $t('room.lobby.buzzerOk') }}</span>
      <span v-else-if="!filled" class="desk__free">{{ $t('room.lobby.empty') }}</span>
      <UiButton
        v-if="filled"
        variant="icon"
        class="desk__clear"
        :aria-label="$t('room.lobby.clear')"
        :title="$t('room.lobby.clear')"
        @click="emit('clear')"
      >
        <MdIcon :path="mdiClose" :size="18" />
      </UiButton>
    </header>

    <FormField
      :model-value="registration.displayName"
      :label="$t('room.lobby.displayName')"
      :name="`desk-${registration.desk}-name`"
      :placeholder="$t('room.lobby.displayNamePlaceholder')"
      autocomplete="off"
      :error="displayNameError"
      @update:model-value="update({ displayName: $event })"
    />

    <FormField
      :model-value="registration.email"
      :label="$t('room.lobby.email')"
      :name="`desk-${registration.desk}-email`"
      type="email"
      inputmode="email"
      autocomplete="off"
      :placeholder="$t('room.lobby.emailPlaceholder')"
      :error="emailError"
      @update:model-value="update({ email: $event })"
    />

    <label v-if="registration.email.trim()" class="consent">
      <input
        type="checkbox"
        class="consent__box"
        :checked="registration.consent"
        @change="onConsent"
      />
      <span>{{ $t('room.lobby.consent') }}</span>
    </label>

    <p class="desk__keys">{{ $t('room.lobby.keysHint', { keys: keys.join(' · ') }) }}</p>
  </article>
</template>

<script setup lang="ts">
import { mdiClose } from '@mdi/js'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DeskBadge from '@/components/game/DeskBadge.vue'
import FormField from '@/components/ui/FormField.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  DISPLAY_NAME_MAX_LENGTH,
  isRegistrationFilled,
  type Registration,
  type RegistrationErrors,
  setConsent,
} from '@/game/registrations'
import { getSimulationKeys } from '@/hardware/buzzers'

const props = defineProps<{
  registration: Registration
  errors: RegistrationErrors
  /** Afficher les erreurs (après une tentative de démarrage). */
  showErrors: boolean
  pinged: boolean
}>()

const emit = defineEmits<{
  (event: 'update', value: Registration): void
  (event: 'clear'): void
}>()

const { t } = useI18n()

const filled = computed(() => isRegistrationFilled(props.registration))
const keys = computed(() => getSimulationKeys(props.registration.desk))

const displayNameError = computed(() => {
  const code = props.errors.displayName
  if (!props.showErrors || !code) {
    return undefined
  }
  return t(`room.lobby.errors.${code}`, { max: DISPLAY_NAME_MAX_LENGTH })
})

const emailError = computed(() => {
  const code = props.errors.email
  return props.showErrors && code ? t(`room.lobby.errors.${code}`) : undefined
})

function update(patch: Partial<Registration>): void {
  const next = { ...props.registration, ...patch }
  // Changer d'email invalide le consentement donné pour l'ancien.
  emit(
    'update',
    patch.email !== undefined && patch.email !== props.registration.email
      ? setConsent(next, false)
      : next
  )
}

function onConsent(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  emit('update', setConsent(props.registration, checked))
}
</script>

<style scoped>
.desk {
  --desk-color: var(--desk-1);
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--border-ui);
  background: linear-gradient(180deg, var(--bg-card-hi), var(--bg-card));
  transition: var(--tr);
}

.desk--2 {
  --desk-color: var(--desk-2);
}

.desk--3 {
  --desk-color: var(--desk-3);
}

.desk--4 {
  --desk-color: var(--desk-4);
}

.desk--filled {
  border-color: var(--desk-color);
  box-shadow: 0 0 26px -12px var(--desk-color);
}

.desk--ping {
  box-shadow: 0 0 36px -4px var(--desk-color);
}

.desk__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.desk__title {
  white-space: nowrap;
  margin: 0;
  flex: 1;
  font-size: 20px;
  font-weight: 900;
}

.desk__free {
  color: var(--text-3);
  font-size: 13px;
}

.desk__ping {
  color: var(--desk-color);
  font-weight: 800;
  font-size: 13px;
}

.consent {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-1);
  cursor: pointer;
}

.consent__box {
  margin-top: 2px;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  accent-color: var(--accent-purple);
}

.desk__keys {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
}
</style>
