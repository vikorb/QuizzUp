<template>
  <section class="hw-panel" data-test="assistant">
    <header class="hw-panel__head">
      <h2 class="hw-panel__title">{{ $t('hardware.assistant.title') }}</h2>
      <p class="hw-panel__status">
        {{
          $t('hardware.assistant.progress', {
            n: view.steps.indexOf(view.step) + 1,
            total: view.steps.length,
          })
        }}
        — {{ $t(`hardware.assistant.steps.${view.step}.title`) }}
      </p>
    </header>

    <ol class="steps" aria-hidden="true">
      <li
        v-for="id in view.steps"
        :key="id"
        :class="{ 'is-current': id === view.step, 'is-done': isBefore(id) }"
      >
        {{ $t(`hardware.assistant.steps.${id}.short`) }}
      </li>
    </ol>

    <p class="hw-hint">{{ $t(`hardware.assistant.steps.${view.step}.hint`) }}</p>

    <!-- 1. Navigateur -->
    <ul v-if="view.step === 'browser'" class="checks" data-test="step-browser">
      <li v-for="key in BROWSER_KEYS" :key="key" :class="view.browser?.[key] ? 'hw-ok' : 'ko'">
        {{ view.browser?.[key] ? '✓' : '✗' }} {{ $t(`hardware.assistant.browser.${key}`) }}
      </li>
    </ul>

    <!-- 2. Buzzers -->
    <div v-else-if="view.step === 'buzzers'" class="stack" data-test="step-buzzers">
      <div class="hw-actions">
        <label class="hw-field">
          {{ $t('hardware.assistant.buzzers.desks') }}
          <select :value="view.desks.length" data-test="desk-count" @change="onDeskCount">
            <option v-for="count in DESKS.length" :key="count" :value="count">{{ count }}</option>
          </select>
        </label>
        <label class="hw-field">
          {{ $t('hardware.assistant.buzzers.source') }}
          <select :value="sourceKind" data-test="buzzer-source" @change="onSourceKind">
            <option value="keyboard">{{ $t('hardware.assistant.buzzers.keyboard') }}</option>
            <option value="gamepad">{{ $t('hardware.assistant.buzzers.gamepad') }}</option>
          </select>
        </label>
        <label v-if="sourceKind === 'gamepad'" class="hw-field hw-field--grow">
          {{ $t('hardware.assistant.buzzers.match') }}
          <input
            :value="gamepadMatch"
            type="text"
            :placeholder="$t('hardware.assistant.buzzers.matchPlaceholder')"
            data-test="gamepad-match"
            @change="onGamepadMatch"
          />
        </label>
      </div>
      <p v-if="sourceKind === 'gamepad'" class="hw-alert" role="status">
        {{ $t('hardware.assistant.buzzers.gamepadWake') }}
      </p>
      <BuzzerSetup />
    </div>

    <!-- 3. Interface -->
    <div v-else-if="view.step === 'interface'" class="stack" data-test="step-interface">
      <label v-for="choice in INTERFACE_CHOICES" :key="choice.driver" class="choice">
        <input
          type="radio"
          name="driver"
          :value="choice.driver"
          :checked="view.config.lighting.driver === choice.driver"
          :data-test="`driver-${choice.driver}`"
          @change="onDriver(choice.driver)"
        />
        <span>
          <strong>{{ $t(`hardware.lights.drivers.${choice.driver}`) }}</strong>
          <em v-if="choice.recommended"> · {{ $t('hardware.assistant.interface.recommended') }}</em>
          <br />
          <small>{{ $t(`hardware.assistant.interface.about.${choice.driver}`) }}</small>
        </span>
      </label>
      <p v-if="view.config.lighting.driver === 'opendmx'" class="hw-alert" role="status">
        {{ $t('hardware.assistant.interface.experimental') }}
      </p>
      <div v-if="view.config.lighting.driver !== 'simulation'" class="hw-actions">
        <UiButton :disabled="connecting" data-test="assistant-connect" @click="onConnect">
          <MdIcon :path="mdiUsb" :size="18" />
          {{ $t('hardware.lights.connect') }}
        </UiButton>
        <span v-if="connected" class="hw-ok" role="status">
          {{ $t('hardware.assistant.interface.connected') }}
        </span>
      </div>
      <p v-if="connectError" class="hw-alert hw-alert--danger" role="alert">
        {{ $t(`hardware.diagnostic.errors.${connectError.code}`) }}
        <template v-if="connectError.hint"><br />{{ connectError.hint }}</template>
      </p>
    </div>

    <!-- 4. Appareils -->
    <div v-else-if="view.step === 'fixtures'" class="stack" data-test="step-fixtures">
      <div class="hw-actions">
        <UiButton data-test="import-six" @click="onImportSixDesk">
          {{ $t('hardware.assistant.fixtures.importSix') }}
        </UiButton>
        <label class="ui-btn ui-btn--default file-btn">
          {{ $t('hardware.assistant.fixtures.importCalibration') }}
          <input type="file" accept=".txt,.cfg,.ini,text/plain" @change="onCalibrationFile" />
        </label>
      </div>
      <p v-if="calibrationNote" class="hw-ok" role="status">{{ calibrationNote }}</p>

      <div class="hw-actions add">
        <label class="hw-field">
          {{ $t('hardware.assistant.fixtures.profile') }}
          <select v-model="draft.profileId" data-test="fixture-profile">
            <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }}
            </option>
          </select>
        </label>
        <label class="hw-field">
          {{ $t('hardware.assistant.fixtures.name') }}
          <input v-model="draft.name" type="text" data-test="fixture-name" />
        </label>
        <label class="hw-field">
          {{ $t('hardware.assistant.fixtures.desk') }}
          <select v-model="draft.desk" data-test="fixture-desk">
            <option :value="null">—</option>
            <option v-for="desk in view.desks" :key="desk" :value="desk">{{ desk }}</option>
          </select>
        </label>
        <label class="hw-field">
          {{ $t('hardware.assistant.fixtures.address') }}
          <input
            v-model.number="draft.address"
            type="number"
            min="1"
            max="512"
            :placeholder="String(suggested ?? '')"
            data-test="fixture-address"
          />
        </label>
        <UiButton variant="primary" data-test="fixture-add" @click="onAddFixture">
          {{ $t('hardware.assistant.fixtures.add') }}
        </UiButton>
      </div>
      <p class="hw-hint">
        {{ $t('hardware.assistant.fixtures.addressHint', { n: suggested ?? '—' }) }}
      </p>
      <p v-if="fixtureError" class="hw-alert hw-alert--danger" role="alert">
        {{ fixtureError }}
      </p>

      <ul class="list" data-test="fixture-list">
        <li v-for="fixture in view.config.lighting.fixtures" :key="fixture.id">
          <span>
            <strong>{{ fixture.name }}</strong>
            <small>
              {{ $t('hardware.diagnostic.address', { n: fixture.address }) }}
              <template v-if="fixture.desk"> · {{ $t('room.desk', { n: fixture.desk }) }}</template>
            </small>
          </span>
          <UiButton
            variant="icon"
            :aria-label="$t('hardware.assistant.fixtures.remove')"
            :title="$t('hardware.assistant.fixtures.remove')"
            @click="run(() => wizard.removeFixture(fixture.id))"
          >
            <MdIcon :path="mdiDeleteOutline" :size="18" />
          </UiButton>
        </li>
      </ul>
    </div>

    <!-- 5. Test des appareils -->
    <div v-else-if="view.step === 'fixtureTest'" class="stack" data-test="step-test">
      <ul class="list">
        <li v-for="fixture in testableFixtures" :key="fixture.id">
          <span>
            <strong>{{ fixture.name }}</strong>
            <small>{{ $t('hardware.diagnostic.address', { n: fixture.address }) }}</small>
          </span>
          <span class="hw-actions">
            <UiButton :data-test="`light-${fixture.id}`" @click="light(fixture.id, true)">
              {{ $t('hardware.assistant.test.on') }}
            </UiButton>
            <UiButton @click="light(fixture.id, false)">
              {{ $t('hardware.assistant.test.off') }}
            </UiButton>
            <UiButton
              :variant="view.fixtureTests[fixture.id] === 'ok' ? 'primary' : 'default'"
              :data-test="`ok-${fixture.id}`"
              @click="mark(fixture.id, 'ok')"
            >
              {{ $t('hardware.assistant.test.ok') }}
            </UiButton>
            <UiButton
              :variant="view.fixtureTests[fixture.id] === 'ko' ? 'danger' : 'default'"
              :data-test="`ko-${fixture.id}`"
              @click="mark(fixture.id, 'ko')"
            >
              {{ $t('hardware.assistant.test.ko') }}
            </UiButton>
          </span>
        </li>
      </ul>
    </div>

    <!-- 6. Positions des lyres -->
    <div v-else-if="view.step === 'positions'" class="stack" data-test="step-positions">
      <article v-for="head in movingHeads" :key="head.id" class="head">
        <strong>{{ head.name }}</strong>
        <div v-for="desk in head.desks" :key="desk" class="head__desk">
          <span>{{ $t('room.desk', { n: desk }) }}</span>
          <label class="hw-field hw-field--grow">
            {{ $t('hardware.assistant.positions.pan') }}
            <input
              type="range"
              min="0"
              max="65535"
              step="257"
              :value="head.positions[desk]?.pan ?? 32768"
              :data-test="`pan-${head.id}-${desk}`"
              @input="onAim(head.id, desk, 'pan', $event)"
            />
          </label>
          <label class="hw-field hw-field--grow">
            {{ $t('hardware.assistant.positions.tilt') }}
            <input
              type="range"
              min="0"
              max="65535"
              step="257"
              :value="head.positions[desk]?.tilt ?? 32768"
              :data-test="`tilt-${head.id}-${desk}`"
              @input="onAim(head.id, desk, 'tilt', $event)"
            />
          </label>
          <span :class="head.positions[desk] ? 'hw-ok' : 'hw-hint'">
            {{ head.positions[desk] ? '✓' : '…' }}
          </span>
        </div>
      </article>
    </div>

    <!-- 7. Fumée -->
    <div v-else-if="view.step === 'smoke'" class="stack" data-test="step-smoke">
      <label class="hw-check">
        <input
          type="checkbox"
          :checked="view.config.lighting.smoke.enabled"
          data-test="smoke-enable"
          @change="onSmokeEnabled"
        />
        <span>{{ $t('hardware.assistant.smoke.enable') }}</span>
      </label>
      <div class="hw-actions">
        <label class="hw-field">
          {{ $t('hardware.assistant.smoke.maxDuration') }}
          <input
            type="number"
            min="1"
            max="10"
            :value="view.config.lighting.smoke.maxDurationMs / 1000"
            data-test="smoke-duration"
            @change="onSmokeSeconds('maxDurationMs', $event)"
          />
        </label>
        <label class="hw-field">
          {{ $t('hardware.assistant.smoke.cooldown') }}
          <input
            type="number"
            min="5"
            :value="view.config.lighting.smoke.cooldownMs / 1000"
            @change="onSmokeSeconds('cooldownMs', $event)"
          />
        </label>
      </div>
      <h3 class="hw-panel__subtitle">{{ $t('hardware.assistant.smoke.checklist') }}</h3>
      <label v-for="check in SMOKE_CHECKS" :key="check" class="hw-check">
        <input
          type="checkbox"
          :checked="view.smokeChecks[check]"
          :disabled="check === 'freezeTest'"
          :data-test="`check-${check}`"
          @change="onCheck(check, $event)"
        />
        <span>{{ $t(`hardware.assistant.smoke.checks.${check}`) }}</span>
      </label>
      <p class="hw-hint">{{ $t('hardware.diagnostic.freezeHint') }}</p>
      <p v-if="freezeRefusal" class="hw-alert" role="status">{{ freezeRefusal }}</p>
      <div class="hw-actions">
        <UiButton
          variant="danger"
          :disabled="!canFreezeTest || freezePending"
          data-test="assistant-freeze"
          @click="onFreezeTest"
        >
          {{ $t('hardware.diagnostic.freeze') }}
        </UiButton>
      </div>
      <div v-if="freezePending" class="hw-alert" role="status" data-test="freeze-question">
        {{ $t('hardware.assistant.smoke.freezeQuestion') }}
        <div class="hw-actions">
          <UiButton variant="primary" data-test="freeze-ok" @click="onFreezeAnswer(true)">
            {{ $t('hardware.assistant.smoke.freezeYes') }}
          </UiButton>
          <UiButton variant="danger" data-test="freeze-ko" @click="onFreezeAnswer(false)">
            {{ $t('hardware.assistant.smoke.freezeNo') }}
          </UiButton>
        </div>
      </div>
      <p v-if="freezeFailed" class="hw-alert hw-alert--danger" role="alert">
        {{ $t('hardware.assistant.smoke.freezeFailed') }}
      </p>
    </div>

    <!-- 8. Récapitulatif -->
    <div v-else class="stack" data-test="step-summary">
      <div v-if="summary.problems.length > 0" class="hw-alert hw-alert--danger">
        <strong>{{ $t('hardware.advanced.problems') }}</strong>
        <ul>
          <li v-for="problem in summary.problems" :key="problem">{{ problem }}</li>
        </ul>
      </div>
      <div v-if="summary.warnings.length > 0" class="hw-alert" data-test="summary-warnings">
        <ul>
          <li v-for="warning in summary.warnings" :key="warning">{{ warning }}</li>
        </ul>
      </div>
      <p v-if="summary.problems.length === 0" class="hw-ok">
        {{ $t('hardware.assistant.summary.ready') }}
      </p>
      <div class="hw-actions">
        <UiButton variant="primary" :disabled="saving" data-test="assistant-save" @click="onSave">
          {{ $t('hardware.assistant.summary.save') }}
        </UiButton>
        <span v-if="saved" class="hw-ok" role="status">{{ $t('hardware.advanced.saved') }}</span>
      </div>
    </div>

    <ul v-if="blockers.length > 0" class="hw-alert blockers" data-test="blockers">
      <li v-for="blocker in blockers" :key="blocker">{{ blocker }}</li>
    </ul>

    <div class="hw-actions nav">
      <UiButton :disabled="view.steps[0] === view.step" data-test="assistant-back" @click="onBack">
        {{ $t('hardware.assistant.back') }}
      </UiButton>
      <UiButton
        v-if="view.step !== 'summary'"
        variant="primary"
        :disabled="blockers.length > 0"
        data-test="assistant-next"
        @click="onNext"
      >
        {{ $t('hardware.assistant.next') }}
      </UiButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { mdiDeleteOutline, mdiUsb } from '@mdi/js'
