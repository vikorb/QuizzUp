<template>
  <main class="wizard stage-bg">
    <header class="wizard__top">
      <div class="wizard__progress" data-test="wizard-progress">
        <p :id="labelId" class="wizard__step">{{ $t('setup.stepOf', { n: step, total }) }}</p>
        <div
          class="wizard__track"
          role="progressbar"
          aria-valuemin="1"
          :aria-valuemax="total"
          :aria-valuenow="step"
          :aria-labelledby="labelId"
        >
          <div class="wizard__fill" :style="{ width: `${(step / total) * 100}%` }" />
        </div>
      </div>
      <UiButton :data-test="quitTest" @click="emit('quit')">
        <MdIcon :path="mdiClose" :size="18" />
        {{ $t('setup.quit') }}
      </UiButton>
    </header>

    <div class="wizard__body" data-test="wizard-body">
      <div class="wizard__content">
        <slot />
      </div>
    </div>

    <footer class="wizard__bar" data-test="wizard-bar">
      <div class="wizard__zone wizard__zone--back"><slot name="back" /></div>
      <div class="wizard__zone wizard__zone--secondary"><slot name="secondary" /></div>
      <div class="wizard__zone wizard__zone--primary"><slot name="primary" /></div>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { mdiClose } from '@mdi/js'
import { useId } from 'vue'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'

/**
 * Squelette commun des assistants plein écran, en trois zones fixes : repère d'étape et
 * « Quitter » en haut, contenu centré au milieu, barre d'actions de hauteur constante en bas
 * (Retour à gauche, action secondaire au milieu, action primaire à droite).
 */
defineProps<{
  /** Étape courante, à partir de 1. */
  step: number
  total: number
  /** `data-test` du bouton « Quitter ». */
  quitTest: string
}>()

const emit = defineEmits<{ quit: [] }>()

const labelId = `wizard_step_${useId()}`
</script>

<style scoped>
.wizard {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  height: 100vh;
  padding: 16px clamp(16px, 3vw, 40px) 24px;
  color: var(--text-0);
  text-align: center;
}

.wizard__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.wizard__progress {
  display: grid;
  gap: 8px;
  width: min(320px, 55%);
  text-align: left;
}

.wizard__step {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.wizard__track {
  height: 4px;
  border-radius: var(--radius);
  background: var(--border-ui);
  overflow: hidden;
}

.wizard__fill {
  height: 100%;
  background: var(--accent-blue);
  transition: width 300ms ease;
}

/* Le contenu se centre, et défile (sans être rogné en haut) s'il dépasse. */
.wizard__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}

.wizard__content {
  width: 100%;
  margin: auto;
}

.wizard__bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  min-height: var(--tap-lg);
}

.wizard__zone {
  display: flex;
  align-items: center;
  gap: 16px;
}

.wizard__zone--back {
  justify-content: flex-start;
}

.wizard__zone--secondary {
  justify-content: center;
}

.wizard__zone--primary {
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .wizard__bar {
    grid-template-columns: 1fr;
  }

  .wizard__zone {
    justify-content: center;
  }

  .wizard__zone--primary {
    order: -1;
  }
}

button:focus-visible {
  outline: 4px solid var(--text-0);
  outline-offset: 4px;
}
</style>
