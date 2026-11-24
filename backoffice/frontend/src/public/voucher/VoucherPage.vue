<template>
  <main class="voucher">
    <header class="voucher__head">
      <img v-if="voucher?.logoUrl" class="voucher__logo" :src="voucher.logoUrl" alt="" />
      <div>
        <h1 class="voucher__title">{{ t('pageTitle') }}</h1>
        <p v-if="voucher" class="voucher__venue">{{ voucher.companyName }}</p>
      </div>
    </header>

    <p v-if="screen === 'loading'" class="voucher__text" role="status">{{ t('loading') }}</p>

    <section v-else class="voucher__state">
      <h2 id="state-title" tabindex="-1">{{ t(SCREENS[screen].title) }}</h2>
      <p class="voucher__text">{{ t(SCREENS[screen].text, { date, seconds }) }}</p>

      <dl v-if="screen === 'valid' && voucher" class="voucher__detail">
        <dt>{{ voucher.label }}</dt>
        <dd class="voucher__code">
          <span class="voucher__code-label">{{ t('codeLabel') }}</span>
          {{ code }}
        </dd>
        <dd class="voucher__hint">{{ t('validUntil', { date }) }}</dd>
      </dl>

      <UiButton
        v-if="screen === 'lookupFailed' || screen === 'tooMany'"
        class="voucher__btn"
        variant="primary"
        :disabled="screen === 'tooMany' && waiting"
        @click="load"
      >
        {{ t('retry') }}
      </UiButton>
    </section>
  </main>
</template>

<script setup lang="ts">
import { formatVoucherCode, type VoucherState } from '@quizzup/shared'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'
import { createTranslator, detectLocale } from '@/public/i18n'

import { voucherMessages } from './messages'
import { lookupVoucher, type PublicVoucher } from './voucherApi'

type MessageKey = Parameters<ReturnType<typeof createTranslator<typeof voucherMessages.fr>>>[0]

type Screen = 'loading' | VoucherState | 'notFound' | 'lookupFailed' | 'tooMany'

const locale = detectLocale()
const t = createTranslator(voucherMessages, locale)

// Titre et texte de chaque écran d'état (le chargement n'a pas de titre).
const SCREENS: Record<Exclude<Screen, 'loading'>, { title: MessageKey; text: MessageKey }> = {
  valid: { title: 'validTitle', text: 'validText' },
  redeemed: { title: 'redeemedTitle', text: 'redeemedText' },
  expired: { title: 'expiredTitle', text: 'expiredText' },
  cancelled: { title: 'cancelledTitle', text: 'cancelledText' },
  notFound: { title: 'notFoundTitle', text: 'notFoundText' },
  lookupFailed: { title: 'lookupFailedTitle', text: 'lookupFailedText' },
  tooMany: { title: 'tooManyTitle', text: 'tooManyText' },
}

// Le code est dans le fragment : il ne part jamais dans une requête de page ni dans un journal.
// Le fragment peut arriver encodé (`%20`) : repli sur la valeur brute s'il est mal encodé.
function readCode() {
  const raw = window.location.hash.slice(1)

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
const fragment = ref(readCode())

const screen = ref<Screen>('loading')
const voucher = ref<PublicVoucher | null>(null)
const retryAfterSeconds = ref(0)
// Vrai tant que le délai demandé par le serveur n'est pas écoulé : « Réessayer » reste inactif.
const waiting = ref(false)
let waitTimer: ReturnType<typeof setTimeout> | undefined

function stopWaiting() {
  clearTimeout(waitTimer)
  waiting.value = false
}

const code = computed(() => formatVoucherCode(fragment.value) ?? '')
const seconds = computed(() => retryAfterSeconds.value)
const date = computed(() =>
  voucher.value
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
        new Date(voucher.value.expiresAt)
      )
    : ''
)

document.documentElement.lang = locale
document.title = t('pageTitle')

// L'écran d'état remplace le chargement : le focus va sur son titre, ce qui le fait lire par un
// lecteur d'écran.
async function showState(state: Exclude<Screen, 'loading'>) {
  screen.value = state
  await nextTick()
  document.getElementById('state-title')?.focus()
}

async function load() {
  stopWaiting()

  const requested = fragment.value
  const formatted = formatVoucherCode(requested)

  // Un fragment qui ne peut pas être un code de bon ne vaut pas une requête.
  if (!formatted) {
    await showState('notFound')
    return
  }

  screen.value = 'loading'

  const result = await lookupVoucher(formatted)

  // Le fragment a changé pendant la lecture : cette réponse concerne un autre bon.
  if (requested !== fragment.value) return

  if (result.ok) {
    voucher.value = result.data
    await showState(result.data.state)
  } else if (result.reason === 'not_found') {
    await showState('notFound')
  } else if (result.reason === 'too_many_requests') {
    retryAfterSeconds.value = result.retryAfterSeconds
    waiting.value = true
    waitTimer = setTimeout(stopWaiting, result.retryAfterSeconds * 1000)
    await showState('tooMany')
  } else {
    await showState('lookupFailed')
  }
}

// Un autre QR code scanné dans le même onglet ne recharge pas la page : seul le fragment change.
function onHashChange() {
  fragment.value = readCode()
  voucher.value = null
  void load()
}

onMounted(() => {
  window.addEventListener('hashchange', onHashChange)
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange)
  clearTimeout(waitTimer)
})
</script>

<style>
/* La charte du backoffice verrouille le défilement (application plein écran) : une page de
   téléphone doit défiler. */
html,
body,
#app {
  height: auto;
  min-height: 100%;
}

body {
  overflow: auto;
}
</style>

<style scoped>
.voucher {
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  display: grid;
  gap: 24px;
}

.voucher__head {
  display: flex;
  align-items: center;
  gap: 16px;
}

.voucher__logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
}

.voucher__title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.voucher__venue,
.voucher__hint {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--text-2);
}

.voucher__text {
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text-1);
}

.voucher__state {
  display: grid;
  gap: 16px;
}

.voucher__state h2 {
  margin: 0;
  font-size: 20px;
}

/* Le titre reçoit le focus par programme, il n'est pas interactif : pas d'anneau. */
.voucher__state h2:focus {
  outline: none;
}

.voucher__detail {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 16px 0 0;
  border-top: 1px solid var(--border-2);
}

.voucher__detail dt {
  font-size: 18px;
  font-weight: 700;
}

.voucher__detail dd {
  margin: 0;
}

.voucher__code {
  display: grid;
  gap: 4px;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  color: var(--text-0);
}

.voucher__code-label {
  font-size: 14px;
  font-weight: 400;
  letter-spacing: normal;
  color: var(--text-2);
}

.voucher__btn {
  width: 100%;
  min-height: 48px;
  /* Un bouton n'hérite pas de la police de la page : sans cela il sort en police système. */
  font-family: inherit;
  font-size: 16px;
}

.voucher__btn:focus-visible {
  outline: 2px solid var(--accent-pink);
  outline-offset: 2px;
}
</style>