import {
  type BrowserCheck,
  checkBrowser,
  createSetupWizard,
  describeSerialError,
  type Desk,
  DESKS,
  type DmxDriver,
  findProfile,
  GENERIC_PROFILES,
  INTERFACE_CHOICES,
  type PanTilt,
  parsePanTiltCalibration,
  type SerialErrorDescription,
  type SetupStepId,
  SMOKE_CHECKS,
  type SmokeCheckId,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  connectDmxInterface,
  getLighting,
  saveRoomHardwareConfig,
  startLighting,
  useRoomHardware,
} from '@/hardware/roomHardware'
import { useFreezeTest } from '@/hardware/useFreezeTest'
import BuzzerSetup from '@/views/hardware/BuzzerSetup.vue'

const BROWSER_KEYS = [
  'webSerial',
  'secureContext',
  'gamepad',
] as const satisfies readonly (keyof BrowserCheck)[]
const CENTER: PanTilt = { pan: 32_768, tilt: 32_768 }

const { t } = useI18n()
const { hardware } = useRoomHardware()
const { run: runFreezeTest, refusal: freezeRefusal } = useFreezeTest()

const wizard = createSetupWizard(hardware.value.config)
wizard.setBrowserCheck(checkBrowser())
const view = shallowRef(wizard.getState())
const blockers = shallowRef(wizard.blockers())

