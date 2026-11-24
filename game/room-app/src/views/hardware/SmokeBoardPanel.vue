<template>
  <div class="board" data-test="smoke-board">
    <h4 class="board__title">{{ $t('hardware.smoke.board.title') }}</h4>
    <p v-if="!supported" class="hw-hint" data-test="board-unsupported">
      {{ $t('hardware.lights.noWebSerial') }}
    </p>
    <template v-else>
      <p class="board__status" data-test="board-status" role="status">
        {{ $t(`hardware.smoke.board.status.${view}`, { version: state?.version ?? '' }) }}
      </p>
      <p v-if="view === 'none' && !hasPort" class="hw-hint" data-test="board-empty">
        {{ $t('hardware.smoke.board.empty') }}
      </p>
      <p v-if="ambiguous" class="hw-alert" role="alert" data-test="board-ambiguous">
        {{ $t('hardware.smoke.board.ambiguous') }}
      </p>
      <p v-if="connectError" class="hw-alert" role="alert" data-test="board-connect-error">
        {{ $t(`hardware.smoke.board.connectErrors.${connectError}`) }}
      </p>
      <div class="hw-actions">
        <UiButton :disabled="busy || connecting" data-test="board-connect" @click="onConnect">
          <MdIcon :path="mdiUsb" :size="18" />
          {{ $t('hardware.smoke.board.connect') }}
        </UiButton>
      </div>

      <div v-if="hasPort" class="board__install">
        <label class="board__off">
          <input v-model="machineOff" type="checkbox" :disabled="busy" data-test="board-off" />
          <span>{{ $t('hardware.smoke.board.machineOff') }}</span>
        </label>
        <p class="hw-hint">{{ $t('hardware.smoke.board.installHint') }}</p>
        <div class="hw-actions">
          <UiButton
            :disabled="busy || connecting || !machineOff"
            data-test="board-install"
            @click="onInstall"
          >
            {{ $t('hardware.smoke.board.install') }}
          </UiButton>
          <label class="file-btn">
            {{ $t('hardware.smoke.board.restoreFile') }}
            <input
              type="file"
              accept=".hex"
              :disabled="busy"
              data-test="board-restore-file"
              @change="onFile"
            />
          </label>
          <UiButton
            :disabled="busy || connecting || !machineOff || restoreText === null"
            data-test="board-restore"
            @click="onRestore"
          >
            {{ $t('hardware.smoke.board.restore') }}
          </UiButton>
        </div>
        <p class="hw-hint" data-test="board-restore-hint">
          {{ $t('hardware.smoke.board.restoreHint') }}
        </p>

        <div
          v-if="install.phase === 'awaiting_backup'"
          class="board__backup"
          role="alert"
          data-test="board-backup-confirm"
        >
          <p class="hw-alert">
            {{ $t('hardware.smoke.board.backupQuestion', { file: BACKUP_FILE_NAME }) }}
          </p>
          <div class="hw-actions">
            <UiButton data-test="board-backup-yes" @click="answerBackupSaved(true)">
              {{ $t('hardware.smoke.board.backupYes') }}
            </UiButton>
            <UiButton data-test="board-backup-no" @click="answerBackupSaved(false)">
              {{ $t('hardware.smoke.board.backupNo') }}
            </UiButton>
          </div>
        </div>
        <div
          v-else-if="install.phase === 'running'"
          class="board__progress"
          data-test="board-progress"
        >
          <label>
            {{ $t(`hardware.smoke.board.steps.${install.step}`) }}
            <progress :value="install.done" :max="install.total" />
          </label>
        </div>
        <p
          v-else-if="install.phase === 'error'"
          class="hw-alert hw-alert--danger"
          role="alert"
          data-test="board-install-error"
        >
          {{ $t(`hardware.smoke.board.errors.${install.code}`) }}
          <template v-if="install.inert === false">
            {{ $t('hardware.smoke.board.notInert') }}
          </template>
        </p>
        <p v-else-if="install.phase === 'done'" class="hw-hint" data-test="board-install-done">
          {{ $t(`hardware.smoke.board.done.${install.kind}`) }}
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { mdiUsb } from '@mdi/js'
import { ref } from 'vue'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  answerBackupSaved,
  BACKUP_FILE_NAME,
  type ConnectResult,
  connectSmokeBoard,
  installSmokeBoardProgram,
  restoreSmokeBoardProgram,
  useSmokeBoard,
} from '@/hardware/smokeBoard'

const { supported, state, view, install, busy, ambiguous, hasPort } = useSmokeBoard()

const connecting = ref(false)
const connectError = ref<Exclude<ConnectResult, 'ready' | 'cancelled'> | 'save_failed' | null>(null)
/** Case obligatoire : la machine doit être éteinte avant toute écriture. Jamais retenue d'un essai à l'autre. */
const machineOff = ref(false)
const restoreText = ref<string | null>(null)

async function onConnect(): Promise<void> {
  connecting.value = true
  connectError.value = null
  try {
    const result = await connectSmokeBoard()
    connectError.value = result === 'ready' || result === 'cancelled' ? null : result
  } catch {
    // La carte répond mais la config de la salle n'a pas pu être enregistrée.
    connectError.value = 'save_failed'
  } finally {
    connecting.value = false
  }
}

async function onInstall(): Promise<void> {
  const confirmed = machineOff.value
  machineOff.value = false
  await installSmokeBoardProgram({ machineOff: confirmed })
}

async function onFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  restoreText.value = file ? await file.text() : null
}

async function onRestore(): Promise<void> {
  const confirmed = machineOff.value
  const hex = restoreText.value
  machineOff.value = false
  if (hex !== null) {
    await restoreSmokeBoardProgram({ machineOff: confirmed, hex })
  }
}
</script>

<style scoped>
.board {
  display: grid;
  gap: 12px;
  flex-basis: 100%;
}

.board__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.board__status {
  margin: 0;
  color: var(--text-2);
}

.board__install {
  display: grid;
  gap: 12px;
}

.board__off {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: var(--tap-min);
  font-weight: 700;
  cursor: pointer;
}

.board__off input {
  flex: none;
  width: 24px;
  height: 24px;
  accent-color: var(--accent-purple);
}

.board__progress progress {
  display: block;
  width: 100%;
  accent-color: var(--accent-purple);
}
</style>
