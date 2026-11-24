<template>
  <section class="hw-panel">
    <header class="hw-panel__head">
      <div class="hw-panel__heading">
        <h2 class="hw-panel__title">{{ $t('hardware.advanced.title') }}</h2>
        <p class="hw-panel__status">{{ $t('hardware.advanced.hint') }}</p>
      </div>
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
    <p v-if="syncStatus === 'conflict'" class="hw-alert" role="status" data-test="sync-conflict">
      {{ $t('hardware.sync.conflict') }}
    </p>

    <div class="hw-actions">
      <UiButton variant="primary" :disabled="saving" data-test="config-save" @click="onSave">
        {{ $t('hardware.advanced.save') }}
      </UiButton>
      <UiButton :disabled="saving" @click="reload">{{ $t('hardware.advanced.reset') }}</UiButton>
    </div>

    <div class="hw-actions" data-test="config-transfer">
      <UiButton :disabled="transferBusy" data-test="config-export" @click="onExport">
        {{ $t('hardware.advanced.export') }}
      </UiButton>
      <label class="file-btn">
        {{ $t('hardware.advanced.import') }}
        <input
          type="file"
          accept=".json,application/json"
          data-test="config-import"
          @change="onImportFile"
        />
      </label>
    </div>
    <p class="hw-panel__status">{{ $t('hardware.advanced.transferHint') }}</p>
    <p
      v-if="transferError"
      class="hw-alert hw-alert--danger"
      role="alert"
      data-test="transfer-error"
    >
      {{ transferError }}
    </p>
    <template v-else-if="transferDone">
      <p class="hw-ok" role="status" data-test="transfer-done">{{ transferDone }}</p>
      <p v-if="importedSafety" class="hw-alert" role="status" data-test="transfer-safety">
        {{ $t('hardware.advanced.importing.todo') }}
      </p>
    </template>

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
import type { RoomConfigImportResult, RoomHardwareConfig } from '@quizzup/hardware'
import {
  exportRoomConfig,
  GENERIC_PROFILES,
  parseRoomConfigImport,
  parseRoomHardwareConfig,
  ROOM_CONFIG_IMPORT_MAX_BYTES,
  withoutSmokeEscalation,
} from '@quizzup/hardware'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { saveRoomHardwareConfig, useRoomHardware } from '@/hardware/roomHardware'
import ProfileEditor from '@/views/hardware/ProfileEditor.vue'

const { t } = useI18n()
const { confirm } = useConfirm()
const { hardware, syncStatus, conflictCount } = useRoomHardware()

const draft = ref('')
const jsonError = ref<string | null>(null)
const saved = ref(false)
const saving = ref(false)
const transferBusy = ref(false)
const transferError = ref<string | null>(null)
const transferDone = ref<string | null>(null)
const importedSafety = ref(false)

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

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
    // Ce qui assouplirait la fumée (activation, dispense de relais, jet plus long ou plus
    // fréquent, confirmation retirée) passe par l'assistant, pas par ce JSON.
    // Seule la fumée est remplacée dans le JSON : le reste se relit (et se signale) comme avant.
    const { smoke } = withoutSmokeEscalation(
      hardware.value.config,
      parseRoomHardwareConfig(input).config
    ).lighting
    const root = asRecord(input)
    await saveRoomHardwareConfig({ ...root, lighting: { ...asRecord(root.lighting), smoke } })
    // On réaffiche la version normalisée (valeurs bornées, entrées invalides écartées).
    reload()
    // Après un conflit, c'est la config d'un autre poste qui est affichée : rien n'est « enregistré ».
    saved.value = syncStatus.value !== 'conflict'
  } finally {
    saving.value = false
  }
}

/** Fichier d'export de la config en place (le bouton « Exporter » le télécharge). */
function exportConfig(roomName: string): { fileName: string; content: string } {
  return exportRoomConfig(hardware.value.config, { roomName, now: new Date() })
}

/**
 * Enregistre la config d'un fichier d'import déjà relu et confirmé par l'opérateur (le bouton
 * « Importer » appelle `parseRoomConfigImport`, affiche le résumé puis demande confirmation). La
 * fumée de la salle n'est jamais assouplie, comme pour le JSON.
 */
async function applyImport(result: Extract<RoomConfigImportResult, { ok: true }>): Promise<void> {
  const config: RoomHardwareConfig = withoutSmokeEscalation(hardware.value.config, result.config)
  await saveRoomHardwareConfig(config)
  reload()
}

/** Télécharge le fichier d'export : le nom ne porte ni compagnie ni compte (nom de salle vide). */
function onExport(): void {
  transferError.value = null
  transferDone.value = null
  try {
    const { fileName, content } = exportConfig('')
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    transferDone.value = t('hardware.advanced.exported', { name: fileName })
    importedSafety.value = false
  } catch {
    transferError.value = t('hardware.advanced.exportFailed')
  }
}

/** Raison du refus d'un fichier (traduite), ou `null` si le fichier peut être lu. */
function refusalOf(file: File): string | null {
  if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
    return t('hardware.advanced.refusal.type')
  }
  // La taille se borne avant toute lecture.
  return file.size > ROOM_CONFIG_IMPORT_MAX_BYTES ? t('hardware.advanced.refusal.too_large') : null
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  transferError.value = null
  transferDone.value = null
  importedSafety.value = false
  if (!file || transferBusy.value) {
    return
  }
  transferBusy.value = true
  try {
    const refused = refusalOf(file)
    if (refused) {
      transferError.value = refused
      return
    }
    const result = parseRoomConfigImport(await file.text())
    if (!result.ok) {
      transferError.value = t(`hardware.advanced.refusal.${result.reason}`)
      return
    }
    const { desks, fixtures, driver, universes } = result.summary
    const ok = await confirm({
      title: t('hardware.advanced.importing.title'),
      message: t('hardware.advanced.importing.message', {
        desks,
        fixtures,
        driver,
        universes: universes.join(', ') || '–',
        problems: result.problems.length,
        smoke: t(
          result.smokeDisabled
            ? 'hardware.advanced.importing.smokeArmed'
            : 'hardware.advanced.importing.smokeKept'
        ),
      }),
      variant: 'danger',
    })
    if (!ok) {
      return
    }
    await applyImport(result)
    // Après un conflit, c'est la config d'un autre poste qui est affichée : rien n'est importé.
    if (syncStatus.value !== 'conflict') {
      transferDone.value = t('hardware.advanced.importing.done')
      importedSafety.value = true
    }
  } catch {
    transferError.value = t('hardware.advanced.refusal.unreadable')
  } finally {
    transferBusy.value = false
  }
}

defineExpose({ exportConfig, applyImport })

// Un autre poste a enregistré une autre config : le brouillon repart d'elle.
watch(conflictCount, reload)

reload()
</script>

<style scoped>
.config {
  width: 100%;
  min-height: 320px;
  padding: 14px;
  border-radius: var(--radius-ctl);
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
  display: flex;
  align-items: center;
  min-height: var(--tap-min);
  cursor: pointer;
  font-weight: 700;
}
</style>