const draft = reactive<{
  profileId: string
  name: string
  desk: Desk | null
  address: number | ''
}>({ profileId: 'par-rgb', name: '', desk: null, address: '' })
const fixtureError = ref<string | null>(null)
const calibrationNote = ref<string | null>(null)
const connecting = ref(false)
const connected = ref(false)
const connectError = ref<SerialErrorDescription | null>(null)
const freezePending = ref(false)
const freezeFailed = ref(false)
const saving = ref(false)
const saved = ref(false)
/** La config enregistrée a la fumée active pour le test de gel : à refermer en quittant. */
let savedForFreezeTest = false

function sync(): void {
  view.value = wizard.getState()
  blockers.value = wizard.blockers()
}

function run(action: () => unknown): void {
  action()
  sync()
}

const summary = computed(() => {
  void view.value
  return wizard.summary()
})
const sourceKind = computed(() => view.value.config.buzzers.source?.kind ?? 'keyboard')
const gamepadMatch = computed(() => {
  const source = view.value.config.buzzers.source
  return source?.kind === 'gamepad' ? (source.match ?? '') : ''
})
const profiles = computed(() => [...GENERIC_PROFILES, ...view.value.config.lighting.customProfiles])
const suggested = computed(() => {
  void view.value
  const profile = findProfile(draft.profileId, view.value.config.lighting.customProfiles)
  return profile ? wizard.suggestAddress(profile.channels.length) : null
})
const kindOf = (profileId: string) =>
  findProfile(profileId, view.value.config.lighting.customProfiles)?.kind
