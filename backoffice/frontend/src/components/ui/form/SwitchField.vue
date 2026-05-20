<template>
  <button
    class="switch-field"
    :class="{ 'switch-field--active': modelValue }"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    @click="handleClick"
  >
    <span class="switch-field__thumb" />
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    disabled?: boolean
  }>(),
  {
    label: '',
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'change', value: boolean): void
}>()

function handleClick(): void {
  if (props.disabled) {
    return
  }

  const nextValue = !props.modelValue

  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}
</script>

<style scoped>
.switch-field {
  --switch-width: 38px;
  --switch-height: 22px;
  --switch-thumb-size: 14px;
  --switch-gap: 3px;

  position: relative;
  width: var(--switch-width);
  height: var(--switch-height);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;
}

.switch-field:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.switch-field--active {
  border-color: rgba(45, 255, 137, 0.45);
  background: rgba(45, 255, 137, 0.22);
}

.switch-field__thumb {
  position: absolute;
  top: 50%;
  left: var(--switch-gap);
  width: var(--switch-thumb-size);
  height: var(--switch-thumb-size);
  border-radius: 999px;
  background: var(--text-0);
  transform: translateY(-50%);
  transition: transform 0.2s ease;
}

.switch-field--active .switch-field__thumb {
  transform: translate(
    calc(var(--switch-width) - var(--switch-thumb-size) - (var(--switch-gap) * 2)),
    -50%
  );
}
</style>
