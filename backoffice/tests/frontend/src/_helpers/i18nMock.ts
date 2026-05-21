import { ref } from 'vue'

const locale = ref('fr')

const messages = {
  fr: {},
  en: {},
}

function t(key: string): string {
  return key
}

export function useI18n() {
  return {
    t,
    locale,
    availableLocales: ['fr', 'en'],
    messages,
  }
}

export function createI18n(options?: unknown) {
  void options

  return {
    global: {
      t,
      locale,
      availableLocales: ['fr', 'en'],
      messages,
    },
    install: () => {},
  }
}
