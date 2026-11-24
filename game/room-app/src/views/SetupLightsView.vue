<template>
  <WizardStage
    :step="stepNumber"
    :total="STEPS.length"
    :data-step="step"
    quit-test="lights-quit"
    @quit="onQuit"
  >
    <Transition name="lights-step" mode="out-in">
      <section v-if="step === 'scan'" key="scan" class="lights__stage">
        <h1 class="lights__title">{{ $t('setupLights.scan.title') }}</h1>
        <p class="lights__text">{{ $t('setupLights.scan.text') }}</p>
        <div class="scan">
          <UiButton
            size="lg"
            class="scan__item"
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
          <ul class="scan__status" aria-live="polite">
            <li
              v-if="usbFound"
              class="status status--ok"
              role="status"
              data-test="lights-found-usb"
            >
              <MdIcon :path="mdiCheckCircle" :size="26" />
              {{ $t('setupLights.scan.usbFound') }}
            </li>
            <li v-for="node in nodes" :key="node.ip">
              <UiButton
                size="lg"
                class="scan__item"
                :aria-pressed="chosenIp === node.ip"
                data-test="lights-found-node"
                @click="onPickNode(node.ip)"
              >
                <MdIcon :path="mdiCheckCircle" :size="26" />
                {{ $t('setupLights.scan.nodeFound', { ip: node.ip }) }}
              </UiButton>
            </li>
            <li v-if="searching" class="status" role="status" data-test="lights-searching">
              {{ $t('setupLights.scan.searching') }}
            </li>
            <li
              v-if="usbMessage"
              class="status status--warn"
              role="alert"
              data-test="lights-usb-error"
            >
              {{ usbMessage }}
            </li>
            <li
              v-if="dmxPortProblem"
              class="status status--warn"
              role="alert"
              data-test="lights-dmx-port-problem"
            >
              {{ $t(`hardware.devices.dmx.${dmxPortProblem}`) }}
            </li>
            <li v-if="nothingFound" class="status" role="status" data-test="lights-none">
              {{ $t('setupLights.scan.none') }}
            </li>
          </ul>
        </div>
      </section>

      <section v-else-if="step === 'equip'" key="equip" class="lights__stage">
        <h1 class="lights__title">{{ $t('setupLights.equip.title') }}</h1>
        <p v-if="equipError" class="lights__error" role="alert" data-test="lights-equip-error">
          {{
            equipError === 'template'
              ? $t('setupLights.equip.templateRefused')
              : $t('setupLights.equip.smokeConflict')
          }}
        </p>
        <div class="choices">
          <button
            type="button"
            class="choice"
            aria-labelledby="lights-choice-six-title"
            aria-describedby="lights-choice-six-hint"
            data-test="lights-six-desk"
            :disabled="choosing"
            @click="choose(onSixDesk)"
          >
            <strong id="lights-choice-six-title">{{ $t('setupLights.equip.sixDesk') }}</strong>
            <span id="lights-choice-six-hint">{{ $t('setupLights.equip.sixDeskHint') }}</span>
          </button>
          <button
            v-if="fixtureCount > 0"
            type="button"
            class="choice"
            aria-labelledby="lights-choice-keep-title"
            aria-describedby="lights-choice-keep-hint"
            data-test="lights-keep"
            :disabled="choosing"
            @click="choose(onKeep)"
          >
            <strong id="lights-choice-keep-title">{{ $t('setupLights.equip.keep') }}</strong>
            <span id="lights-choice-keep-hint">
              {{ $t('setupLights.equip.keepHint', { n: fixtureCount }) }}
            </span>
          </button>
          <button
            type="button"
            class="choice"
            aria-labelledby="lights-choice-later-title"
            aria-describedby="lights-choice-later-hint"
            data-test="lights-later"
            @click="onLater"
          >
            <strong id="lights-choice-later-title">{{ $t('setupLights.equip.later') }}</strong>
            <span id="lights-choice-later-hint">{{ $t('setupLights.equip.laterHint') }}</span>
          </button>
        </div>
        <section class="models" aria-labelledby="lights-models-title" data-test="lights-models">
          <h2 id="lights-models-title" class="lights__small">
            {{ $t('setupLights.models.title') }}
          </h2>
          <ul class="models__list">
            <li v-for="model in models" :key="model.template.id">
              <button
                type="button"
                class="model"
                :disabled="choosing || model.needsArtnet"
                :data-test="`lights-model-${model.template.id}`"
                @click="choose(() => onModel(model.template))"
              >
                <strong>{{ model.name }}</strong>
                <span>{{ model.hint }}</span>
              </button>
            </li>
          </ul>
        </section>
      </section>

      <section v-else-if="step === 'test' && current" key="test" class="lights__stage">
        <p
          v-if="universesRefused"
          class="lights__small"
          role="status"
          data-test="lights-universes-refused"
        >
          {{ $t('setupLights.equip.universesRefused') }}
        </p>
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
        <p
          v-if="phase === 'asking'"
          class="lights__question"
          aria-live="polite"
          data-test="lights-question"
        >
          {{ $t('setupLights.test.question') }}
        </p>
        <div v-else class="help" role="status" data-test="lights-help">
          <strong>{{ $t('setupLights.test.helpTitle') }}</strong>
          <ul>
            <li>{{ $t('setupLights.test.helpAddress', { address: current.address }) }}</li>
            <li>{{ $t('setupLights.test.helpCable') }}</li>
          </ul>
        </div>
      </section>

      <section v-else-if="step === 'smoke'" key="smoke" class="lights__stage">
        <h1 class="lights__title" data-test="lights-smoke">{{ $t('setupLights.smoke.title') }}</h1>
        <p class="lights__text">{{ $t('setupLights.smoke.text') }}</p>
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
          <li v-for="fixture in tests" :key="fixture.id" class="result">
            <span>{{ fixture.name }}</span>
            <span class="result__state">
              <span
                :class="[
                  'status-dot',
                  results[fixture.id] === 'ok' ? 'status-dot--ok' : 'status-dot--ko',
                ]"
                aria-hidden="true"
              />
              {{
                results[fixture.id] === 'ok' ? $t('setupLights.done.ok') : $t('setupLights.done.ko')
              }}
            </span>
          </li>
        </ul>
        <p v-if="koCount > 0" class="lights__small">{{ $t('setupLights.done.koHint') }}</p>
        <p v-if="saveError" class="lights__error" role="alert" data-test="lights-save-error">
          {{ $t('setup.done.saveError') }}
        </p>
      </section>
    </Transition>

    <template #back>
      <UiButton
        v-if="step === 'equip'"
        size="lg"
        :disabled="choosing"
        data-test="lights-equip-back"
        @click="onEquipBack"
      >
        {{ $t('setup.back') }}
      </UiButton>
    </template>

    <template #secondary>
      <template v-if="step === 'test'">
        <UiButton v-if="phase === 'asking'" size="lg" data-test="lights-no" @click="onNo">
          {{ $t('setupLights.test.no') }}
        </UiButton>
        <UiButton v-else size="lg" data-test="lights-skip" @click="onSkip">
          {{ $t('setupLights.test.skip') }}
        </UiButton>
      </template>
      <UiButton
        v-else-if="step === 'smoke'"
        size="lg"
        :disabled="saving"
        data-test="lights-smoke-link"
        @click="onSmokeLink"
      >
        {{ $t('setupLights.smoke.link') }}
      </UiButton>
    </template>

    <template #primary>
      <UiButton
        v-if="step === 'scan'"
        variant="primary"
        size="lg"
        :disabled="searching || usbSearching"
        data-test="lights-scan-next"
        @click="onScanNext"
      >
        {{ nothingFound ? $t('setupLights.scan.nextSimulation') : $t('setup.ok') }}
      </UiButton>
      <template v-else-if="step === 'test'">
        <UiButton
          v-if="phase === 'asking'"
          variant="primary"
          size="lg"
          data-test="lights-yes"
          @click="onYes"
        >
          {{ $t('setupLights.test.yes') }}
        </UiButton>
        <UiButton v-else variant="primary" size="lg" data-test="lights-retry" @click="onRetry">
          {{ $t('setupLights.test.retry') }}
        </UiButton>
      </template>
      <UiButton
        v-else-if="step === 'smoke'"
        variant="primary"
        size="lg"
        :disabled="saving"
        data-test="lights-smoke-next"
        @click="goDone"
      >
        {{ $t('setupLights.smoke.next') }}
      </UiButton>
      <UiButton
        v-else-if="step === 'done'"
        variant="primary"
        size="lg"
        :disabled="saving"
        data-test="lights-finish"
        @click="onFinish"
      >
        {{ $t('setup.done.finish') }}
      </UiButton>
    </template>
  </WizardStage>
