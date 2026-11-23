import { describe, expect, it, vi } from 'vitest'

import {
  DEMO_REQUESTS_PATH,
  type FormValues,
  isSpam,
  LIMITS,
  REQUEST_TIMEOUT_MS,
  sendDemoRequest,
  validate,
} from '../src/form'

const valid: FormValues = {
  name: 'Camille Martin',
  company: 'Escape du Port',
  email: 'camille@example.org',
  phone: '',
  rooms: '3',
  message: 'Nous voulons voir le blind test.',
  consent: true,
  website: '',
}

const withValues = (patch: Partial<FormValues>): FormValues => ({ ...valid, ...patch })

describe('validate', () => {
  it('accepte une demande complète, téléphone facultatif absent', () => {
    expect(validate(valid)).toEqual({})
  })

  it('accepte un téléphone bien formé', () => {
    expect(validate(withValues({ phone: '+33 6 12 34 56 78' }))).toEqual({})
  })

  it.each(['name', 'company', 'message', 'email', 'rooms'] as const)(
    'exige le champ %s, espaces seuls compris',
    (field) => {
      expect(validate(withValues({ [field]: '   ' }))[field]).toBe('required')
    }
  )

  it('exige le consentement', () => {
    expect(validate(withValues({ consent: false }))).toEqual({ consent: 'required' })
  })

  it('refuse une adresse e-mail mal formée', () => {
    for (const email of ['camille', 'camille@', 'camille@example', 'a b@example.org']) {
      expect(validate(withValues({ email })).email).toBe('invalid')
    }
  })

  it('refuse un téléphone mal formé', () => {
    expect(validate(withValues({ phone: 'abc' })).phone).toBe('invalid')
  })

  it.each(['0', '100', '2,5', '-1', 'deux'])('refuse %s salles', (rooms) => {
    expect(validate(withValues({ rooms })).rooms).toBe('invalid')
  })

  it.each([
    ['name', LIMITS.name],
    ['company', LIMITS.company],
    ['message', LIMITS.message],
  ] as const)('refuse un champ %s au-delà de %i caractères', (field, limit) => {
    expect(validate(withValues({ [field]: 'a'.repeat(limit + 1) }))[field]).toBe('tooLong')
    expect(validate(withValues({ [field]: 'a'.repeat(limit) }))[field]).toBeUndefined()
  })

  it('refuse un téléphone trop long', () => {
    expect(validate(withValues({ phone: '1'.repeat(LIMITS.phone + 1) })).phone).toBe('tooLong')
  })

  it('ne tient pas compte du champ piège', () => {
    expect(validate(withValues({ website: 'http://spam.example' }))).toEqual({})
  })
})

describe('isSpam', () => {
  it('repère un champ piège rempli', () => {
    expect(isSpam(withValues({ website: 'http://spam.example' }))).toBe(true)
  })

  it('laisse passer un champ piège vide ou en espaces', () => {
    expect(isSpam(valid)).toBe(false)
    expect(isSpam(withValues({ website: '  ' }))).toBe(false)
  })
})

describe('sendDemoRequest', () => {
  const respond = (status: number) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }))

  it('poste le JSON attendu vers la route publique, sans identifiants', async () => {
    const fetchFn = respond(201)
    const result = await sendDemoRequest(
      'https://api.example.org/',
      withValues({ name: '  Camille  ', phone: ' 0612345678 ' }),
      fetchFn
    )

    expect(result).toBe('success')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.example.org${DEMO_REQUESTS_PATH}`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Camille',
      company: 'Escape du Port',
      email: 'camille@example.org',
      phone: '0612345678',
      rooms: 3,
      message: 'Nous voulons voir le blind test.',
      consent: true,
      website: '',
    })
  })

  it('omet le téléphone quand il est vide', async () => {
    const fetchFn = respond(200)
    await sendDemoRequest('https://api.example.org', valid, fetchFn)
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('phone')
  })

  it.each([
    [200, 'success'],
    [204, 'success'],
    [400, 'invalid'],
    [422, 'invalid'],
    [429, 'rateLimited'],
    [500, 'error'],
    [404, 'error'],
  ])('traduit le statut %i en %s', async (status, expected) => {
    expect(await sendDemoRequest('https://api.example.org', valid, respond(status))).toBe(expected)
  })

  it('traduit une absence de réponse en erreur réseau', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await sendDemoRequest('https://api.example.org', valid, fetchFn)).toBe('network')
  })

  it('abandonne la requête après le délai prévu', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('abort')))
          })
      )
      const pending = sendDemoRequest('https://api.example.org', valid, fetchFn)
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      expect(await pending).toBe('network')
    } finally {
      vi.useRealTimers()
    }
  })
})
