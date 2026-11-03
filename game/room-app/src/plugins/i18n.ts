import { type Ref, ref, watch } from 'vue'
import { createI18n } from 'vue-i18n'

export type LocaleCode = 'fr' | 'en'
export type MessageSchema = { [key: string]: string | MessageSchema }

type LocaleModules = Record<string, { default: unknown }>

function mergeModules(modules: LocaleModules): MessageSchema {
  const bundle: MessageSchema = {}

  for (const mod of Object.values(modules)) {
    Object.assign(bundle, (mod?.default ?? {}) as MessageSchema)
  }

  return bundle
}

const LOCALE_STORAGE_KEY = 'quizzup_room_locale'

function readStoredLocale(): LocaleCode {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'fr'
  } catch {
    // localStorage indisponible (mode privé, iframe sandbox) : on retombe sur 'fr'.
    return 'fr'
  }
}

const locale = ref<LocaleCode>(readStoredLocale())

const i18n = createI18n<{ message: MessageSchema }, string>({
  legacy: false,
  locale: locale.value,
  fallbackLocale: 'fr',
  messages: {
    fr: mergeModules(import.meta.glob('/src/locales/fr/**/*.json', { eager: true })),
    en: mergeModules(import.meta.glob('/src/locales/en/**/*.json', { eager: true })),
  },
})

watch(locale, (val) => {
  // En mode composition (`legacy: false`), `global.locale` est une ref.
  ;(i18n.global.locale as unknown as Ref<string>).value = val
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, val)
  } catch {
    // Préférence non persistée, sans casser l'app.
  }
})

export function createAppI18n() {
  return i18n
}

export function getCurrentLocale(): LocaleCode {
  return locale.value
}

export function setCurrentLocale(val: LocaleCode): void {
  locale.value = val
}

export { i18n }
