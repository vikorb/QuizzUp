<template>
  <section class="hw-panel">
    <header class="hw-panel__head">
      <h2 class="hw-panel__title">{{ $t('hardware.advanced.title') }}</h2>
      <p class="hw-panel__status">{{ $t('hardware.advanced.hint') }}</p>
    </header>

    <textarea
      v-model="draft"
      class="config"
      spellcheck="false"
      rows="18"
      :aria-label="$t('hardware.advanced.title')"
      data-test="config-json"
    />

    <p v-if="jsonError" class="hw-alert hw-alert--danger" role="alert">
      {{ $t('hardware.advanced.invalidJson', { message: jsonError }) }}
    </p>
    <p v-else-if="saved" class="hw-ok" role="status">{{ $t('hardware.advanced.saved') }}</p>

    <div class="hw-actions">
      <UiButton variant="primary" :disabled="saving" data-test="config-save" @click="onSave">
        {{ $t('hardware.advanced.save') }}
      </UiButton>
      <UiButton :disabled="saving" @click="reload">{{ $t('hardware.advanced.reset') }}</UiButton>
    </div>

    <div v-if="hardware.problems.length > 0" class="hw-alert" data-test="config-problems">
      <strong>{{ $t('hardware.advanced.problems') }}</strong>
      <ul>
        <li v-for="problem in hardware.problems" :key="problem">{{ problem }}</li>
      </ul>
    </div>

    <ProfileEditor @saved="reload" />

    <details class="profiles">
      <summary>{{ $t('hardware.advanced.profiles') }}</summary>
      <ul>
        <li v-for="profile in GENERIC_PROFILES" :key="profile.id">
          <code>{{ profile.id }}</code> — {{ profile.name }}
        </li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import { GENERIC_PROFILES } from '@quizzup/hardware'
import { ref } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'
import { saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'
import ProfileEditor from '@/views/hardware/ProfileEditor.vue'

const { hardware } = useRoomHardware()

const draft = ref('')
const jsonError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)

function reload(): void {
  draft.value = JSON.stringify(hardware.value.config, null, 2)
  jsonError.value = null
  saved.value = false
}

async function onSave(): Promise<void> {
  saved.value = false
  let input: unknown
  try {
    input = JSON.parse(draft.value)
  } catch (error) {
    jsonError.value = error instanceof Error ? error.message : String(error)
    return
  }

  jsonError.value = null
  saving.value = true
  try {
    await saveRoomHardwareConfig(input)
    // On réaffiche la version normalisée (valeurs bornées, entrées invalides écartées).
    reload()
    saved.value = true
  } finally {
    saving.value = false
  }
}

reload()
</script>

<style scoped>
.config {
  width: 100%;
  min-height: 320px;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--bg-field);
  color: var(--text-0);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.hw-alert ul,
.profiles ul {
  margin: 6px 0 0;
  padding-left: 20px;
}

.profiles {
  color: var(--text-1);
}

.profiles summary {
  cursor: pointer;
  font-weight: 700;
}
</style>
