<template>
  <BaseCard
    v-if="isPending"
    :title="$t('gameJoin.title')"
    :neon="true"
    :no-hover="true"
    class="game-join-card"
    data-test="game-join-panel"
  >
    <p class="game-join__note">{{ $t('gameJoin.subtitle') }}</p>

    <section class="game-join__link" data-test="game-join-link-section">
      <template v-if="isJoinOpen && join">
        <label class="game-join__label" for="game-join-url">{{ $t('gameJoin.linkLabel') }}</label>

        <div class="game-join__url-row">
          <input
            id="game-join-url"
            class="game-join__url"
            type="text"
            readonly
            data-test="game-join-url"
            :value="fullUrl"
            @focus="selectAll"
          />

          <UiButton type="button" data-test="game-join-copy" @click="copyLink">
            {{ $t(copied ? 'gameJoin.copied' : 'gameJoin.copy') }}
          </UiButton>
        </div>

        <p class="game-join__note" data-test="game-join-expires">
          {{ $t('gameJoin.linkExpires', { date: formatGameDate(join.expiresAt, locale) }) }}
        </p>

        <div v-if="qrSrc" class="game-join__qr-row">
          <img
            class="game-join__qr"
            :src="qrSrc"
            :alt="$t('gameJoin.qrAlt')"
            data-test="game-join-qr"
          />

          <UiButton
            ref="fullscreenTriggerRef"
            type="button"
            data-test="game-join-fullscreen"
            @click="fullscreen = true"
          >
            {{ $t('gameJoin.fullscreen') }}
          </UiButton>
        </div>

        <p v-else class="game-join__note" data-test="game-join-qr-help">
          {{ $t('gameJoin.qrUnavailable') }}
        </p>

        <div class="game-join__actions">
          <UiButton
            type="button"
            data-test="game-join-regenerate"
            :disabled="busy"
            :title="$t('gameJoin.regenerateHint')"
            @click="openJoin"
          >
            {{ $t('gameJoin.regenerate') }}
          </UiButton>

          <UiButton type="button" data-test="game-join-close" :disabled="busy" @click="closeJoin">
            {{ $t('gameJoin.close') }}
          </UiButton>
        </div>
      </template>

      <template v-else>
        <p class="game-join__note" data-test="game-join-closed">{{ $t('gameJoin.linkClosed') }}</p>

        <div class="game-join__actions">
          <UiButton type="button" data-test="game-join-open" :disabled="busy" @click="openJoin">
            {{ $t('gameJoin.open') }}
          </UiButton>
        </div>
      </template>
    </section>

    <p v-if="actionError" class="game-join__error" role="alert" data-test="game-join-action-error">
      {{ $t(getGameErrorKey(actionError)) }}
    </p>

    <div v-if="loadError" class="game-join__error" role="alert" data-test="game-join-load-error">
      <p>{{ $t(getGameErrorKey(loadError)) }}</p>

      <UiButton type="button" data-test="game-join-retry" @click="refresh">
        {{ $t('gameJoin.retry') }}
      </UiButton>
    </div>

    <p v-if="!loaded" class="game-join__note" data-test="game-join-loading">
      {{ $t('gameJoin.loading') }}
    </p>

    <template v-else>
      <p class="game-join__count" aria-live="polite" data-test="game-join-count">
        {{ $t('gameJoin.count', { count: registrations.length }, registrations.length) }}
      </p>

      <p
        v-if="registrations.length === 0 && !loadError"
        class="game-join__note"
        data-test="game-join-empty"
      >
        {{ $t('gameJoin.empty') }}
      </p>

      <ul
        v-if="registrations.length > 0"
        class="game-join__list"
        :aria-label="$t('gameJoin.listLabel')"
      >
        <li
          v-for="registration in registrations"
          :key="registration.id"
          class="game-join__item"
          :data-test="`game-join-registration-${registration.id}`"
        >
          <div class="game-join__who">
            <p class="game-join__name">{{ registration.displayName }}</p>
            <p v-if="registration.secondPlayer" class="game-join__note">
              {{ $t('gameJoin.secondPlayer', { name: registration.secondPlayer.displayName }) }}
            </p>
            <p v-if="registration.hasEmail" class="game-join__note">
              {{
                registration.email
                  ? $t('gameJoin.email', { email: registration.email })
                  : $t('gameJoin.emailMasked')
              }}
            </p>
            <p v-if="registration.marketingConsent" class="game-join__note">
              {{ $t('gameJoin.marketing') }}
            </p>
            <p class="game-join__note">
              {{
                $t('gameJoin.requestedAt', { date: formatGameDate(registration.createdAt, locale) })
              }}
            </p>
          </div>

          <SelectField
            :id="`game-join-podium-${registration.id}`"
            :model-value="podiums[registration.id] ?? PODIUM_AUTO"
            :label="$t('gameJoin.podium', { name: registration.displayName })"
            :options="podiumOptions"
            :disabled="busy"
            @update:model-value="podiums[registration.id] = String($event)"
          />

          <div class="game-join__actions">
            <UiButton
              type="button"
              data-test="game-join-accept"
              :disabled="busy"
              @click="accept(registration)"
            >
              {{ $t('gameJoin.accept') }}
            </UiButton>

            <UiButton
              variant="danger"
              type="button"
              data-test="game-join-refuse"
              :disabled="busy"
              @click="refuse(registration)"
            >
              {{ $t('gameJoin.refuse') }}
            </UiButton>
          </div>
        </li>
      </ul>
    </template>

    <Teleport to="body">
      <div
        v-if="fullscreenOpen"
        class="game-join-screen"
        data-test="game-join-screen"
        @click.self="fullscreen = false"
      >
        <div
          class="game-join-screen__dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="SCREEN_TITLE_ID"
        >
          <h2
            :id="SCREEN_TITLE_ID"
            class="game-join-screen__title"
            data-test="game-join-screen-title"
          >
            {{ $t('gameJoin.screenTitle', { room: getGameRoomName(game) }) }}
          </h2>

          <img
            class="game-join-screen__qr"
            :src="qrSrc ?? undefined"
            :alt="$t('gameJoin.qrAlt')"
            data-test="game-join-screen-qr"
          />

          <p class="game-join-screen__hint">{{ $t('gameJoin.screenHint') }}</p>

          <UiButton
            ref="screenCloseRef"
            type="button"
            data-test="game-join-screen-close"
            @click="fullscreen = false"
          >
            {{ $t('gameJoin.screenClose') }}
          </UiButton>
        </div>
      </div>
    </Teleport>
  </BaseCard>
