<template>
  <section class="hw-panel" data-test="diagnostic">
    <header class="hw-panel__head">
      <h2 class="hw-panel__title">{{ $t('hardware.diagnostic.title') }}</h2>
      <p class="hw-panel__status">{{ $t('hardware.diagnostic.hint') }}</p>
    </header>

    <div v-if="state?.emergency" class="hw-alert hw-alert--danger" role="alert">
      {{ $t('hardware.lights.emergencyActive') }}
    </div>

    <h3 class="hw-panel__subtitle">{{ $t('hardware.diagnostic.interface') }}</h3>
    <dl class="stats" data-test="diag-interface">
      <dt>{{ $t('hardware.lights.driver') }}</dt>
      <dd>{{ $t(`hardware.lights.drivers.${driver}`) }}</dd>
      <dt>{{ $t('hardware.diagnostic.port') }}</dt>
      <dd>{{ portLabel }}</dd>
      <dt>{{ $t('hardware.diagnostic.status') }}</dt>
      <dd>
        {{
          state?.simulation
            ? $t('hardware.diagnostic.simulated')
            : $t(`hardware.lights.status.${state?.outputStatus ?? 'closed'}`)
        }}
      </dd>
      <template v-if="stats">
        <dt>{{ $t('hardware.diagnostic.rate') }}</dt>
        <dd data-test="diag-rate">{{ $t('hardware.diagnostic.hz', { n: stats.measuredHz }) }}</dd>
        <dt>{{ $t('hardware.diagnostic.writeTime') }}</dt>
        <dd>
          {{
            $t('hardware.diagnostic.ms', {
              avg: stats.averageWriteMs.toFixed(1),
              max: stats.maxWriteMs.toFixed(1),
            })
          }}
        </dd>
        <dt>{{ $t('hardware.diagnostic.failures') }}</dt>
        <dd>{{ stats.failures }}</dd>
      </template>
    </dl>
    <p v-if="state?.outputError" class="hw-alert hw-alert--danger" role="alert">
      {{ state.outputError }}
    </p>
    <p v-if="connectError" class="hw-alert hw-alert--danger" role="alert" data-test="diag-error">
      {{ $t(`hardware.diagnostic.errors.${connectError.code}`) }}
      <template v-if="connectError.hint"><br />{{ connectError.hint }}</template>
    </p>
    <div class="hw-actions">
      <UiButton
        v-if="driver !== 'simulation'"
        :disabled="(!webSerial && driver !== 'artnet-bridge') || connecting"
        data-test="diag-connect"
        @click="onConnect"
      >
        <MdIcon :path="mdiUsb" :size="18" />
        {{ $t('hardware.lights.connect') }}
      </UiButton>
      <UiButton variant="danger" data-test="diag-emergency" @click="emergency.stop">
        <MdIcon :path="mdiAlertOctagonOutline" :size="18" />
        {{ $t('hardware.lights.emergencyStop') }}
      </UiButton>
      <UiButton v-if="state?.emergency" variant="primary" @click="emergency.reset">
        {{ $t('hardware.lights.emergencyReset') }}
      </UiButton>
    </div>

    <h3 class="hw-panel__subtitle">{{ $t('hardware.diagnostic.manual') }}</h3>
    <template v-if="!diag.active">
      <label class="hw-check">
        <input v-model="allowUnknown" type="checkbox" data-test="diag-unknown" />
        <span>{{ $t('hardware.diagnostic.allowUnknown') }}</span>
      </label>
      <p v-if="allowUnknown" class="hw-alert" role="status">
        {{ $t('hardware.diagnostic.unplugSmoke') }}
      </p>
      <div class="hw-actions">
        <UiButton
          variant="primary"
          :disabled="!lighting || state?.emergency"
          data-test="diag-begin"
          @click="onBegin"
        >
          {{ $t('hardware.diagnostic.begin') }}
        </UiButton>
      </div>
    </template>
    <template v-else>
      <p class="hw-hint">{{ $t('hardware.diagnostic.activeHint') }}</p>
      <div class="hw-actions">
        <label class="hw-field">
          {{ $t('hardware.diagnostic.channel') }}
          <input
            v-model.number="channel"
            type="number"
            min="1"
            max="512"
            data-test="diag-channel"
          />
        </label>
        <label class="hw-field hw-field--grow">
          {{ $t('hardware.diagnostic.value', { n: channelValue }) }}
          <input
            v-model.number="channelValue"
            type="range"
            min="0"
            max="255"
            data-test="diag-value"
            @input="sendChannel"
          />
        </label>
        <UiButton data-test="diag-send" @click="sendChannel">
          {{ $t('hardware.diagnostic.send') }}
        </UiButton>
      </div>
      <p v-if="refusal" class="hw-alert" role="status" data-test="diag-refusal">
        {{ $t(`hardware.diagnostic.refused.${refusal}`) }}
      </p>

      <div v-if="lightFixtures.length > 0" class="diag-rig">
        <article v-for="fixture in lightFixtures" :key="fixture.id" class="diag-fixture">
          <strong>{{ fixture.name }}</strong>
          <small>{{ $t('hardware.diagnostic.address', { n: fixture.address }) }}</small>
          <div class="hw-actions">
            <UiButton
              v-for="preset in COLOR_PRESETS"
              :key="preset.id"
              :data-test="`diag-${fixture.id}-${preset.id}`"
              @click="setFixture(fixture.id, preset)"
            >
              {{ $t(`hardware.diagnostic.colors.${preset.id}`) }}
            </UiButton>
          </div>
        </article>
      </div>

      <div class="hw-actions">
        <UiButton data-test="diag-clear" @click="onClear">
          {{ $t('hardware.diagnostic.clear') }}
        </UiButton>
        <UiButton variant="primary" data-test="diag-end" @click="onEnd">
          {{ $t('hardware.diagnostic.end') }}
        </UiButton>
      </div>

      <template v-if="hasSmoke">
        <h3 class="hw-panel__subtitle">{{ $t('hardware.diagnostic.freezeTitle') }}</h3>
        <p class="hw-hint">
          {{
            $t(
              signalLoss ? 'hardware.diagnostic.freezeHintSignal' : 'hardware.diagnostic.freezeHint'
            )
          }}
        </p>
        <p v-if="frozenLeft > 0" class="hw-alert" role="status" data-test="diag-frozen">
          {{ $t('hardware.diagnostic.frozen', { n: Math.ceil(frozenLeft / 1000) }) }}
        </p>
        <p v-else-if="freezeRefusal" class="hw-alert" role="status">
          {{ freezeRefusal }}
        </p>
        <div class="hw-actions">
          <UiButton
            variant="danger"
            :disabled="frozenLeft > 0 || state?.emergency"
            data-test="diag-freeze"
            @click="onFreezeTest"
          >
            {{ $t(signalLoss ? 'hardware.diagnostic.freezeSignal' : 'hardware.diagnostic.freeze') }}
          </UiButton>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { mdiAlertOctagonOutline, mdiUsb } from '@mdi/js'
