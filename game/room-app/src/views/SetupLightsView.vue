<template>
  <main class="lights stage-bg" :data-step="step">
    <UiButton class="lights__quit" data-test="lights-quit" @click="onQuit">
      <MdIcon :path="mdiClose" :size="18" />
      {{ $t('setup.quit') }}
    </UiButton>

    <Transition name="lights-step" mode="out-in">
      <section v-if="step === 'scan'" key="scan" class="lights__stage">
        <h1 class="lights__title">{{ $t('setupLights.scan.title') }}</h1>
        <p class="lights__text">{{ $t('setupLights.scan.text') }}</p>
        <UiButton
          class="lights__big"
          :disabled="usbSearching || !webSerial"
          data-test="lights-usb"
          @click="onUsb"
        >
          <MdIcon :path="mdiUsb" :size="22" />
          {{ $t('setupLights.scan.usb') }}
        </UiButton>
        <p v-if="!webSerial" class="lights__small" data-test="lights-no-serial">
          {{ $t('setupLights.scan.noSerial') }}
        </p>
        <ul class="cards" aria-live="polite">
          <li v-if="usbFound" class="card card--ok" data-test="lights-found-usb">
            <MdIcon :path="mdiCheckCircle" :size="26" />
            {{ $t('setupLights.scan.usbFound') }}
          </li>
          <li v-for="node in nodes" :key="node.ip">
            <button
              type="button"
              class="card card--ok card--pick"
              :aria-pressed="chosenIp === node.ip"
              data-test="lights-found-node"
              @click="onPickNode(node.ip)"
            >
              <MdIcon :path="mdiCheckCircle" :size="26" />
              {{ $t('setupLights.scan.nodeFound', { ip: node.ip }) }}
            </button>
          </li>
          <li v-if="searching" class="card" data-test="lights-searching">
            {{ $t('setupLights.scan.searching') }}
          </li>
          <li v-if="usbMessage" class="card card--warn" role="alert" data-test="lights-usb-error">
            {{ usbMessage }}
          </li>
          <li v-if="nothingFound" class="card" data-test="lights-none">
            {{ $t('setupLights.scan.none') }}
          </li>
        </ul>
        <UiButton
          variant="primary"
          class="lights__big"
          :disabled="searching || usbSearching"
          data-test="lights-scan-next"
          @click="onScanNext"
        >
          {{ nothingFound ? $t('setupLights.scan.nextSimulation') : $t('setup.ok') }}
        </UiButton>
      </section>

      <section v-else-if="step === 'equip'" key="equip" class="lights__stage">
        <h1 class="lights__title">{{ $t('setupLights.equip.title') }}</h1>
        <p v-if="equipError" class="lights__error" role="alert" data-test="lights-equip-error">
          {{ $t('setupLights.equip.smokeConflict') }}
        </p>
        <div class="choices">
          <button type="button" class="choice" data-test="lights-six-desk" @click="onSixDesk">
            <strong>{{ $t('setupLights.equip.sixDesk') }}</strong>
            <span>{{ $t('setupLights.equip.sixDeskHint') }}</span>
          </button>
          <button
            v-if="fixtureCount > 0"
            type="button"
            class="choice"
            data-test="lights-keep"
            @click="onKeep"
          >
            <strong>{{ $t('setupLights.equip.keep') }}</strong>
            <span>{{ $t('setupLights.equip.keepHint', { n: fixtureCount }) }}</span>
          </button>
          <button type="button" class="choice" data-test="lights-later" @click="onLater">
            <strong>{{ $t('setupLights.equip.later') }}</strong>
            <span>{{ $t('setupLights.equip.laterHint') }}</span>
          </button>
        </div>
      </section>

      <section v-else-if="step === 'test' && current" key="test" class="lights__stage">
        <div
          class="progress"
          role="progressbar"
          aria-valuemin="0"
          :aria-valuemax="tests.length"
          :aria-valuenow="index"
          :aria-label="$t('setupLights.test.progress', { n: index + 1, total: tests.length })"
        >
          <div class="progress__bar" :style="{ width: `${(index / tests.length) * 100}%` }" />
        </div>
        <p class="lights__small">
          {{ $t('setupLights.test.progress', { n: index + 1, total: tests.length }) }}
        </p>
        <article :key="current.id" class="fixture" data-test="lights-fixture">
          <h1 class="fixture__name">{{ current.name }}</h1>
          <p class="fixture__meta">
            {{
              current.desk === undefined
                ? $t('setupLights.test.ambient')
                : $t('room.desk', { n: current.desk })
            }}
            ·
            {{ $t('setupLights.test.address', { address: addressLabel(current) }) }}
          </p>
        </article>
        <template v-if="phase === 'asking'">
          <p class="lights__question" aria-live="polite" data-test="lights-question">
            {{ $t('setupLights.test.question') }}
          </p>
          <div class="lights__actions">
            <UiButton variant="primary" class="lights__big" data-test="lights-yes" @click="onYes">
              {{ $t('setupLights.test.yes') }}
            </UiButton>
            <UiButton class="lights__big" data-test="lights-no" @click="onNo">
              {{ $t('setupLights.test.no') }}
            </UiButton>
          </div>
        </template>
        <template v-else>
          <div class="help" role="status" data-test="lights-help">
            <strong>{{ $t('setupLights.test.helpTitle') }}</strong>
            <ul>
              <li>{{ $t('setupLights.test.helpAddress', { address: current.address }) }}</li>
              <li>{{ $t('setupLights.test.helpCable') }}</li>
            </ul>
          </div>
          <div class="lights__actions">
            <UiButton
              variant="primary"
              class="lights__big"
              data-test="lights-retry"
              @click="onRetry"
            >
              {{ $t('setupLights.test.retry') }}
            </UiButton>
            <UiButton class="lights__big" data-test="lights-skip" @click="onSkip">
              {{ $t('setupLights.test.skip') }}
            </UiButton>
          </div>
        </template>
      </section>

      <section v-else-if="step === 'smoke'" key="smoke" class="lights__stage">
        <h1 class="lights__title" data-test="lights-smoke">{{ $t('setupLights.smoke.title') }}</h1>
        <p class="lights__text">{{ $t('setupLights.smoke.text') }}</p>
        <div class="lights__actions">
          <UiButton :disabled="saving" data-test="lights-smoke-link" @click="onSmokeLink">
            {{ $t('setupLights.smoke.link') }}
          </UiButton>
          <UiButton
            variant="primary"
            class="lights__big"
            :disabled="saving"
            data-test="lights-smoke-next"
            @click="goDone"
          >
            {{ $t('setupLights.smoke.next') }}
          </UiButton>
        </div>
      </section>

      <section v-else key="done" class="lights__stage">
        <h1 class="lights__title" data-test="lights-done">
          {{ later ? $t('setupLights.done.titleLater') : $t('setupLights.done.title') }}
        </h1>
        <p class="lights__text" data-test="lights-recap">
          {{
            later
              ? $t('setupLights.done.textLater')
              : $t('setupLights.done.recap', { ok: okCount, ko: koCount })
          }}
        </p>
        <ul v-if="!later" class="results">
          <li
            v-for="fixture in tests"
            :key="fixture.id"
            :class="results[fixture.id] === 'ok' ? 'result result--ok' : 'result result--ko'"
          >
            {{ fixture.name }}
            <span>{{
              results[fixture.id] === 'ok' ? $t('setupLights.done.ok') : $t('setupLights.done.ko')
            }}</span>
          </li>
        </ul>
        <p v-if="koCount > 0" class="lights__small">{{ $t('setupLights.done.koHint') }}</p>
        <p v-if="saveError" class="lights__error" role="alert" data-test="lights-save-error">
          {{ $t('setup.done.saveError') }}
        </p>
        <UiButton
          variant="primary"
          class="lights__big"
          :disabled="saving"
          data-test="lights-finish"
          @click="onFinish"
        >
          {{ $t('setup.done.finish') }}
        </UiButton>
      </section>
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { mdiCheckCircle, mdiClose, mdiUsb } from '@mdi/js'
import {
  type ArtnetNode,
  BridgePollError,
  checkBrowser,
  createSetupWizard,
  describeSerialError,
  findProfile,
  type FixtureConfig,
  type SetupWizard,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import MdIcon from '@/components/ui/MdIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useConfirm } from '@/composables/useConfirm'
import { playUiSound } from '@/game/useRoomGame'
import {
  connectDmxInterface,
  getLighting,
  pollArtnetNodes,
  saveRoomHardwareConfig,
  startLighting,
  stopLighting,
  switchToSimulatedLights,
  useRoomHardware,
} from '@/hardware/roomHardware'

type Step = 'scan' | 'equip' | 'test' | 'smoke' | 'done'

const WHITE = { r: 255, g: 255, b: 255, w: 255 }

const { t } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()
const { hardware, lightingState } = useRoomHardware()

// Config de départ : les buzzers (et tout le reste hors lumières) sont repris tels quels à la fin.
const initial = hardware.value.config
const wizard = createSetupWizard(initial)
const browser = checkBrowser()
wizard.setBrowserCheck(browser)
const webSerial = browser.webSerial
const view = shallowRef(wizard.getState())

function run(action: () => unknown): void {
  action()
  view.value = wizard.getState()
}

const step = ref<Step>('scan')
const usbFound = ref(
  lightingState.value?.simulation === false &&
    lightingState.value.outputStatus === 'open' &&
    initial.lighting.driver !== 'artnet-bridge'
)
const usbSearching = ref(false)
const usbMessage = ref<string | null>(null)
const nodes = ref<ArtnetNode[]>([])
const chosenIp = ref<string | null>(null)
const searching = ref(false)
const scanned = ref(false)
const nothingFound = computed(
  () => scanned.value && !searching.value && !usbFound.value && nodes.value.length === 0
)

const later = ref(false)
const tests = ref<FixtureConfig[]>([])
const index = ref(0)
const phase = ref<'asking' | 'help'>('asking')
const saving = ref(false)
const saveError = ref(false)
const equipError = ref(false)
let confirming = false
let leaving = false
// Une connexion (pont ou USB) a été ouverte pendant la recherche : à refermer si on quitte.
let opened = false
const wasSimulation = lightingState.value?.simulation === true
let finished = false

const current = computed(() => tests.value[index.value])
const results = computed(() => view.value.fixtureTests)
const okCount = computed(() => tests.value.filter((item) => results.value[item.id] === 'ok').length)
const koCount = computed(() => tests.value.length - okCount.value)
const kindOf = (profileId: string) =>
  findProfile(profileId, view.value.config.lighting.customProfiles)?.kind
const fixtureCount = computed(
  () =>
    view.value.config.lighting.fixtures.filter((item) => kindOf(item.profileId) !== 'smoke').length
)
const hasSmoke = computed(() =>
  view.value.config.lighting.fixtures.some((item) => kindOf(item.profileId) === 'smoke')
)

const addressLabel = (fixture: FixtureConfig): string =>
  fixture.universe ? `${fixture.address} (U${fixture.universe})` : String(fixture.address)

// ── Étape 1 : interface ────────────────────────────────────────────────────

/** Boîtiers Art-Net du réseau, par le pont local s'il tourne (jamais bloquant, jamais d'erreur). */
async function findNodes(): Promise<ArtnetNode[]> {
  try {
    return await pollArtnetNodes()
  } catch (error) {
    if (!(error instanceof BridgePollError) || error.code !== 'not_connected') {
      return []
    }
  }
  // Un pont déjà utilisé par l'USB ne doit pas être détourné.
  if (usbFound.value) {
    return []
  }
  opened = true
  await connectDmxInterface('artnet-bridge')
  try {
    return await pollArtnetNodes()
  } catch {
    return []
  }
}

async function searchNodes(): Promise<void> {
  searching.value = true
  try {
    nodes.value = await findNodes()
    const [first] = nodes.value
    if (first && !usbFound.value) {
      onPickNode(first.ip)
    }
  } finally {
    searching.value = false
    scanned.value = true
  }
}

function onPickNode(ip: string): void {
  chosenIp.value = ip
  run(() => {
    wizard.setDriver('artnet-bridge')
    wizard.setArtnetTarget(ip)
  })
}

/** Le choix de l'interface USB s'ouvre dans le clic (Web Serial exige un geste). */
async function onUsb(): Promise<void> {
  usbSearching.value = true
  usbMessage.value = null
  try {
    await connectDmxInterface('usbpro')
    opened = true
    usbFound.value = true
    chosenIp.value = null
    run(() => wizard.setDriver('usbpro'))
  } catch (error) {
    const described = describeSerialError(error)
    usbMessage.value =
      described.code === 'cancelled'
        ? t('setupLights.scan.usbNone')
        : `${described.message}. ${described.hint}`
  } finally {
    usbSearching.value = false
  }
}

function onScanNext(): void {
  if (nothingFound.value) {
    run(() => wizard.setDriver('simulation'))
  }
  step.value = 'equip'
}

// ── Étape 2 : équipement ───────────────────────────────────────────────────

async function onSixDesk(): Promise<void> {
  if (
    fixtureCount.value > 0 &&
    !(await confirm({ message: t('setupLights.equip.replaceConfirm'), variant: 'danger' }))
  ) {
    return
  }
  // Le modèle compte 6 pupitres, mais le nombre de pupitres réglé avec les buzzers fait foi.
  const desksCount = view.value.config.desksCount
  const smokes = view.value.config.lighting.fixtures.filter(
    (item) => kindOf(item.profileId) === 'smoke'
  )
  // Essai à blanc : une machine à fumée dont l'adresse chevauche le modèle bloque l'import.
  equipError.value = !importModel(createSetupWizard(view.value.config), smokes, desksCount)
  if (equipError.value) {
    return
  }
  run(() => importModel(wizard, smokes, desksCount))
  await startTests()
}

/** Remplace les appareils par le modèle 6 pupitres, en gardant les machines à fumée existantes. */
function importModel(target: SetupWizard, smokes: FixtureConfig[], desksCount: number): boolean {
  target.importSixDeskPreset()
  target.setDesksCount(desksCount)
  return smokes.every(
    (smoke) =>
      target.addFixture({
        profileId: smoke.profileId,
        name: smoke.name,
        address: smoke.address,
        ...(smoke.universe === undefined ? {} : { universe: smoke.universe }),
        ...(smoke.desk === undefined ? {} : { desk: smoke.desk }),
      }).ok
  )
}

async function onKeep(): Promise<void> {
  await startTests()
}

function onLater(): void {
  later.value = true
  step.value = 'done'
}

// ── Étape 3 : test appareil par appareil ───────────────────────────────────

/** Applique les lumières à la page seulement (rien n'est enregistré avant la fin). */
async function applyToPage(): Promise<void> {
  await saveRoomHardwareConfig(wizard.summary().config, { persist: false })
  await startLighting()
}

function light(id: string, on: boolean): void {
  getLighting()?.diagnostics.setFixture(id, { color: { ...WHITE }, intensity: on ? 1 : 0 })
}

async function startTests(): Promise<void> {
  tests.value = view.value.config.lighting.fixtures.filter(
    (item) => kindOf(item.profileId) !== 'smoke'
  )
  index.value = 0
  if (tests.value.length === 0) {
    afterTests()
    return
  }
  await applyToPage()
  if (leaving) {
    return
  }
  getLighting()?.diagnostics.begin()
  phase.value = 'asking'
  step.value = 'test'
  light(tests.value[0]!.id, true)
}

function nextFixture(result: 'ok' | 'ko'): void {
  const fixture = current.value
  if (!fixture) {
    return
  }
  light(fixture.id, false)
  run(() => wizard.markFixtureTest(fixture.id, result))
  playUiSound(result === 'ok' ? 'correct' : 'wrong')
  index.value += 1
  phase.value = 'asking'
  const upcoming = current.value
  if (upcoming) {
    light(upcoming.id, true)
  } else {
    afterTests()
  }
}

const onYes = (): void => nextFixture('ok')
const onSkip = (): void => nextFixture('ko')
const onNo = (): void => {
  phase.value = 'help'
}

function onRetry(): void {
  const fixture = current.value
  if (fixture) {
    // Éteint puis rallume : l'appareil reçoit une nouvelle trame après la correction.
    light(fixture.id, false)
    light(fixture.id, true)
  }
  phase.value = 'asking'
}

function afterTests(): void {
  getLighting()?.diagnostics.end()
  if (hasSmoke.value) {
    step.value = 'smoke'
  } else {
    goDone()
  }
}

// ── Fumée : jamais réglée ici ──────────────────────────────────────────────

function goDone(): void {
  step.value = 'done'
}

/** Enregistre les lumières puis ouvre l'assistant, où se règlent les gardes de la fumée. */
async function onSmokeLink(): Promise<void> {
  if (await save()) {
    await router.push({ name: 'hardware', query: { tab: 'assistant' } })
  }
}

// ── Fin ────────────────────────────────────────────────────────────────────

/** Seules les lumières changent : buzzers, plan et pupitres restent ceux de départ. */
async function save(): Promise<boolean> {
  saving.value = true
  saveError.value = false
  try {
    getLighting()?.diagnostics.end()
    await saveRoomHardwareConfig({ ...initial, lighting: wizard.summary().config.lighting })
    finished = true
    return true
  } catch {
    saveError.value = true
    return false
  } finally {
    saving.value = false
  }
}

async function onFinish(): Promise<void> {
  // « Plus tard » : rien n'a été réglé, rien n'est enregistré (le pilote reste celui de départ).
  if (later.value || (await save())) {
    await router.push({ name: 'launch' })
  }
}

async function onQuit(): Promise<void> {
  if (confirming) {
    return
  }
  confirming = true
  const ok = await confirm({ message: t('setup.quitConfirm'), variant: 'danger' })
  confirming = false
  if (ok) {
    await router.push({ name: 'launch' })
  }
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    void onQuit()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onEscape)
  void searchNodes()
})

