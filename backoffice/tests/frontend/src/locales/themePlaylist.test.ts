import { describe, expect, it } from 'vitest'

type ThemeLocale = { themes: { errors: { apiErrors: Record<string, string> } } }

const modules = import.meta.glob('/frontend/src/locales/*/themes.json', {
  eager: true,
}) as Record<string, { default: ThemeLocale }>

// Codes renvoyés par `POST` / `PATCH /themes` à propos de la playlist : sans texte, l'écran
// afficherait une clé brute.
const CODES = [
  'theme_playlist_ref_invalid',
  'theme_playlist_mode_invalid',
  'theme_playlist_not_found',
  'theme_playlist_too_small',
  'media_provider_unavailable',
]

describe('locales — themes.errors.apiErrors', () => {
  it.each(['fr', 'en'])('has a text for every playlist error code in %s', (locale) => {
    const apiErrors =
      modules[`/frontend/src/locales/${locale}/themes.json`]!.default.themes.errors.apiErrors

    for (const code of CODES) {
      expect(apiErrors[code]?.trim(), `${locale}: ${code}`).toBeTruthy()
    }
  })
})
