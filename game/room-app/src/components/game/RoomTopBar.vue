<template>
  <header class="topbar">
    <div class="topbar__brand">
      <div class="logo">
        <img :src="logoUrl" alt="" class="logo-img" />
      </div>
      <span class="topbar__name">{{ $t('room.brand') }}</span>
      <span v-if="isDemo" class="topbar__badge">{{ $t('room.demoBadge') }}</span>
      <span v-else-if="roomName" class="topbar__room">{{ roomName }}</span>
    </div>

    <div class="topbar__center">
      <slot />
    </div>

    <div class="topbar__actions">
      <slot name="actions" />
      <UiButton
        variant="icon"
        :aria-label="$t(fullscreen ? 'room.toolbar.exitFullscreen' : 'room.toolbar.fullscreen')"
        :title="$t(fullscreen ? 'room.toolbar.exitFullscreen' : 'room.toolbar.fullscreen')"
        @click="toggleFullscreen"
      >
        <MdIcon :path="fullscreen ? mdiFullscreenExit : mdiFullscreen" :size="20" />
      </UiButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import logoUrl from '@backoffice-assets/img/logo.png'
import { mdiFullscreen, mdiFullscreenExit } from '@mdi/js'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { enterFullscreen, exitFullscreen, isFullscreen } from '@/hardware/screen'
import { isDemo, roomAccount } from '@/state/roomAuth'

const fullscreen = ref(isFullscreen())
const roomName = computed(() => roomAccount.value?.username ?? '')

function sync(): void {
  fullscreen.value = isFullscreen()
}

async function toggleFullscreen(): Promise<void> {
  await (fullscreen.value ? exitFullscreen() : enterFullscreen())
  sync()
}

onMounted(() => document.addEventListener('fullscreenchange', sync))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync))
</script>

<style scoped>
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
  padding: 14px clamp(16px, 2.4vw, 36px);
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.topbar__name {
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 0.4px;
}

.topbar__badge,
.topbar__room {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.topbar__badge {
  color: var(--warn);
  background: var(--warn-bg);
  border: 1px solid var(--warn);
}

.topbar__room {
  color: var(--text-1);
  background: var(--surface-1);
  border: 1px solid var(--border-ui);
}

.topbar__center {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text-1);
  font-weight: 700;
  font-size: var(--stage-small);
}

.topbar__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
