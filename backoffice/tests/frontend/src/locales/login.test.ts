import { describe, expect, it } from 'vitest'

import type { MfaFailReason } from '@/types/auth'
import { INVALID_CODE_MESSAGE, mfaFailureMessage } from '@/utils/mfaMessage'

type Messages = { [key: string]: string | Messages }

const modules = import.meta.glob('/frontend/src/locales/**/*.json', { eager: true }) as Record<
  string,
  { default: Messages }
>

// Même assemblage que plugins/i18n.ts : un fichier par langue et par sujet, fusionnés au premier niveau.
function bundle(locale: 'fr' | 'en'): Messages {
  const merged: Messages = {}

  for (const [file, module] of Object.entries(modules)) {
    if (file.includes(`/locales/${locale}/`)) Object.assign(merged, module.default)
  }

  return merged
}

function has(messages: Messages, key: string): boolean {
  let node: string | Messages | undefined = messages

  for (const part of key.split('.')) {
    if (typeof node !== 'object' || !(part in node)) return false
    node = node[part]
  }

  return typeof node === 'string'
}

function leaves(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`)
  )
}

// Les clés écrites en dur dans les trois étapes (l'écran d'identifiant existant a ses propres textes).
const sources = import.meta.glob('/frontend/src/views/login/*Step.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const usedKeys = new Set(
  Object.values(sources).flatMap((source) =>
    [...source.matchAll(/'((?:login|auth|errors)\.[A-Za-z0-9_.]+)'/g)].map((match) => match[1])
  )
)

const REASONS: MfaFailReason[] = [
  'totp_invalid',
  'mfa_challenge_invalid',
  'too_many_attempts',
  'too_many_requests',
  'totp_unavailable',
  'totp_not_enrolled',
  'totp_already_enrolled',
  'totp_enrollment_changed',
  'forbidden',
  'invalid_form',
  'server_error',
  'api_unreachable',
]

const fr = bundle('fr')
const en = bundle('en')

describe('locales — connexion du superadmin en deux temps', () => {
  it('finds the three steps and their keys', () => {
    expect(Object.keys(sources).length).toBe(3)
    expect(usedKeys.size).toBeGreaterThan(15)
  })

  it('has the same keys in fr and en under login.mfa', () => {
    const frKeys = leaves(fr.login as Messages).sort()
    const enKeys = leaves(en.login as Messages).sort()

    expect(frKeys.length).toBeGreaterThan(20)
    expect(enKeys).toEqual(frKeys)
  })

  it.each(['fr', 'en'] as const)('has every key the screens use, in %s', (locale) => {
    const messages = locale === 'fr' ? fr : en
    const missing = [...usedKeys].filter((key) => !has(messages, key))

    expect(missing).toEqual([])
  })

  it.each(REASONS)('has a fr and en text for the failure %s', (reason) => {
    const { key } = mfaFailureMessage({ ok: false, reason })

    expect(has(fr, key)).toBe(true)
    expect(has(en, key)).toBe(true)
  })

  it('has a fr and en text for the delay of a lock-out and for the invalid code', () => {
    const { key } = mfaFailureMessage({
      ok: false,
      reason: 'too_many_attempts',
      retryAfterSeconds: 900,
    })

    for (const messages of [fr, en]) {
      expect(has(messages, key)).toBe(true)
      expect(has(messages, INVALID_CODE_MESSAGE.key)).toBe(true)
    }
  })

  it('writes the lock-out delay and the code length as parameters, not as fixed values', () => {
    for (const messages of [fr, en]) {
      const mfa = (messages.login as { mfa: Messages }).mfa
      expect(mfa.retryIn).toContain('{minutes}')
      expect(mfa.invalidCode).toContain('{length}')
      expect((mfa.totp as Messages).hint).toContain('{length}')
    }
  })
})
