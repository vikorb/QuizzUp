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
  background: var(--surface-1);
  color: var(--text-1);
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: var(--tr);
}

.ui-btn:hover {
  background: var(--surface-2);
  border-color: var(--border-hover);
  color: var(--text-0);
}

.ui-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-btn:disabled:hover {
  transform: none;
}

/* Primaire : dégradé bleu → violet, le seul point « vif » de l'interface. */
.ui-btn--primary {
  background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple));
  border-color: transparent;
  color: #fff;
  box-shadow:
    0 10px 24px -12px var(--neon-pink),
    0 0 0 1px rgba(255, 255, 255, 0.08) inset;
}

.ui-btn--primary:hover {
  transform: translateY(-1px);
  border-color: transparent;
  color: #fff;
  box-shadow:
    0 14px 30px -12px var(--neon-pink),
    0 0 0 1px rgba(255, 255, 255, 0.14) inset;
}

.ui-btn--seg {
  width: 100%;
  justify-content: flex-start;
  gap: 10px;
  border-radius: 14px;
  padding: 10px 12px;
  background: var(--surface-0);
  color: var(--text-1);
}

.ui-btn--seg:hover {
  background: var(--surface-2);
}

.ui-btn--seg.is-active {
  border-color: var(--border-2);
  background: linear-gradient(135deg, var(--glow-blue), var(--glow-pink)), var(--bg-card-hi);
  box-shadow: 0 0 12px var(--glow-soft);
  color: var(--text-0);
}

/* Danger : rouge plein au centre (fond rouge doux), pas de néon autour. */
.ui-btn--danger {
  background: var(--danger-bg);
  border-color: var(--danger);
  color: var(--danger);
  box-shadow: none;
}

.ui-btn--danger:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
  box-shadow: none;
}

.ui-btn--icon {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 12px;
  justify-content: center;
  gap: 0;
  background: var(--surface-2);
  color: var(--text-1);
}

.ui-btn--icon:hover {
  background: var(--surface-3);
  border-color: var(--border-hover);
  color: var(--text-0);
}
</style>