</template>

<script setup lang="ts">
import { mdiCheckCircle, mdiUsb } from '@mdi/js'
import {
  type ArtnetNode,
  BridgePollError,
  checkBrowser,
  createRigFromTemplate,
  createSetupWizard,
  describeSerialError,
  findProfile,
  type FixtureConfig,
  proposeUniverses,
  ROOM_TEMPLATES,
  type RoomTemplate,
  type SetupWizard,
  type UniverseAssignment,
  unsupportedUniverseProblems,
  withDeviceIdentity,
} from '@quizzup/hardware'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import WizardStage from '@/components/setup/WizardStage.vue'
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

const STEPS = ['scan', 'equip', 'test', 'smoke', 'done'] as const
type Step = (typeof STEPS)[number]

const WHITE = { r: 255, g: 255, b: 255, w: 255 }

const { t, te } = useI18n()
const router = useRouter()
const { confirm } = useConfirm()
const { hardware, lightingState, dmxPortProblem } = useRoomHardware()

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

const stepNumber = computed(() => STEPS.indexOf(step.value) + 1)
const later = ref(false)
const tests = ref<FixtureConfig[]>([])
const index = ref(0)
const phase = ref<'asking' | 'help'>('asking')
const saving = ref(false)
const saveError = ref(false)
// Pourquoi le choix d'équipement est refusé : le modèle lui-même, ou la machine à fumée gardée.
const equipError = ref<'template' | 'smoke' | null>(null)
// La proposition d'univers n'a pas pu être faite sans recouvrir un appareil (fumée comprise).
const universesRefused = ref(false)
// Un choix d'équipement est en cours (confirmation ouverte, lumières appliquées) : pas de Retour.
const choosing = ref(false)
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
    // `false` : la carte de la fumée a été choisie, refusée (bandeau `dmxPortProblem`).
    if (!(await connectDmxInterface('usbpro'))) {
      return
    }
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

