<template>
  <label
    class="switch-field"
    :class="{
      'switch-field--checked': modelValue,
      'switch-field--disabled': disabled,
    }"
  >
    <input
      class="switch-field__native"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="handleChange"
    />

    <span class="switch-field__track" aria-hidden="true">
      <span class="switch-field__thumb"></span>
    </span>

    <span class="switch-field__label">
      {{ modelValue ? 'Actif' : 'Inactif' }}
    </span>
  </label>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean
    disabled?: boolean
    label?: string
  }>(),
  {
    disabled: false,
    label: undefined,
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'change', value: boolean): void
}>()

function handleChange(event: Event): void {
  const value = (event.target as HTMLInputElement).checked
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.switch-field {
  display: inline-flex;
  flex-direction: column; 
  align-items: center; 
  gap: 8px; 
  cursor: pointer;
  user-select: none;
  width: fit-content; 
}

.switch-field__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  text-align: center;
  line-height: 1.1;
  text-transform: uppercase; 
  min-width: 50px; 
}

.switch-field--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch-field__native {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-field__track {
  position: relative;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid var(--border-ui);
  transition: var(--tr);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.switch-field__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text-0);
  transition: var(--tr);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
}

.switch-field--checked .switch-field__track {
  background: rgba(0, 242, 255, 0.22);
  border-color: rgba(0, 242, 255, 0.35);
  box-shadow:
    0 0 14px rgba(0, 242, 255, 0.16),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.switch-field--checked .switch-field__thumb {
  transform: translateX(20px);
}
</style>
