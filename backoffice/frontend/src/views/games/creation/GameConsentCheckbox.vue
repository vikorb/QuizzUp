<template>
  <div class="consent-block">
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
        @change="onChange"
      />
      <span class="consent__text">
        {{ $t('games.form.consent') }}
        <span v-if="required" class="consent__req" aria-hidden="true">*</span>
      </span>
    </label>

    <p v-if="error" :id="`${id}_error`" class="consent__error">{{ error }}</p>
    <p v-else :id="`${id}_hint`" class="consent__hint">{{ $t('games.form.consentHint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** Case de consentement RGPD d'un joueur, jamais pré-cochée (règle portée par le parent). */
const props = withDefaults(
  defineProps<{
    id: string
    name: string
    checked: boolean
    dataTest: string
    required?: boolean
    disabled?: boolean
    error?: string
  }>(),
  {
    required: false,
    disabled: false,
    error: undefined,
  }
)

const emit = defineEmits<{
  (event: 'change', checked: boolean): void
}>()

const describedBy = computed(() => (props.error ? `${props.id}_error` : `${props.id}_hint`))

function onChange(event: Event): void {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  emit('change', target.checked)
}
</script>

<style scoped>
.consent-block {
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