import {
  describePort,
  describeSerialError,
  type DiagnosticRefusal,
  type DiagnosticsState,
  findProfile,
  isWebSerialSupported,
  type OutputStats,
  type Rgbw,
  type SerialErrorDescription,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  connectDmxInterface,
  getDmxPort,
  getDmxStats,
  startLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { useEmergencyStop } from '@/hardware/useEmergencyStop'
import { useFreezeTest } from '@/hardware/useFreezeTest'

const REFRESH_MS = 250

type ColorPreset = { id: string; color: Rgbw; intensity: number }

const COLOR_PRESETS: readonly ColorPreset[] = [
  { id: 'white', color: { r: 255, g: 255, b: 255, w: 255 }, intensity: 1 },
  { id: 'red', color: { r: 255, g: 0, b: 0, w: 0 }, intensity: 1 },
  { id: 'green', color: { r: 0, g: 255, b: 0, w: 0 }, intensity: 1 },
  { id: 'blue', color: { r: 0, g: 0, b: 255, w: 0 }, intensity: 1 },
  { id: 'off', color: { r: 0, g: 0, b: 0, w: 0 }, intensity: 0 },
]

const { t } = useI18n()
const { hardware, lightingState: state, lighting } = useRoomHardware()
const emergency = useEmergencyStop()
const { run: runFreezeTest, refusal: freezeRefusal, signalLoss } = useFreezeTest()
const webSerial = isWebSerialSupported()

const diag = shallowRef<DiagnosticsState>({
  active: false,
  allowUnknownChannels: false,
  frozenUntil: null,
})
const stats = shallowRef<OutputStats | null>(null)
const now = ref(performance.now())
const allowUnknown = ref(false)
const channel = ref(1)
const channelValue = ref(0)
const refusal = ref<DiagnosticRefusal | null>(null)
const connecting = ref(false)
const connectError = ref<SerialErrorDescription | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const driver = computed(() => hardware.value.config.lighting.driver)
const portLabel = computed(() => {
  // Relu à chaque rafraîchissement (le port change à la reconnexion).
  void now.value
  const port = getDmxPort()
  return port ? describePort(port) : t('hardware.diagnostic.noPort')
})
const lightFixtures = computed(() =>
  hardware.value.fixtures.filter((fixture) => fixture.profile.kind !== 'smoke')
)
const hasSmoke = computed(() =>
  hardware.value.config.lighting.fixtures.some(
    (fixture) =>
      findProfile(fixture.profileId, hardware.value.config.lighting.customProfiles)?.kind ===
      'smoke'
  )
)
const frozenLeft = computed(() =>
  diag.value.frozenUntil === null ? 0 : Math.max(0, diag.value.frozenUntil - now.value)
)

function refresh(): void {
  now.value = performance.now()
  diag.value = lighting.value?.diagnostics.getState() ?? {
    active: false,
    allowUnknownChannels: false,
    frozenUntil: null,
  }
  stats.value = getDmxStats()
}

async function onConnect(): Promise<void> {
  connecting.value = true
  connectError.value = null
  try {
    await connectDmxInterface()
  } catch (error) {
    const described = describeSerialError(error)
    connectError.value = described.code === 'cancelled' ? null : described
  } finally {
    connecting.value = false
    refresh()
  }
}

function onBegin(): void {
  const result = lighting.value?.diagnostics.begin({ allowUnknownChannels: allowUnknown.value })
  refusal.value = result && !result.ok ? result.reason : null
  refresh()
}

function onEnd(): void {
  lighting.value?.diagnostics.end()
  refusal.value = null
  refresh()
}

function onClear(): void {
  lighting.value?.diagnostics.clear()
  refusal.value = null
}

function sendChannel(): void {
  const result = lighting.value?.diagnostics.setChannel(channel.value, channelValue.value)
  refusal.value = result && !result.ok ? result.reason : null
}

function setFixture(id: string, preset: ColorPreset): void {
  const result = lighting.value?.diagnostics.setFixture(id, {
    color: preset.color,
    intensity: preset.intensity,
  })
  refusal.value = result && !result.ok ? result.reason : null
}

async function onFreezeTest(): Promise<void> {
  await runFreezeTest()
  refresh()
}

onMounted(() => {
  void startLighting()
    .catch(() => undefined)
    .then(refresh)
  timer = setInterval(refresh, REFRESH_MS)
})

onBeforeUnmount(() => {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  // On ne laisse jamais un diagnostic actif derrière soi : les scènes reprennent.
  lighting.value?.diagnostics.end()
})
</script>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 18px;
  margin: 0;
}

.stats dt {
  color: var(--text-2);
}

.stats dd {
  margin: 0;
  font-weight: 700;
}

.diag-rig {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.diag-fixture {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
}

.diag-fixture small {
  color: var(--text-2);
}
</style>
