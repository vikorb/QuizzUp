<template>
  <div class="select-field">
    <LabelField :label="label" :for-id="id" :required="required" />

    <div class="select-field__control">
      <select
        :id="id"
        class="select-field__input"
        :class="{
          'select-field__input--error': !!error,
        }"
        :value="modelValue ?? ''"
        :name="name"
        :disabled="disabled"
        :required="required"
        @change="handleChange"
      >
        <option v-if="placeholder" value="" :disabled="required">
          {{ placeholder }}
        </option>

        <option
          v-for="option in options"
          :key="String(option.value)"
          :value="String(option.value)"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>
    </div>

    <p v-if="error" class="select-field__error">
      {{ error }}
    </p>

    <p v-else-if="hint" class="select-field__hint">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import LabelField from '@/components/ui/form/LabelField.vue'

export type SelectFieldOption = {
  label: string
  value: string | number
  disabled?: boolean
}

withDefaults(
  defineProps<{
    modelValue?: string | number | null
    options: SelectFieldOption[]
    label?: string
    id?: string
    name?: string
    placeholder?: string
    hint?: string
    error?: string
    disabled?: boolean
    required?: boolean
  }>(),
  {
    modelValue: '',
    label: undefined,
    id: undefined,
    name: undefined,
    placeholder: undefined,
    hint: undefined,
    error: undefined,
    disabled: false,
    required: false,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

function handleChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.select-field {
  display: grid;
  gap: 8px;
}

.select-field__control {
  position: relative;
}

.select-field__input {
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-0);
  font: inherit;
  outline: none;
  transition: var(--tr);
}

.select-field__input:hover,
.select-field__input:focus {
  border-color: var(--border-hover);
  box-shadow: 0 0 0 3px rgba(0, 242, 255, 0.08);
}

.select-field__input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.select-field__input--error {
  border-color: rgba(255, 107, 107, 0.8);
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.08);
}

.select-field__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.select-field__error {
  margin: 0;
  font-size: 12px;
  color: #ff6b6b;
}
</style>