async function choose(action: () => Promise<void>): Promise<void> {
  if (choosing.value) {
    return
  }
  choosing.value = true
  try {
    await action()
  } finally {
    choosing.value = false
  }
}

function onEquipBack(): void {
  equipError.value = null
  step.value = 'scan'
}

const modelName = (template: RoomTemplate): string =>
  te(`setupLights.models.names.${template.id}`)
    ? t(`setupLights.models.names.${template.id}`)
    : template.name

// Un modèle qui place des appareils sur un univers que l'interface choisie ne sait pas émettre
// (USB : univers 0 seulement) serait sans signal : il n'est pas proposé.
const models = computed(() => {
  const { driver } = view.value.config.lighting
  const { desksCount } = view.value.config
  const announced =
    driver === 'artnet-bridge'
      ? (nodes.value.find((item) => item.ip === chosenIp.value)?.universes?.length ?? 0)
      : 0
  return ROOM_TEMPLATES.map((template) => {
    const rig = createRigFromTemplate(template)
    const needsArtnet = rig.ok && unsupportedUniverseProblems(rig.fixtures, driver).length > 0
    const used = rig.ok ? new Set(rig.fixtures.map((item) => item.universe ?? 0)).size : 0
    // Le nombre de pupitres réglé avec les buzzers fait foi : l'écart est dit, rien n'est exclu.
    let hint = needsArtnet
      ? t('setupLights.models.needsArtnet')
      : announced > 0 && used > announced
        ? t('setupLights.models.needsOutputs', { need: used, have: announced })
        : t('setupLights.models.hint', { desks: template.desksCount, n: template.fixtures.length })
    if (template.desksCount !== desksCount) {
      hint += ` · ${t('setupLights.models.desksDiffer', { n: desksCount })}`
    }
    return { template, name: modelName(template), needsArtnet, hint }
  })
})