</template>

<script setup lang="ts">
import { GAME_STATE_PENDING } from '@quizzup/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import BaseCard from '@/components/ui/BaseCard.vue'
import SelectField from '@/components/ui/form/SelectField.vue'
import UiButton from '@/components/ui/UiButton.vue'
import {
  acceptGameRegistrationService,
  closeGameJoinService,
  listGameRegistrationsService,
  listGameRoomsService,
  openGameJoinService,
  refuseGameRegistrationService,
} from '@/services/gamesService'
import type { SelectFieldOption } from '@/types/form'
import type { Game, GameRegistration } from '@/types/game'
import { getGameErrorKey } from '@/utils/game/errors'
import { getGamePodiums, getGameRoomDesksCount } from '@/utils/game/form'
import { formatGameDate, getGameRoomName } from '@/utils/game/format'

/** Interrogation provisoire : elle laissera place au flux du personnel (lot 1). */
const POLL_INTERVAL_MS = 5000
const SCREEN_TITLE_ID = 'game-join-screen-title'
/** Valeur du choix « premier pupitre libre » : le serveur prend le plus petit pupitre libre. */
const PODIUM_AUTO = ''

const props = defineProps<{
  game: Game
}>()

const emit = defineEmits<{
  /** Une demande a été validée : la liste des participants de la fiche doit être relue. */
  changed: []
}>()

const { t, locale } = useI18n()

const registrations = ref<GameRegistration[]>([])
const loaded = ref(false)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const busy = ref(false)
const copied = ref(false)
const join = ref(props.game.join ?? null)
const now = ref(Date.now())
const fullscreen = ref(false)
const fullscreenTriggerRef = ref<InstanceType<typeof UiButton> | null>(null)
const screenCloseRef = ref<InstanceType<typeof UiButton> | null>(null)
const desksCount = ref(getGameRoomDesksCount([], ''))
// Pupitre choisi par demande ; absent ou vide = premier libre.
const podiums = reactive<Record<number, string>>({})

