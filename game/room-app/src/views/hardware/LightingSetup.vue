<template>
  <section class="hw-panel">
    <header class="hw-panel__head">
      <h2 class="hw-panel__title">{{ $t('hardware.lights.title') }}</h2>
      <p class="hw-panel__status" data-test="lights-status">
        {{ $t('hardware.lights.driver') }} : {{ $t(`hardware.lights.drivers.${driver}`) }}
        <template v-if="state && !state.simulation">
          — {{ $t(`hardware.lights.status.${state.outputStatus}`) }}
        </template>
      </p>
    </header>

    <div v-if="state?.emergency" class="hw-alert hw-alert--danger" role="alert">
      {{ $t('hardware.lights.emergencyActive') }}
    </div>
    <p v-if="warningText" class="hw-alert" role="status">{{ warningText }}</p>
    <p v-if="connectFailed" class="hw-alert hw-alert--danger" role="alert">
      {{ $t('hardware.lights.connectFailed') }}
    </p>

    <div class="hw-actions">
      <UiButton
        v-if="state?.emergency"
        variant="primary"
        data-test="emergency-reset"
        @click="emergency.reset"
      >
        {{ $t('hardware.lights.emergencyReset') }}
      </UiButton>
      <UiButton v-else variant="danger" data-test="emergency-stop" @click="emergency.stop">
        <MdIcon :path="mdiAlertOctagonOutline" :size="18" />
        {{ $t('hardware.lights.emergencyStop') }}
      </UiButton>

      <template v-if="driver !== 'simulation'">
        <UiButton
          :disabled="(!webSerial && driver !== 'artnet-bridge') || connecting"
          data-test="dmx-connect"
          @click="onConnect"
        >
          <MdIcon :path="mdiUsb" :size="18" />
          {{ $t('hardware.lights.connect') }}
        </UiButton>
        <UiButton v-if="state && !state.simulation" @click="onUseSimulation">
          {{ $t('hardware.lights.useSimulation') }}
        </UiButton>
      </template>
    </div>
    <p class="hw-hint">
      {{
        driver === 'simulation'
          ? $t('hardware.lights.simulationDriver')
          : webSerial
            ? $t('hardware.lights.simulated')
            : $t('hardware.lights.noWebSerial')
      }}
    </p>
    <p class="hw-hint">{{ $t('hardware.lights.physicalStop') }}</p>

    <h3 class="hw-panel__subtitle">{{ $t('hardware.smoke.title') }}</h3>
    <p v-if="smoke?.status === 'disabled'" class="hw-hint">{{ $t('hardware.smoke.disabled') }}</p>
    <div v-else class="smoke">
      <label class="smoke__arm">
        <input
          type="checkbox"
          :checked="smoke?.armed ?? false"
          :disabled="!lighting || state?.emergency"
          data-test="smoke-arm"
          @change="onArm"
        />
        <span>{{ $t('hardware.smoke.arm') }}</span>
      </label>
      <span class="smoke__status">
        {{ smoke ? $t(`hardware.smoke.status.${smoke.status}`) : '' }}
      </span>
      <UiButton :disabled="!smoke?.armed" data-test="smoke-test" @click="onSmokeTest">
        {{ $t('hardware.smoke.test') }}
      </UiButton>
      <p class="hw-hint smoke__hint">{{ $t('hardware.smoke.armHint') }}</p>
      <p v-if="smokeRefusal" class="hw-alert" role="status">
        {{ $t(`hardware.smoke.refused.${smokeRefusal}`) }}
      </p>
    </div>

    <h3 class="hw-panel__subtitle">{{ $t('hardware.lights.scenes') }}</h3>
    <div class="hw-actions">
      <label class="scene-desk">
        {{ $t('hardware.lights.sceneDesk') }}
        <select v-model.number="sceneDesk">
          <option v-for="desk in desks" :key="desk" :value="desk">{{ desk }}</option>
        </select>
      </label>
      <UiButton
        v-for="sceneId in TEST_SCENES"
        :key="sceneId"
        :disabled="!lighting || state?.emergency"
        :data-test="`scene-${sceneId}`"
        @click="lighting?.playScene(sceneId, { desk: sceneDesk })"
      >
        {{ $t(`hardware.scenes.${sceneId}`) }}
      </UiButton>
    </div>

    <h3 class="hw-panel__subtitle">{{ $t('hardware.lights.fixtures') }}</h3>
    <p v-if="fixtures.length === 0" class="hw-hint">{{ $t('hardware.lights.noFixtures') }}</p>
    <div v-else class="rig" data-test="rig">
      <article v-for="fixture in fixtures" :key="fixture.id" class="fixture">
        <span class="fixture__lamp" :style="lampStyle(fixture)" aria-hidden="true" />
        <div class="fixture__text">
          <strong>{{ fixture.name }}</strong>
          <small>
            {{ $t(`hardware.lights.kinds.${fixture.kind}`) }}
            <template v-if="fixture.desk"> · {{ $t('room.desk', { n: fixture.desk }) }}</template>
          </small>
        </div>
        <UiButton
          variant="icon"
          :aria-label="$t('hardware.lights.identify')"
          :title="$t('hardware.lights.identify')"
          :disabled="!lighting"
          @click="lighting?.identifyFixture(fixture.id)"
        >
          <MdIcon :path="mdiLightbulbOnOutline" :size="18" />
        </UiButton>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { mdiAlertOctagonOutline, mdiLightbulbOnOutline, mdiUsb } from '@mdi/js'
