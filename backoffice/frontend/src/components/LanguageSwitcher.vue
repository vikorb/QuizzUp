<template>
  <div class="lang-switcher" :class="`lang-switcher--${effectiveVariant}`">
    <span v-if="showLabel" class="lang-label">{{ $t(labelKey) }}</span>

    <LanguageSwitcherDesktop
      v-if="effectiveVariant === 'desktop'"
      :current-locale="currentLocale"
      @set-locale="setLocale"
    />

    <LanguageSwitcherMobile v-else :current-locale="currentLocale" @set-locale="setLocale" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import LanguageSwitcherDesktop from '@/components/languageSwitcher/LanguageSwitcherDesktop.vue'
import LanguageSwitcherMobile from '@/components/languageSwitcher/LanguageSwitcherMobile.vue'
import { getCurrentLocale, type LocaleCode, setCurrentLocale } from '@/plugins/i18n'

const props = withDefaults(
  defineProps<{
    variant?: 'auto' | 'desktop' | 'mobile'
    labelKey?: string
    showLabel?: boolean
    breakpoint?: number
  }>(),
  {
    variant: 'auto',
    labelKey: 'navbar.language',
    showLabel: true,
    breakpoint: 980,
  }
)

const currentLocale = computed(() => getCurrentLocale() as LocaleCode)

function setLocale(next: LocaleCode): void {
  setCurrentLocale(next)
}

const labelKey = computed(() => props.labelKey)
const showLabel = computed(() => props.showLabel)

const isMobile = ref(false)
let mql: MediaQueryList | null = null
let onMqlChange: ((e: MediaQueryListEvent) => void) | null = null

const effectiveVariant = computed<'desktop' | 'mobile'>(() => {
  if (props.variant === 'desktop') return 'desktop'
  if (props.variant === 'mobile') return 'mobile'
  return isMobile.value ? 'mobile' : 'desktop'
})

onMounted(() => {
  if (props.variant !== 'auto') return

  mql = window.matchMedia(`(max-width: ${props.breakpoint}px)`)
  isMobile.value = mql.matches

  onMqlChange = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }

  mql.addEventListener('change', onMqlChange)
})

onBeforeUnmount(() => {
  if (mql && onMqlChange) mql.removeEventListener('change', onMqlChange)
})
</script>

<style scoped>
.lang-switcher {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
}

.lang-label {
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lang-switcher--mobile {
  display: grid;
  gap: 10px;
  align-items: stretch;
}
</style>