onBeforeUnmount(() => {
  leaving = true
  window.removeEventListener('keydown', onEscape)
  getLighting()?.diagnostics.end()
  if (!finished) {
    void restoreStart()
  }
})

/** Parcours quitté : la page reprend les lumières enregistrées et l'état de connexion de départ. */
async function restoreStart(): Promise<void> {
  await saveRoomHardwareConfig(initial, { persist: false })
  if (!opened) {
    return
  }
  if (wasSimulation) {
    await switchToSimulatedLights()
  } else {
    await stopLighting()
    await startLighting()
  }
}
</script>

<style scoped>
.lights {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 64px 24px 24px;
  text-align: center;
  color: var(--text-0);
}

.lights__quit {
  position: absolute;
  top: 16px;
  right: 16px;
}

.lights__stage {
  display: grid;
  justify-items: center;
  gap: clamp(10px, 2.4vh, 28px);
  width: min(960px, 100%);
}

.lights__title {
  margin: 0;
  font-size: clamp(30px, 4vw, 52px);
  font-weight: 900;
  line-height: 1.1;
}

.lights__text {
  margin: 0;
  max-width: 48ch;
  color: var(--text-1);
  font-size: var(--stage-text);
}

.lights__small {
  margin: 0;
  color: var(--text-2);
  font-size: var(--stage-small);
  font-weight: 700;
}