const testableFixtures = computed(() =>
  view.value.config.lighting.fixtures.filter((fixture) => kindOf(fixture.profileId) !== 'smoke')
)
const movingHeads = computed(() =>
  view.value.config.lighting.fixtures
    .filter((fixture) => kindOf(fixture.profileId) === 'movingHead')
    .map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      desks: fixture.desk === undefined ? view.value.desks : [fixture.desk],
      positions: fixture.deskPositions ?? {},
    }))
)
const canFreezeTest = computed(
  () => view.value.smokeChecks.physicalStop && view.value.smokeChecks.timedRelay
)

const isBefore = (id: SetupStepId) =>
  view.value.steps.indexOf(id) < view.value.steps.indexOf(view.value.step)

// Les buzzers appris dans l'étape 2 sont enregistrés par l'écran Buzzers : on les reprend.
watch(
  () => hardware.value.config.buzzers.keymap,
  (keymap) => run(() => wizard.setKeymap(keymap))
)

/** Applique la config en cours au contrôleur de lumières (nécessaire pour tester). */
async function apply(options: { forFreezeTest?: boolean } = {}): Promise<void> {
  savedForFreezeTest = options.forFreezeTest === true
  await saveRoomHardwareConfig(wizard.summary(options).config)
  await startLighting()
}

