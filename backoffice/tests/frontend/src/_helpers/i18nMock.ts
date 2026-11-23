import { ref } from 'vue'

const locale = ref('fr')

const messages = {
  fr: {},
  en: {},
}

function t(key: string): string {
  return key
}

/** Clés que `te` doit déclarer absentes ; un test y ajoute une clé puis la retire. */
export const missingMessageKeys = new Set<string>()

function te(key: string): boolean {
  return !missingMessageKeys.has(key)
}

export function useI18n() {
  return {
    t,
    te,
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