.lights__question {
  margin: 0;
  font-size: clamp(24px, 3.2vw, 42px);
  font-weight: 900;
}

.lights__error {
  margin: 0;
  color: var(--danger);
  font-size: var(--stage-text);
}

.lights__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.lights__big {
  padding: 18px 44px;
  font-size: var(--stage-text);
  font-weight: 800;
}

.cards {
  display: grid;
  gap: 12px;
  width: min(560px, 100%);
  margin: 0;
  padding: 0;
  list-style: none;
}

.card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 16px 20px;
  border: 2px solid var(--border-ui);
  border-radius: 16px;
  background: var(--bg-1);
  color: var(--text-0);
  font-size: var(--stage-text);
  font-weight: 700;
}

.card--ok {
  border-color: var(--success);
}

.card--warn {
  border-color: var(--danger);
}

.card--pick {
  cursor: pointer;
  transition: var(--tr);
}

.card--pick[aria-pressed='true'] {
  background: var(--bg-2);
  box-shadow: 0 0 0 3px var(--text-0);
}

.choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.choice {
  display: grid;
  gap: 8px;
  width: min(280px, 100%);
  padding: 24px 20px;
  border: 2px solid var(--border-ui);
  border-radius: 20px;
  background: var(--bg-1);
  color: var(--text-0);
  font-size: var(--stage-text);
  cursor: pointer;
  transition: var(--tr);
}

