import { ref, watch } from 'vue'
import { createI18n } from 'vue-i18n'

export type LocaleCode = 'fr' | 'en' | (string & {})
export type MessageSchema = { [key: string]: string | MessageSchema }

function loadFr(): MessageSchema {
  const modules = import.meta.glob('/src/locales/fr/**/*.json', { eager: true }) as Record<
    string,
    { default: unknown }
  >

  const bundle: MessageSchema = {}

  for (const mod of Object.values(modules)) {
    const data = (mod?.default ?? {}) as MessageSchema
    Object.assign(bundle, data)
  }

  return bundle
}

function loadEn(): MessageSchema {
  const modules = import.meta.glob('/src/locales/en/**/*.json', { eager: true }) as Record<
    string,
    { default: unknown }
  >

  const bundle: MessageSchema = {}

  for (const mod of Object.values(modules)) {
    const data = (mod?.default ?? {}) as MessageSchema
    Object.assign(bundle, data)
  }

  return bundle
}

const locale = ref<LocaleCode>((localStorage.getItem('locale') as LocaleCode) ?? 'fr')

const i18n = createI18n<{ message: MessageSchema }, string>({
  legacy: false,
  locale: locale.value,
  fallbackLocale: 'fr',
  messages: {
    fr: loadFr(),
    en: loadEn(),
  },
})

watch(locale, (val) => {
  // @ts-ignore - selon la version de vue-i18n, c'est i18n.global.locale.value
  i18n.global.locale.value = val
  localStorage.setItem('locale', val)
})

export function createAppI18n() {
  return i18n
}

export function getCurrentLocale(): LocaleCode {
  return locale.value
}

export function setCurrentLocale(val: LocaleCode) {
  locale.value = val
}

export { i18n }
