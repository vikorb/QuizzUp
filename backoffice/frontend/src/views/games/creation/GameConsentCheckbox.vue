<template>
  <div class="consent-block">
    <div class="consent-group">
      <label
        class="consent"
        :class="{
          'consent--error': !!error,
          'consent--checked': checked,
        }"
        :for="id"
      >
        <input
          :id="id"
          class="consent__checkbox"
          type="checkbox"
          :name="name"
          :data-test="dataTest"
          :checked="checked"
          :disabled="disabled"
          :aria-invalid="!!error"
          :aria-describedby="describedBy"
          @change="onChange($event)"
        />
        <span class="consent__text">
          {{ $t('games.form.consent') }}
          <span v-if="hasEmail" class="consent__req" aria-hidden="true">*</span>
        </span>
      </label>

      <p v-if="error" :id="`${id}_error`" class="consent__error">{{ error }}</p>
      <p v-else :id="`${id}_hint`" class="consent__hint">{{ $t('games.form.consentHint') }}</p>
    </div>

    <div class="consent-group">
      <label
        class="consent"
        :class="{
          'consent--checked': marketingChecked,
          'consent--disabled': marketingDisabled,
        }"
        :for="marketingId"
      >
        <input
          :id="marketingId"
          class="consent__checkbox"
          type="checkbox"
          :name="marketingName"
          :data-test="`${dataTest}-marketing`"
          :checked="marketingChecked"
          :disabled="marketingDisabled"
          :aria-describedby="`${marketingId}_hint`"
          @change="onChange($event, true)"
        />
        <span class="consent__text">{{ $t('games.form.marketingConsent') }}</span>
      </label>

      <p :id="`${marketingId}_hint`" class="consent__hint">
        {{ $t('games.form.marketingConsentHint') }}
        <template v-if="!hasEmail">{{ $t('games.form.marketingConsentNeedsEmail') }}</template>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * Cases de consentement RGPD d'un joueur, jamais pré-cochées (règle portée par le parent) :
 * conserver l'email (obligatoire si un email est saisi) et recevoir les offres du centre
 * (facultative, inactive sans email). Deux finalités, deux cases.
 */
const props = withDefaults(
  defineProps<{
    id: string
    name: string
    marketingName: string
    checked: boolean
    marketingChecked: boolean
    dataTest: string
    /** Un email est saisi : la conservation devient obligatoire, les offres possibles. */
    hasEmail: boolean
    disabled?: boolean
    error?: string
  }>(),
  {
    disabled: false,
    error: undefined,
  }
)

const emit = defineEmits<{
  (event: 'change', checked: boolean): void
  (event: 'change-marketing', checked: boolean): void
}>()

const marketingId = computed(() => `${props.id}-marketing`)
const marketingDisabled = computed(() => props.disabled || !props.hasEmail)
const describedBy = computed(() => (props.error ? `${props.id}_error` : `${props.id}_hint`))

function onChange(event: Event, marketing = false): void {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  if (marketing) {
    emit('change-marketing', target.checked)
  } else {
    emit('change', target.checked)
  }
}
</script>

<style scoped>
.consent-block {
  display: grid;
  gap: 12px;
}

.consent-group {
  display: grid;
  gap: 6px;
}

.consent {
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

.consent:hover,
.consent:focus-within {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px var(--glow-soft);
}

.consent--checked {
  border-color: rgba(87, 224, 176, 0.3);
  background: var(--ok-bg);
}

.consent--error {
  border-color: var(--danger);
}

.consent__checkbox {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: var(--primary);
  cursor: pointer;
}

.consent__checkbox:disabled {
  cursor: not-allowed;
}

.consent--disabled {
  color: var(--text-3);
  cursor: not-allowed;
}

.consent--disabled:hover {
  border-color: var(--border-ui);
  box-shadow: none;
}

.consent__req {
  color: var(--accent-pink);
  font-weight: 800;
}

.consent__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.consent__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