.choice span {
  color: var(--text-2);
  font-size: var(--stage-small);
}

.choice:hover {
  border-color: var(--text-0);
}

.progress {
  width: min(560px, 100%);
  height: 12px;
  border-radius: 6px;
  background: var(--border-ui);
  overflow: hidden;
}

.progress__bar {
  height: 100%;
  background: var(--accent-blue);
  transition: width 300ms ease;
}

.fixture {
  display: grid;
  gap: 8px;
  width: min(640px, 100%);
  padding: 28px 24px;
  border: 3px solid var(--text-0);
  border-radius: 24px;
  background: var(--bg-1);
  animation: lights-pop 300ms ease;
}

.fixture__name {
  margin: 0;
  font-size: clamp(28px, 3.6vw, 46px);
  font-weight: 900;
}

.fixture__meta {
  margin: 0;
  color: var(--text-1);
  font-size: var(--stage-text);
}

.help {
  display: grid;
  gap: 6px;
  max-width: 56ch;
  color: var(--text-1);
  font-size: var(--stage-text);
  text-align: left;
}

.help ul {
  margin: 0;
  padding-left: 1.2em;
}

.results {
  display: grid;
  gap: 8px;
  width: min(560px, 100%);
  margin: 0;
  padding: 0;
  list-style: none;
}

.result {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-radius: 12px;
  border: 2px solid var(--border-ui);
  font-size: var(--stage-small);
  font-weight: 700;
}

.result--ok span {
  color: var(--success);
}

.result--ko span {
  color: var(--danger);
}

.lights-step-enter-active,
.lights-step-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.lights-step-enter-from {
  opacity: 0;
  transform: translateX(32px);
}

.lights-step-leave-to {
  opacity: 0;
  transform: translateX(-32px);
}

@keyframes lights-pop {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
}

button:focus-visible {
  outline: 4px solid var(--text-0);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .fixture {
    animation: none;
  }
}
</style>
