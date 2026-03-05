<template>
  <button class="ui-btn" :class="variantClass" :type="type">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'danger' | 'seg' | 'icon'
    type?: 'button' | 'submit'
  }>(),
  { variant: 'default', type: 'button' }
)
const variantClass = computed(() => `ui-btn--${props.variant}`)
</script>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--border-ui);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-1);
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--tr);
}

.ui-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--border-hover);
  color: var(--text-0);
}

.ui-btn--primary {
  background: linear-gradient(135deg, rgba(0, 98, 255, 0.18), rgba(237, 46, 251, 0.18));
  border-color: rgba(255, 255, 255, 0.12);
  color: white;
}

.ui-btn--primary:hover {
  background: linear-gradient(135deg, rgba(0, 98, 255, 0.26), rgba(237, 46, 251, 0.26));
  box-shadow: 0 0 6px var(--glow-blue), 0 0 8px var(--glow-pink);
}

.ui-btn--seg {
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-1);
}

.ui-btn--seg:hover {
  background: rgba(255, 255, 255, 0.06);
}

.ui-btn--seg.is-active {
  border-color: rgba(255, 255, 255, 0.16);
  background: linear-gradient(135deg, rgba(0, 98, 255, 0.16), rgba(237, 46, 251, 0.16));
  box-shadow: 0 0 10px var(--glow-blue), 0 0 12px var(--glow-pink);
  color: var(--text-0);
}

.ui-btn--danger {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 80, 120, 0.28);
  color: var(--text-0);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03) inset,
    0 0 14px rgba(255, 80, 120, 0.16);
}

.ui-btn--danger:hover {
  background: rgba(255, 80, 120, 0.10);
  border-color: rgba(255, 80, 120, 0.45);
  color: var(--text-0);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 18px rgba(255, 80, 120, 0.22),
    0 0 26px rgba(255, 0, 90, 0.14);
}

.ui-btn--icon {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 12px;
  justify-content: center;
  gap: 0;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
}

.ui-btn--icon:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--border-hover);
  color: var(--text-0);
}
</style>