const onSixDesk = (): Promise<void> =>
  equipFrom(t('setupLights.equip.replaceConfirm'), (target) => {
    target.importSixDeskPreset()
    return true
  })

const onModel = (template: RoomTemplate): Promise<void> =>
  equipFrom(
    t('setupLights.equip.replaceModelConfirm', { name: modelName(template) }),
    (target) => target.importRoomTemplate(template).ok
  )

/** Remplace les appareils (après confirmation s'il y en a), puis propose les univers et lance le test. */
async function equipFrom(
  replaceMessage: string,
  load: (target: SetupWizard) => boolean
): Promise<void> {
  if (fixtureCount.value > 0 && !(await confirm({ message: replaceMessage, variant: 'danger' }))) {
    return
  }
  // Le nombre de pupitres réglé avec les buzzers fait foi, quel que soit le modèle.
  const desksCount = view.value.config.desksCount
  const smokes = view.value.config.lighting.fixtures.filter(
    (item) => kindOf(item.profileId) === 'smoke'
  )
  // Essai à blanc : une machine à fumée dont l'adresse chevauche le modèle bloque l'import.
  equipError.value = importModel(createSetupWizard(view.value.config), load, smokes, desksCount)
  if (equipError.value) {
    return
  }
  run(() => importModel(wizard, load, smokes, desksCount))
  await offerUniverses()
  await startTests()
}

/**
 * Remplace les appareils par ceux du modèle, en gardant les machines à fumée existantes. Renvoie
 * `null` si tout est accepté, sinon ce qui est refusé : le modèle, ou la machine à fumée.
 */
function importModel(
  target: SetupWizard,
  load: (target: SetupWizard) => boolean,
  smokes: FixtureConfig[],
  desksCount: number
): 'template' | 'smoke' | null {
  if (!load(target)) {
    return 'template'
  }
  target.setDesksCount(desksCount)
  const kept = smokes.every(
    (smoke) =>
      target.addFixture({
        profileId: smoke.profileId,
        name: smoke.name,
        address: smoke.address,
        ...(smoke.universe === undefined ? {} : { universe: smoke.universe }),
        ...(smoke.desk === undefined ? {} : { desk: smoke.desk }),
      }).ok
  )
  return kept ? null : 'smoke'
}

async function onKeep(): Promise<void> {
  await startTests()
}

/**
 * Le boîtier Art-Net choisi annonce ses sorties : propose de placer les appareils du modèle sur les
 * univers correspondants. Rien ne change sans confirmation. La machine à fumée ne bouge jamais
 * (ni univers ni adresse), et aucun appareil ne peut arriver sur ses canaux : tout est essayé à
 * blanc sur une copie de l'assistant, et si un seul appareil est refusé rien n'est proposé.
 */
async function offerUniverses(): Promise<void> {
  universesRefused.value = false
  const node = nodes.value.find((item) => item.ip === chosenIp.value)
  const { driver, fixtures } = view.value.config.lighting
  if (!node || driver !== 'artnet-bridge') {
    return
  }
  const lights = fixtures.filter((item) => kindOf(item.profileId) !== 'smoke')
  const changes = proposeUniverses(node, lights)
  if (!changes) {
    return
  }
  if (!placeOnUniverses(createSetupWizard(view.value.config), changes)) {
    universesRefused.value = true
    return
  }
  const message = t('setupLights.equip.universesConfirm', {
    outputs: (node.universes ?? []).join(', '),
    n: changes.length,
  })
  if (await confirm({ message })) {
    run(() => placeOnUniverses(wizard, changes))
  }
}