import {
  type FixtureView,
  isWebSerialSupported,
  SCENE_IDS,
  type SmokeRefusal,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { type DeskNumber } from '@/hardware/buzzers'
import {
  connectDmxInterface,
  startLighting,
  switchToSimulatedLights,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { useEmergencyStop } from '@/hardware/useEmergencyStop'

/** Rafraîchissement de la salle simulée (les scènes s'animent en fondu). */
const RIG_REFRESH_MS = 100
const SMOKE_TEST_MS = 2000

const TEST_SCENES = [
  SCENE_IDS.IDLE,
  SCENE_IDS.GAME_START,
  SCENE_IDS.BUZZ,
  SCENE_IDS.CORRECT,
  SCENE_IDS.WRONG,
  SCENE_IDS.LOST,
  SCENE_IDS.VICTORY,
] as const

const { t } = useI18n()
const { hardware, desks, lightingState: state, lighting } = useRoomHardware()
const emergency = useEmergencyStop()

const fixtures = shallowRef<FixtureView[]>([])
const sceneDesk = ref<DeskNumber>(1)
// Moins de pupitres qu'avant : le pupitre d'essai des scènes revient au dernier qui existe.
watch(desks, (list) => {
  if (!list.includes(sceneDesk.value)) {
    sceneDesk.value = list.at(-1) ?? 1
  }
})
const connecting = ref(false)
const connectFailed = ref(false)
const smokeRefusal = ref<SmokeRefusal | null>(null)
const webSerial = isWebSerialSupported()
let rigTimer: ReturnType<typeof setInterval> | null = null

const driver = computed(() => hardware.value.config.lighting.driver)
const smoke = computed(() => state.value?.smoke ?? null)
const warningText = computed(() => {
  const warning = state.value?.lastWarning
  if (!warning) {
    return null
  }
  // Une fumée refusée dit pourquoi (non autorisée, pause de sécurité…).
  return warning.kind === 'smoke_refused'
    ? t(`hardware.smoke.refused.${warning.reason}`)
    : t(`hardware.lights.warnings.${warning.kind}`)
})

function refreshRig(): void {
  fixtures.value = lighting.value?.getFixtureViews() ?? []
}

/** Couleur affichée d'un appareil : RVB + blanc, atténués par l'intensité. */
function lampStyle(fixture: FixtureView): Record<string, string> {
  const white = fixture.color.w ?? 0
  const channel = (value: number) => Math.min(255, Math.round(value + white))
  const color = `rgb(${channel(fixture.color.r)} ${channel(fixture.color.g)} ${channel(fixture.color.b)})`
  return {
    '--lamp-color': color,
    '--lamp-intensity': String(Math.max(0, Math.min(1, fixture.intensity))),
  }
}

async function onConnect(): Promise<void> {
  connecting.value = true
  connectFailed.value = false
  try {
    await connectDmxInterface()
  } catch {
    connectFailed.value = true
  } finally {
    connecting.value = false
  }
}

async function onUseSimulation(): Promise<void> {
  await switchToSimulatedLights()
}

function onArm(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  smokeRefusal.value = null
  if (checked) {
    lighting.value?.smoke.arm()
  } else {
    lighting.value?.smoke.disarm()
  }
}

function onSmokeTest(): void {
  const result = lighting.value?.smoke.fire(SMOKE_TEST_MS)
  smokeRefusal.value = result && !result.ok ? result.reason : null
}

onMounted(() => {
  void startLighting()
    .catch(() => undefined)
    .then(refreshRig)
  rigTimer = setInterval(refreshRig, RIG_REFRESH_MS)
})

onBeforeUnmount(() => {
  if (rigTimer !== null) {
    clearInterval(rigTimer)
    rigTimer = null
  }
})
</script>

<style scoped>
.smoke {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
}

.smoke__arm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  cursor: pointer;
}

.smoke__arm input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent-purple);
}

.smoke__status {
  color: var(--text-2);
}

.smoke__hint {
  flex-basis: 100%;
}

.scene-desk {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
}

.scene-desk select {
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-ui);
  background: var(--bg-field);
  color: var(--text-0);
}

.rig {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.fixture {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
}

.fixture__lamp {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border-2);
  background: var(--lamp-color);
  opacity: calc(0.15 + 0.85 * var(--lamp-intensity));
  box-shadow: 0 0 calc(28px * var(--lamp-intensity)) var(--lamp-color);
}

.fixture__text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.fixture__text small {
  color: var(--text-2);
}
</style>