let timer: ReturnType<typeof setInterval> | undefined
let refreshing = false

const isPending = computed(() => props.game.state === GAME_STATE_PENDING)
const isJoinOpen = computed(
  () => join.value !== null && Date.parse(join.value.expiresAt) > now.value
)

// Le serveur donne une adresse relative sans `PUBLIC_APP_URL` : le lien se complète avec l'origine du backoffice.
const fullUrl = computed(() => {
  const url = join.value?.url ?? ''

  return url.startsWith('/') ? `${window.location.origin}${url}` : url
})

// Le SVG vient du serveur : jamais injecté dans la page (`v-html`), seulement affiché comme image.
const qrSrc = computed(() => {
  const svg = join.value?.qrSvg

  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
})

// Le plein écran se ferme tout seul si le lien se ferme, expire ou si la partie démarre.
const fullscreenOpen = computed(
  () => fullscreen.value && isPending.value && isJoinOpen.value && qrSrc.value !== null
)

const takenPodiums = computed(
  () => new Set((props.game.participants ?? []).map((participant) => participant.podium))
)

const podiumOptions = computed<SelectFieldOption[]>(() => [
  { label: t('gameJoin.podiumAuto'), value: PODIUM_AUTO },
  ...getGamePodiums(desksCount.value).map((podium) => ({
    label: t('gameJoin.podiumOption', { podium }),
    value: String(podium),
    disabled: takenPodiums.value.has(podium),
  })),
])

watch(
  () => props.game.join,
  (value) => {
    join.value = value ?? null
  }
)

// Échap ferme le plein écran où que soit le focus ; le focus passe au bouton Fermer puis revient au déclencheur.
function onScreenKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    fullscreen.value = false
  }
}

watch(fullscreenOpen, async (open) => {
  if (open) {
    document.addEventListener('keydown', onScreenKeydown)
    await nextTick()
    screenCloseRef.value?.$el?.focus?.()
    return
  }

  document.removeEventListener('keydown', onScreenKeydown)
  fullscreen.value = false
  fullscreenTriggerRef.value?.$el?.focus?.()
})

async function refresh(): Promise<void> {
  if (refreshing) {
    return
  }

  refreshing = true

  try {
    const result = await listGameRegistrationsService(props.game.companyId, props.game.id)

    if (result.ok) {
      registrations.value = result.data.registrations
      loadError.value = null
    } else {
      loadError.value = result.error
    }
  } catch {
    loadError.value = 'server_error'
  } finally {
    refreshing = false
    loaded.value = true
    now.value = Date.now()
  }
}

function stopPolling(): void {
  if (timer !== undefined) {
    clearInterval(timer)
    timer = undefined
  }

  document.removeEventListener('visibilitychange', onVisibilityChange)
}

// Un onglet masqué n'interroge pas le serveur ; au retour, on relit tout de suite.
function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void refresh()
  }
}

function startPolling(): void {
  stopPolling()
  void refresh()
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      void refresh()
    }
  }, POLL_INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

// Partie lancée ou arrêtée : plus d'inscription, plus d'interrogation.
watch(
  isPending,
  (pending) => {
    if (pending) {
      startPolling()
    } else {
      stopPolling()
    }
  },
  { immediate: true }
)

// Le nombre de pupitres vient de la salle ; sans réponse, ceux d'une salle neuve.
async function loadDesksCount(): Promise<void> {
  try {
    const result = await listGameRoomsService(props.game.companyId)

    if (result.ok) {
      desksCount.value = getGameRoomDesksCount(result.data.rooms, String(props.game.roomId))
    }
  } catch {
    // Pupitres par défaut : le serveur refuse un pupitre hors de la salle.
  }
}

onMounted(() => {
  if (isPending.value) {
    void loadDesksCount()
  }
})

onBeforeUnmount(() => {
  stopPolling()
  document.removeEventListener('keydown', onScreenKeydown)
})

