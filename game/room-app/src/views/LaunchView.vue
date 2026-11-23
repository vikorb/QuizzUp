<template>
  <main class="launch stage-bg">
    <RoomTopBar>
      <template #actions>
        <UiButton
          variant="icon"
          :aria-label="$t('hardware.open')"
          :title="$t('hardware.open')"
          data-test="open-hardware"
          @click="router.push({ name: 'hardware' })"
        >
          <MdIcon :path="mdiTuneVariant" :size="20" />
        </UiButton>
        <UiButton
          variant="icon"
          :aria-label="$t('auth.logout')"
          :title="$t('auth.logout')"
          @click="onLogout"
        >
          <MdIcon :path="mdiLogout" :size="20" />
        </UiButton>
      </template>
    </RoomTopBar>

    <section class="launch__body">
      <RoomReplacedNotice />
      <h1 class="launch__title">{{ $t('room.launch.title') }}</h1>
      <p class="launch__subtitle">{{ $t('room.launch.subtitle') }}</p>

      <div v-if="savedGame" class="launch__resume" data-test="launch-resume">
        <h2 class="launch__resume-title">{{ $t('room.launch.resumeTitle') }}</h2>
        <p class="launch__resume-text">{{ $t('room.launch.resumeText') }}</p>
        <div class="launch__resume-actions">
          <UiButton
            variant="primary"
            size="lg"
            :disabled="launching"
            data-test="resume-saved"
            @click="onResume"
          >
            <MdIcon :path="mdiRestore" :size="22" />
            {{ $t('room.launch.resume') }}
          </UiButton>
          <UiButton
            variant="danger"
            size="lg"
            :disabled="launching"
            data-test="discard-saved"
            @click="onDiscard"
          >
            {{ $t('room.launch.discard') }}
          </UiButton>
        </div>
      </div>

      <div class="launch__actions">
        <UiButton
          v-if="setupNeeded"
          class="launch__action"
          :variant="savedGame ? 'default' : 'primary'"
          size="lg"
          data-test="start-setup"
          @click="router.push({ name: 'setup' })"
        >
          <MdIcon :path="mdiWizardHat" :size="24" />
          {{ $t('room.launch.setup') }}
        </UiButton>

        <UiButton
          class="launch__action"
          :variant="savedGame || setupNeeded ? 'default' : 'primary'"
          size="lg"
          :disabled="launching"
          data-test="start-room"
          @click="onLaunch"
        >
          <MdIcon :path="mdiRocketLaunchOutline" :size="24" />
          {{ launching ? $t('room.launch.starting') : $t('room.launch.start') }}
        </UiButton>

        <UiButton
          v-if="!setupNeeded"
          class="launch__action"
          size="lg"
          data-test="reconfigure-room"
          @click="router.push({ name: 'setup' })"
        >
          {{ $t('room.launch.reconfigure') }}
        </UiButton>
      </div>

      <p v-if="fullscreenRefused" class="launch__warn" role="status">
        {{ $t('room.launch.fullscreenFailed') }}
      </p>
      <p class="launch__hint">{{ $t('room.launch.browserHint') }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  mdiLogout,
  mdiRestore,
  mdiRocketLaunchOutline,
  mdiTuneVariant,
  mdiWizardHat,
} from '@mdi/js'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import RoomTopBar from '@/components/game/RoomTopBar.vue'
import RoomReplacedNotice from '@/components/live/RoomReplacedNotice.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  discardSavedGame,
  discardStaleSavedGame,
  getExtractPlayer,
  hasSavedGame,
  resumeSavedGame,
} from '@/game/useRoomGame'
import { lockBuzzerSystemKeys, startLighting, useRoomHardware } from '@/hardware/roomHardware'
import { enterFullscreen, keepScreenAwake } from '@/hardware/screen'
import { signOut } from '@/state/roomAuth'

const { t } = useI18n()
const router = useRouter()
const { setupNeeded } = useRoomHardware()
const { confirm } = useConfirm()

// Une sauvegarde d'un autre contexte (démo, autre compte, partie close) n'est ni proposée ni gardée.
discardStaleSavedGame()
const savedGame = ref(hasSavedGame())
const launching = ref(false)
const fullscreenRefused = ref(false)

/**
 * « Lancer la salle » : un seul geste utilisateur qui débloque tout ce que le
 * navigateur réserve aux clics (plein écran, son), puis garde l'écran allumé.
 */
async function prepareRoom(): Promise<void> {
  const [fullscreen] = await Promise.all([
    enterFullscreen(),
    getExtractPlayer()
      .unlock()
      .catch(() => undefined),
  ])
  fullscreenRefused.value = !fullscreen
  // Lumières en ambiance, sans retarder le lancement : une interface DMX déjà
  // autorisée se reconnecte seule.
  void startLighting().catch(() => undefined)
  // Le verrou clavier n'a de sens (et n'est accepté) qu'en plein écran effectif.
  await Promise.all([keepScreenAwake(), fullscreen ? lockBuzzerSystemKeys() : false])
}

async function onLaunch(): Promise<void> {
  launching.value = true
  try {
    await prepareRoom()
    await router.push({ name: 'lobby' })
  } finally {
    launching.value = false
  }
}

async function onResume(): Promise<void> {
  launching.value = true
  try {
    await prepareRoom()
    if (await resumeSavedGame()) {
      await router.push({ name: 'play' })
    } else {
      savedGame.value = false
    }
  } finally {
    launching.value = false
  }
}

async function onDiscard(): Promise<void> {
  const ok = await confirm({ message: t('room.launch.discardConfirm'), variant: 'danger' })
  if (!ok) {
    return
  }
  discardSavedGame()
  savedGame.value = hasSavedGame()
}

async function onLogout(): Promise<void> {
  await signOut()
  await router.replace({ name: 'login' })
}
</script>

<style scoped>
.launch {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
}

.launch__body {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 18px;
  padding: 24px;
  text-align: center;
}

.launch__title {
  margin: 0;
  font-size: var(--stage-title);
  font-weight: 900;
}

.launch__subtitle {
  margin: 0;
  max-width: 760px;
  color: var(--text-1);
  font-size: var(--stage-small);
}

/* Panneau et colonne d'actions : une seule largeur, tout est aligné. */
.launch__resume,
.launch__actions {
  width: min(680px, 100%);
}

.launch__resume {
  display: grid;
  gap: 12px;
  padding: 20px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-2);
  background: var(--bg-card);
}

.launch__resume-title,
.launch__resume-text {
  margin: 0;
}

.launch__resume-title {
  font-size: var(--stage-small);
  font-weight: 900;
}

.launch__resume-text {
  color: var(--text-1);
}

.launch__resume-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.launch__actions {
  display: grid;
  gap: 12px;
}

.launch__action {
  width: 100%;
}

.launch__warn {
  margin: 0;
  color: var(--warn);
}

.launch__hint {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
}
</style>
