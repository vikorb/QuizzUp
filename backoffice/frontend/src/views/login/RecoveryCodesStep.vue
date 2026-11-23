<template>
  <form class="form" @submit.prevent="onContinue">
    <h2 ref="title" class="step-title" tabindex="-1">{{ $t('login.mfa.recovery.title') }}</h2>
    <p class="step-text">{{ $t('login.mfa.recovery.hint', { count: codes.length }) }}</p>

    <ul class="codes" :aria-label="$t('login.mfa.recovery.title')">
      <li v-for="item in codes" :key="item">
        <code>{{ item }}</code>
      </li>
    </ul>

    <label class="noted">
      <input v-model="noted" type="checkbox" name="noted" />
      {{ $t('login.mfa.recovery.noted') }}
    </label>

    <UiButton class="submit" variant="primary" type="submit" :disabled="!noted">
      {{ $t('login.mfa.recovery.continue') }}
    </UiButton>
  </form>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'

defineProps<{ codes: string[] }>()

const emit = defineEmits<{ (event: 'continue'): void }>()

const noted = ref(false)
const title = ref<HTMLElement | null>(null)

onMounted(() => title.value?.focus())

function onContinue() {
  if (noted.value) emit('continue')
}
</script>

<style scoped src="./mfaStep.css"></style>

<style scoped>
.codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin: 0;
  padding: 12px 14px;
  list-style: none;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-inset);
  user-select: all;
}

.codes code {
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-0);
}

.noted {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  font-size: 14px;
  color: var(--text-1);
  cursor: pointer;
}

.noted input {
  width: 20px;
  height: 20px;
  accent-color: var(--primary);
}

.noted input:focus-visible {
  outline: 2px solid var(--border-hover);
  outline-offset: 2px;
}

.step-title:focus-visible {
  outline: none;
}
</style>
