<template>
  <button class="ui-btn" :class="[variantClass, sizeClass]" :type="type">
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(
  defineProps<{
    variant?: 'default' | 'primary' | 'danger' | 'icon'
    /** `lg` : écrans vus de loin (accueil, assistants plein écran). */
    size?: 'md' | 'lg'
    type?: 'button' | 'submit'
  }>(),
  { variant: 'default', size: 'md', type: 'button' }
)
const variantClass = computed(() => `ui-btn--${props.variant}`)
const sizeClass = computed(() => `ui-btn--${props.size}`)
</script>

<style scoped>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--tap-min);
  border: 1px solid var(--border-ui);
  background: var(--surface-1);
  color: var(--text-1);
  border-radius: var(--radius-ctl);
  padding: 0 18px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
  cursor: pointer;
  transition: var(--tr);
}

/* Écrans vus de loin : cible de 64 px, texte plus grand. */
.ui-btn--lg {
  min-height: var(--tap-lg);
  padding: 0 32px;
  font-size: 20px;
  font-weight: 800;
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
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  border-radius: var(--radius-ctl);
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
