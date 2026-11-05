<template>
  <main class="hardware stage-bg">
    <RoomTopBar>
      <span>{{ $t('hardware.title') }}</span>
      <template #actions>
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
      <nav class="hardware__tabs" role="tablist">
        <UiButton
          v-for="tab in TABS"
          :key="tab"
          variant="seg"
          role="tab"
          :class="{ 'is-active': current === tab }"
          :aria-selected="current === tab"
          :data-test="`tab-${tab}`"
          @click="current = tab"
        >
          {{ $t(`hardware.tabs.${tab}`) }}
        </UiButton>
      </nav>

      <SetupAssistant v-if="current === 'assistant'" />
      <BuzzerSetup v-else-if="current === 'buzzers'" />
      <PlanSetup v-else-if="current === 'plan'" />
      <LightingSetup v-else-if="current === 'lights'" />
      <DiagnosticPanel v-else-if="current === 'diagnostic'" />
      <AdvancedConfig v-else />

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
import { ref } from 'vue'
import { useRouter } from 'vue-router'

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
const current = ref<(typeof TABS)[number]>('buzzers')

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

.hardware__tabs {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 960px) {
  .hardware__tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.hardware__tabs .ui-btn {
  justify-content: center;
}

@media (max-width: 640px) {
  .hardware__tabs {
    grid-template-columns: 1fr;
  }
}

.hardware__note {
  text-align: center;
}

.hardware__note--error {
  color: var(--warn);
}
</style>
