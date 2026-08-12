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
  }
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
  --switch-width: 42px;
  --switch-height: 24px;
  --switch-thumb-size: 18px;
  --switch-gap: 3px;

  position: relative;
  width: var(--switch-width);
  height: var(--switch-height);
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition:
    background 0.2s ease,
    opacity 0.2s ease;
}

.switch-field:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.switch-field--active {
  background: rgba(87, 224, 176, 0.2);
}

.switch-field__thumb {
  position: absolute;
  top: 50%;
  left: var(--switch-gap);
  width: var(--switch-thumb-size);
  height: var(--switch-thumb-size);
  border-radius: 50%;
  /* Centre coloré : rouge (inactif) → vert (actif), avec lueur verte à l'activation. */
  background: var(--danger);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  transform: translateY(-50%);
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.switch-field--active .switch-field__thumb {
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
  transform: translate(
    calc(var(--switch-width) - var(--switch-thumb-size) - (var(--switch-gap) * 2)),
    -50%
  );
}
</style>