function onDeskCount(event: Event): void {
  const count = Number((event.target as HTMLSelectElement).value)
  run(() => wizard.setDesks(DESKS.slice(0, count)))
}

function onSourceKind(event: Event): void {
  const kind = (event.target as HTMLSelectElement).value
  run(() => wizard.setBuzzerSource(kind === 'gamepad' ? { kind: 'gamepad' } : { kind: 'keyboard' }))
}

function onGamepadMatch(event: Event): void {
  const match = (event.target as HTMLInputElement).value.trim()
  run(() => wizard.setBuzzerSource({ kind: 'gamepad', ...(match ? { match } : {}) }))
}

function onDriver(driver: DmxDriver): void {
  connected.value = false
  connectError.value = null
  run(() => wizard.setDriver(driver))
}

async function onConnect(): Promise<void> {
  connecting.value = true
  connectError.value = null
  try {
    // Le choix du port s'ouvre dans le clic ; la config suit ensuite.
    await connectDmxInterface(view.value.config.lighting.driver)
    connected.value = true
  } catch (error) {
    const described = describeSerialError(error)
    connectError.value = described.code === 'cancelled' ? null : described
  } finally {
    connecting.value = false
  }
}

function onAddFixture(): void {
  fixtureError.value = null
  const result = wizard.addFixture({
    profileId: draft.profileId,
    name: draft.name,
    ...(draft.desk === null ? {} : { desk: draft.desk }),
    ...(draft.address === '' ? {} : { address: draft.address }),
  })
  if (result.ok) {
    draft.name = ''
    draft.address = ''
  } else {
    fixtureError.value = result.detail ?? t(`hardware.assistant.fixtures.errors.${result.reason}`)
  }
  sync()
}