function selectAll(event: FocusEvent): void {
  if (event.target instanceof HTMLInputElement) {
    event.target.select()
  }
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(fullUrl.value)
    copied.value = true
  } catch {
    // Presse-papiers refusé : le lien reste sélectionnable dans le champ.
    copied.value = false
  }
}

/** Lance une action du personnel : un seul appel à la fois, l'erreur de l'API est affichée traduite. */
async function runAction(
  action: () => Promise<{ ok: true } | { ok: false; error: string }>
): Promise<boolean> {
  if (busy.value) {
    return false
  }

  busy.value = true
  actionError.value = null

  try {
    const result = await action()

    if (!result.ok) {
      actionError.value = result.error
    }

    return result.ok
  } catch {
    actionError.value = 'server_error'

    return false
  } finally {
    busy.value = false
  }
}

async function openJoin(): Promise<void> {
  await runAction(async () => {
    const result = await openGameJoinService(props.game.companyId, props.game.id)

    if (result.ok) {
      join.value = result.data.join
      now.value = Date.now()
      copied.value = false
    }

    return result
  })
}

async function closeJoin(): Promise<void> {
  await runAction(async () => {
    const result = await closeGameJoinService(props.game.companyId, props.game.id)

    if (result.ok) {
      join.value = null
    }

    return result
  })
}

function removeRegistration(id: number): void {
  registrations.value = registrations.value.filter((registration) => registration.id !== id)
}

async function accept(registration: GameRegistration): Promise<void> {
  const chosen = podiums[registration.id]
  const accepted = await runAction(() =>
    acceptGameRegistrationService(
      props.game.companyId,
      props.game.id,
      registration.id,
      chosen ? Number(chosen) : undefined
    )
  )

  if (accepted) {
    removeRegistration(registration.id)
    emit('changed')
    return
  }

  // Demande déjà traitée ailleurs, pupitre pris entre-temps : la liste affichée n'est plus la bonne.
  void refresh()
}

async function refuse(registration: GameRegistration): Promise<void> {
  const refused = await runAction(() =>
    refuseGameRegistrationService(props.game.companyId, props.game.id, registration.id)
  )

  if (refused) {
    removeRegistration(registration.id)
  } else {
    void refresh()
  }
}
</script>

<style scoped>
.game-join-card {
  margin-top: 18px;
}

.game-join__note {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.game-join__link {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.game-join__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.game-join__url-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.game-join__url {
  flex: 1 1 280px;
  min-width: 0;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--bg-field);
  color: var(--text-0);
  font: inherit;
}

.game-join__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.game-join__error {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-0);
  color: var(--danger);
  font-size: 13px;
}

.game-join__error p {
  margin: 0;
}

.game-join__count {
  margin: 20px 0 8px;
  color: var(--text-0);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.game-join__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.game-join__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(160px, 220px) auto;
  align-items: start;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border-ui);
  border-radius: var(--radius);
  background: var(--surface-0);
}

.game-join__who {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.game-join__name {
  margin: 0;
  color: var(--text-0);
  font-weight: 800;
  overflow-wrap: anywhere;
}

.game-join__qr-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
}

/* Fond clair et marge blanche (« zone de silence ») : sans eux le QR code n'est pas lisible en thème sombre. */
.game-join__qr {
  width: 180px;
  height: 180px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--qr-paper);
}

.game-join-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--overlay);
}

.game-join-screen__dialog {
  display: grid;
  justify-items: center;
  gap: 16px;
  max-height: 100%;
  padding: 24px;
  border: 1px solid var(--border-2);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  box-shadow: 0 24px 60px var(--shadow-2);
}

.game-join-screen__title {
  margin: 0;
  color: var(--text-0);
  font-size: 22px;
  font-weight: 800;
  text-align: center;
  overflow-wrap: anywhere;
}

.game-join-screen__qr {
  width: min(70vmin, 560px);
  height: min(70vmin, 560px);
  padding: 24px;
  border-radius: var(--radius);
  background: var(--qr-paper);
}

.game-join-screen__hint {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
  text-align: center;
}

@media (max-width: 900px) {
  .game-join__item {
    grid-template-columns: 1fr;
  }
}
</style>