/** Tout ou rien pour l'appelant : `false` dès qu'un appareil est refusé (chevauchement, fumée). */
function placeOnUniverses(target: SetupWizard, changes: UniverseAssignment[]): boolean {
  return changes.every(
    ({ fixtureId, universe }) => target.updateFixture(fixtureId, { universe }).ok
  )
}

function onLater(): void {
  later.value = true
  step.value = 'done'
}

// ── Étape 3 : test appareil par appareil ───────────────────────────────────

/** Applique les lumières à la page seulement (rien n'est enregistré avant la fin). */
async function applyToPage(): Promise<void> {
  await saveRoomHardwareConfig(withDeviceIdentity(wizard.summary().config, hardware.value.config), {
    persist: false,
  })
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
    // L'interface connectée pendant le parcours (`lighting.usb`) n'est pas dans `initial`.
    await saveRoomHardwareConfig({
      ...initial,
      lighting: withDeviceIdentity(wizard.summary().config, hardware.value.config).lighting,
    })
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
.lights__stage {
  display: grid;
  justify-items: center;
  gap: clamp(10px, 2.4vh, 28px);
  width: min(960px, 100%);
  margin: 0 auto;
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

/* Recherche d'interface : une seule colonne, tous les blocs à la même largeur. */
.scan {
  display: grid;
  gap: 16px;
  width: min(520px, 100%);
}

.scan__item {
  width: 100%;
}

.scan__status {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Message d'état : du texte, jamais une boîte qui ressemble à un bouton. */
.status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-1);
  font-size: var(--stage-small);
  font-weight: 700;
}

.status--ok svg {
  color: var(--ok);
}

.status--warn {
  color: var(--danger);
}

.scan__item[aria-pressed='true'] {
  background: var(--surface-3);
  border-color: var(--border-hover);
  color: var(--text-0);
}

/* Cartes de choix : même largeur, même hauteur, contenu aligné en haut. */
.choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 280px));
  justify-content: center;
  gap: 16px;
  width: 100%;
}

.choice {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 8px;
  padding: 24px 20px;
  border: 2px solid var(--border-ui);
  border-radius: var(--radius-card);
  background: var(--bg-1);
  color: var(--text-0);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--tr);
}

.choice strong {
  font-size: var(--stage-small);
  font-weight: 800;
}

.choice span {
  color: var(--text-2);
  font-size: var(--stage-small);
}

.choice:hover {
  border-color: var(--text-0);
}

/* Modèles de salle : une liste sobre sous les cartes, pas un second rang de cartes. */
.models {
  display: grid;
  justify-items: center;
  gap: 8px;
  width: min(640px, 100%);
}

.models__list {
  display: grid;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.model {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 48px;
  padding: 12px 20px;
  border: 2px solid var(--border-ui);
  border-radius: var(--radius-ctl);
  background: transparent;
  color: var(--text-0);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--tr);
}

.model strong {
  font-size: var(--stage-small);
  font-weight: 800;
}

.model span {
  color: var(--text-2);
  font-size: var(--stage-small);
}

.model:hover:not(:disabled) {
  border-color: var(--text-0);
}

.model:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fixture {
  display: grid;
  gap: 8px;
  width: min(640px, 100%);
  padding: 28px 24px;
  border: 3px solid var(--text-0);
  border-radius: var(--radius-card);
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

/* Récapitulatif en colonnes : six pupitres (15 appareils) tiennent sans défiler à 1280x800. */
.results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px 16px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  border-radius: var(--radius-ctl);
  border: 2px solid var(--border-ui);
  font-size: var(--stage-small);
  font-weight: 700;
  text-align: left;
}

.result__state {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Le statut est porté par la pastille, le texte garde sa couleur normale. */
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.status-dot--ok {
  background: var(--ok);
}

.status-dot--ko {
  background: var(--danger);
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