function onImportSixDesk(): void {
  run(() => wizard.importSixDeskPreset())
}

async function onCalibrationFile(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }
  const calibration = parsePanTiltCalibration(await file.text())
  const applied = wizard.applyCalibration(calibration)
  calibrationNote.value = t('hardware.assistant.fixtures.calibrationApplied', { n: applied })
  sync()
}

function light(id: string, on: boolean): void {
  getLighting()?.diagnostics.setFixture(id, {
    color: { r: 255, g: 255, b: 255, w: 255 },
    intensity: on ? 1 : 0,
  })
}

function mark(id: string, result: 'ok' | 'ko'): void {
  light(id, false)
  run(() => wizard.markFixtureTest(id, result))
}

function onAim(id: string, desk: Desk, axis: 'pan' | 'tilt', event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  const head = movingHeads.value.find((item) => item.id === id)
  const position = { ...CENTER, ...head?.positions[desk], [axis]: value }
  run(() => wizard.setDeskPosition(id, desk, position))
  getLighting()?.diagnostics.setFixture(id, {
    position,
    color: { r: 255, g: 255, b: 255, w: 255 },
    intensity: 1,
  })
}

function onSmokeEnabled(event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  run(() => wizard.setSmoke({ enabled }))
}

function onSmokeSeconds(key: 'maxDurationMs' | 'cooldownMs', event: Event): void {
  const seconds = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(seconds)) {
    run(() => wizard.setSmoke({ [key]: Math.round(seconds * 1000) }))
  }
}

function onCheck(check: SmokeCheckId, event: Event): void {
  run(() => wizard.checkSmoke(check, (event.target as HTMLInputElement).checked))
}

async function onFreezeTest(): Promise<void> {
  freezeFailed.value = false
  run(() => wizard.setSmoke({ enabled: true }))
  await apply({ forFreezeTest: true })
  freezePending.value = await runFreezeTest()
}

function onFreezeAnswer(ok: boolean): void {
  freezePending.value = false
  freezeFailed.value = !ok
  run(() => wizard.checkSmoke('freezeTest', ok))
}

/** Les tests ont besoin des appareils dans le contrôleur et du mode diagnostic. */
async function enterStep(step: SetupStepId): Promise<void> {
  if (step === 'fixtureTest' || step === 'positions') {
    await apply()
    getLighting()?.diagnostics.begin()
  } else if (step === 'smoke') {
    await apply()
  } else {
    getLighting()?.diagnostics.end()
  }
}

async function onNext(): Promise<void> {
  const leaving = view.value.step
  run(() => wizard.next())
  if (view.value.step !== leaving) {
    await enterStep(view.value.step)
  }
}

async function onBack(): Promise<void> {
  run(() => wizard.back())
  await enterStep(view.value.step)
}

async function onSave(): Promise<void> {
  saving.value = true
  saved.value = false
  try {
    getLighting()?.diagnostics.end()
    savedForFreezeTest = false
    await saveRoomHardwareConfig(wizard.summary().config)
    saved.value = true
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(() => {
  getLighting()?.diagnostics.end()
  // Jamais de fumée laissée active sans toutes les vérifications.
  if (savedForFreezeTest) {
    void saveRoomHardwareConfig(wizard.summary().config)
  }
})
</script>

<style scoped>
.stack {
  display: grid;
  gap: 12px;
}

.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.steps li {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-ui);
  color: var(--text-2);
  font-size: 13px;
}

.steps li.is-done {
  color: var(--ok);
}

.steps li.is-current {
  border-color: var(--accent-purple);
  color: var(--text-0);
  font-weight: 700;
}

.checks {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.checks .ko {
  color: var(--danger);
}

.choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
  cursor: pointer;
}

.choice input {
  margin-top: 4px;
  accent-color: var(--accent-purple);
}

.choice small {
  color: var(--text-2);
}

.file-btn {
  position: relative;
  cursor: pointer;
}

.file-btn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
}

.list li > span:first-child {
  display: grid;
}

.list small {
  color: var(--text-2);
}

.head {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-ui);
  background: var(--surface-0);
}

.head__desk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}

.blockers {
  padding-left: 32px;
}

.nav {
  justify-content: space-between;
}
</style>
