<template>
  <button class="ui-btn" :class="variantClass" :type="type">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'danger'
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
  transform: translateY(-2px);
  color: var(--text-0);
}

.ui-btn--primary {
  background: linear-gradient(135deg, rgba(0, 242, 255, 0.1), rgba(139, 92, 246, 0.2));
  border-color: var(--accent-purple);
  color: white;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.ui-btn--primary:hover {
  background: linear-gradient(135deg, rgba(0, 242, 255, 0.2), rgba(139, 92, 246, 0.3));
  box-shadow: 0 0 20px var(--glow-purple);
}
</style>
