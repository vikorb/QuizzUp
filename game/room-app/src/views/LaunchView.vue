<template>
  <main class="launch stage-bg">
    <RoomTopBar>
      <template #actions>
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
      <div v-if="savedGame" class="launch__resume neon neon--no-hover">
        <h2>{{ $t('room.launch.resumeTitle') }}</h2>
        <p>{{ $t('room.launch.resumeText') }}</p>
        <div class="launch__resume-actions">
          <UiButton variant="primary" :disabled="launching" @click="onResume">
            <MdIcon :path="mdiRestore" :size="18" />
            {{ $t('room.launch.resume') }}
          </UiButton>
          <UiButton variant="danger" :disabled="launching" @click="onDiscard">
            {{ $t('room.launch.discard') }}
          </UiButton>
        </div>
      </div>

      <h1 class="launch__title">{{ $t('room.launch.title') }}</h1>
      <p class="launch__subtitle">{{ $t('room.launch.subtitle') }}</p>

      <UiButton class="launch__start" variant="primary" :disabled="launching" @click="onLaunch">
        <MdIcon :path="mdiRocketLaunchOutline" :size="28" />
        {{ launching ? $t('room.launch.starting') : $t('room.launch.start') }}
      </UiButton>

      <p v-if="fullscreenRefused" class="launch__warn" role="status">
        {{ $t('room.launch.fullscreenFailed') }}
      </p>
      <p class="launch__hint">{{ $t('room.launch.browserHint') }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { mdiLogout, mdiRestore, mdiRocketLaunchOutline } from '@mdi/js'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import RoomTopBar from '@/components/game/RoomTopBar.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import {
  discardSavedGame,
  getExtractPlayer,
  hasSavedGame,
  resumeSavedGame,
} from '@/game/useRoomGame'
import { enterFullscreen, keepScreenAwake, lockSystemKeys } from '@/hardware/screen'
import { signOut } from '@/state/roomAuth'

const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()

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
  await Promise.all([keepScreenAwake(), lockSystemKeys()])
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
  place-content: center;
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

.launch__start {
  margin-top: 12px;
  padding: 22px 42px;
  border-radius: 20px;
  font-size: clamp(18px, 2vw, 28px);
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

.launch__resume {
  display: grid;
  gap: 10px;
  max-width: 640px;
  margin-bottom: 18px;
  padding: 20px 24px;
  border-radius: 18px;
  border: 1px solid var(--border-2);
  background: var(--bg-card-hi);
}

.launch__resume h2,
.launch__resume p {
  margin: 0;
}

.launch__resume p {
  color: var(--text-1);
}

.launch__resume-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
