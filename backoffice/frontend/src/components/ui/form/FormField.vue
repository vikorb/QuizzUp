<template>
  <div class="ff" :class="{ 'ff--disabled': disabled }">
    <label v-if="label" class="ff__label" :for="id">
      {{ label }}
      <span v-if="required" class="ff__req">*</span>
    </label>

    <div class="ff__control neon" :class="{ 'ff__control--error': !!error }">
      <slot name="left" />

      <component
        :is="as"
        v-bind="inputAttrs"
        :id="id"
        class="ff__input"
        :name="name"
        :type="as === 'input' ? type : undefined"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :aria-invalid="!!error"
        :aria-describedby="describedBy"
        @input="onInput"
        @blur="$emit('blur')"
        @keydown.enter="$emit('enter')"
      />

      <slot name="right" />
    </div>

    <p v-if="hint && !error" :id="hintId" class="ff__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="ff__error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    name?: string
    id?: string
    placeholder?: string
    type?: 'text' | 'email' | 'password'
    autocomplete?: string
    inputmode?: 'text' | 'email' | 'numeric' | 'search' | 'tel' | 'url' | 'none'
    required?: boolean
    disabled?: boolean
    error?: string
    hint?: string
    as?: 'input' | 'textarea'
    rows?: number
  }>(),
  {
    type: 'text',
    as: 'input',
    required: false,
    disabled: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'blur'): void
  (e: 'enter'): void
}>()

const uid = Math.random().toString(16).slice(2)
const id = computed(() => props.id ?? `ff_${uid}`)

const hintId = computed(() => `${id.value}_hint`)
const errorId = computed(() => `${id.value}_error`)
const describedBy = computed(() => (props.error ? errorId.value : props.hint ? hintId.value : undefined))

const inputAttrs = computed(() => {
  if (props.as !== 'textarea') return {}
  return { rows: props.rows ?? 3 }
})

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  emit('update:modelValue', value)
}
</script>

<style scoped>
.ff {
  display: grid;
  gap: 8px;
}

.ff__label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: 0.2px;
}

.ff__req {
  color: var(--accent-pink);
  margin-left: 4px;
}

.ff__control {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-ui);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  padding: 10px 12px;
  transition: var(--tr);
}

.ff__control:focus-within {
  border-color: var(--border-hover);
}

.ff__control--error {
  border-color: rgba(237, 46, 251, 0.55);
}

.ff__input {
  flex: 1;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-0);
  font-family: inherit;
  font-size: 14px;
  padding: 2px 0;
}

.ff__input::placeholder {
  color: var(--text-3);
}

.ff__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.ff__error {
  margin: 0;
  font-size: 12px;
  color: rgba(237, 46, 251, 0.95);
}

.ff--disabled .ff__control {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
