<template>
  <main class="hardware stage-bg">
    <RoomTopBar>
      <span>{{ $t('hardware.title') }}</span>
      <template #actions>
        <UiButton data-test="reconfigure-room" @click="router.push({ name: 'setup' })">
          {{ $t('room.launch.reconfigure') }}
        </UiButton>
        <UiButton
          variant="icon"
          :aria-label="$t('hardware.back')"
          :title="$t('hardware.back')"
          @click="onBack"
        >
          <MdIcon :path="mdiArrowLeft" :size="20" />
        </UiButton>
      </template>
    </RoomTopBar>

    <section class="hardware__body">
      <div
        ref="tabsEl"
        class="hardware__tabs"
        role="tablist"
        :aria-label="$t('hardware.title')"
        @keydown="onTabKey"
      >
        <button
          v-for="tab in TABS"
          :id="`hardware-tab-${tab}`"
          :key="tab"
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab--active': current === tab }"
          :aria-selected="current === tab"
          aria-controls="hardware-panel"
          :tabindex="current === tab ? 0 : -1"
          :data-test="`tab-${tab}`"
          @click="current = tab"
        >
          {{ $t(`hardware.tabs.${tab}`) }}
        </button>
      </div>

      <div
        id="hardware-panel"
        role="tabpanel"
        :aria-labelledby="`hardware-tab-${current}`"
        data-test="tab-panel"
      >
        <SetupAssistant v-if="current === 'assistant'" />
        <BuzzerSetup v-else-if="current === 'buzzers'" />
        <PlanSetup v-else-if="current === 'plan'" />
        <LightingSetup v-else-if="current === 'lights'" />
        <DiagnosticPanel v-else-if="current === 'diagnostic'" />
        <AdvancedConfig v-else />
      </div>

      <p
        class="hw-hint hardware__note"
        :class="{
          'hardware__note--error':
            syncStatus === 'error' || syncStatus === 'rejected' || syncStatus === 'conflict',
        }"
        data-test="sync-status"
      >
        {{ $t(`hardware.sync.${syncStatus}`) }}
      </p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { mdiArrowLeft } from '@mdi/js'
import { nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import RoomTopBar from '@/components/game/RoomTopBar.vue'
import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useRoomHardware } from '@/hardware/roomHardware'
import AdvancedConfig from '@/views/hardware/AdvancedConfig.vue'
import BuzzerSetup from '@/views/hardware/BuzzerSetup.vue'
import DiagnosticPanel from '@/views/hardware/DiagnosticPanel.vue'
import LightingSetup from '@/views/hardware/LightingSetup.vue'
import PlanSetup from '@/views/hardware/PlanSetup.vue'
import SetupAssistant from '@/views/hardware/SetupAssistant.vue'

const TABS = ['assistant', 'buzzers', 'plan', 'lights', 'diagnostic', 'advanced'] as const

const router = useRouter()
const { syncStatus } = useRoomHardware()
const route = useRoute()
const requestedTab = TABS.find((tab) => tab === route.query.tab)
const current = ref<(typeof TABS)[number]>(requestedTab ?? 'buzzers')
const tabsEl = ref<HTMLElement | null>(null)

/** Flèches (circulaires), Début et Fin : l'onglet visé s'ouvre et prend le focus. */
const TAB_KEYS = new Map<string, (index: number) => number>([
  ['ArrowRight', (index) => (index + 1) % TABS.length],
  ['ArrowLeft', (index) => (index + TABS.length - 1) % TABS.length],
  ['Home', () => 0],
  ['End', () => TABS.length - 1],
])

async function onTabKey(event: KeyboardEvent): Promise<void> {
  const target = TABS[TAB_KEYS.get(event.key)?.(TABS.indexOf(current.value)) ?? -1]
  if (!target) {
    return
  }
  event.preventDefault()
  current.value = target
  await nextTick()
  tabsEl.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
}

async function onBack(): Promise<void> {
  await router.push({ name: 'launch' })
}
</script>

<style scoped>
.hardware {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow-y: auto;
}

.hardware__body {
  display: grid;
  align-content: start;
  gap: 18px;
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 8px clamp(16px, 2.4vw, 36px) 28px;
}

/* Barre d'onglets : une seule bande mate, l'onglet actif est marqué. Elle défile si l'écran est étroit. */
.hardware__tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius-card);
  background: var(--surface-0);
  overflow-x: auto;
}

.tab {
  flex: 1 0 auto;
  min-height: var(--tap-min);
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: var(--radius-ctl);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: var(--tr);
}

.tab:hover {
  background: var(--surface-2);
  color: var(--text-0);
}

.tab--active,
.tab--active:hover {
  border-color: var(--border-2);
  background: linear-gradient(135deg, var(--glow-blue), var(--glow-pink)), var(--bg-card-hi);
  box-shadow: var(--glow-active);
  color: var(--text-0);
}

.tab:focus-visible {
  outline: 2px solid var(--accent-purple);
  outline-offset: 2px;
}

/* Rail 768-1024 px : libellés resserrés, la barre reste sur une seule rangée (et défile si besoin). */
@media (max-width: 1024px) {
  .tab {
    padding: 0 12px;
    font-size: 13px;
  }
}

.hardware__note {
  text-align: center;
}

.hardware__note--error {
  color: var(--warn);
}
</style>
