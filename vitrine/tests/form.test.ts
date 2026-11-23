import {
  DEMO_REQUEST_CENTER_NAME_MAX,
  DEMO_REQUEST_EMAIL_MAX,
  DEMO_REQUEST_MESSAGE_MAX,
  DEMO_REQUEST_NAME_MAX,
  DEMO_REQUEST_PHONE_MAX,
  DEMO_REQUEST_PHONE_PATTERN,
  DEMO_REQUEST_ROOMS_MAX,
} from '@quizzup/shared'
import { describe, expect, it, vi } from 'vitest'

import {
  DEMO_REQUESTS_PATH,
  type FormValues,
  isSpam,
  LIMITS,
  PHONE,
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
  trap: '',
}

const withValues = (patch: Partial<FormValues>): FormValues => ({ ...valid, ...patch })

describe('LIMITS', () => {
  it('reprend les bornes partagées avec le serveur', () => {
    expect(LIMITS).toEqual({
      name: DEMO_REQUEST_NAME_MAX,
      company: DEMO_REQUEST_CENTER_NAME_MAX,
      email: DEMO_REQUEST_EMAIL_MAX,
      phone: DEMO_REQUEST_PHONE_MAX,
      message: DEMO_REQUEST_MESSAGE_MAX,
      rooms: DEMO_REQUEST_ROOMS_MAX,
    })
  })

  it('reprend le motif du téléphone du serveur', () => {
    expect(PHONE.source).toBe(DEMO_REQUEST_PHONE_PATTERN.source)
    expect(PHONE.flags).toBe(DEMO_REQUEST_PHONE_PATTERN.flags)
  })
})

describe('validate', () => {
  it('accepte une demande complète, téléphone facultatif absent', () => {
    expect(validate(valid)).toEqual({})
  })

  it('accepte un téléphone bien formé', () => {
    expect(validate(withValues({ phone: '+33 6 12 34 56 78' }))).toEqual({})
  })

  it.each(['name', 'company', 'email', 'rooms'] as const)(
    'exige le champ %s, espaces seuls compris',
    (field) => {
      expect(validate(withValues({ [field]: '   ' }))[field]).toBe('required')
    }
  )

  it('accepte un message vide : il est facultatif', () => {
    expect(validate(withValues({ message: '   ' }))).toEqual({})
  })

  it('exige le consentement', () => {
    expect(validate(withValues({ consent: false }))).toEqual({ consent: 'required' })
  })

  it('refuse une adresse e-mail mal formée', () => {
    for (const email of ['camille', 'camille@', 'camille@example', 'a b@example.org']) {
      expect(validate(withValues({ email })).email).toBe('invalid')
    }
  })

  it('refuse un téléphone mal formé', () => {
    for (const phone of ['abc', '12345', '06\t12 34 56', '+33 6 12 34 56 7A']) {
      expect(validate(withValues({ phone })).phone).toBe('invalid')
    }
  })

  it.each(['0', '51', '2,5', '-1', 'deux'])('refuse %s salles', (rooms) => {
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
    expect(validate(withValues({ trap: 'http://spam.example' }))).toEqual({})
  })
})

describe('isSpam', () => {
  it('repère un champ piège rempli', () => {
    expect(isSpam(withValues({ trap: 'http://spam.example' }))).toBe(true)
  })

  it('laisse passer un champ piège vide ou en espaces', () => {
    expect(isSpam(valid)).toBe(false)
    expect(isSpam(withValues({ trap: '  ' }))).toBe(false)
  })
})

describe('sendDemoRequest', () => {
  const respond = (status: number) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }))

  it('poste le JSON attendu vers la route publique, sans identifiants', async () => {
    const fetchFn = respond(201)
    const { result } = await sendDemoRequest(
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
      centerName: 'Escape du Port',
      email: 'camille@example.org',
      phone: '0612345678',
      roomsCount: 3,
      message: 'Nous voulons voir le blind test.',
      consent: true,
      website: '',
    })
  })

  it('omet le téléphone et le message quand ils sont vides', async () => {
    const fetchFn = respond(200)
    await sendDemoRequest('https://api.example.org', withValues({ message: '  ' }), fetchFn)
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('phone')
    expect(body).not.toHaveProperty('message')
  })

  it('ne renvoie jamais le champ piège de la page : `website` part vide', async () => {
    const fetchFn = respond(202)
    await sendDemoRequest('https://api.example.org', withValues({ trap: 'x' }), fetchFn)
    const body = JSON.parse((fetchFn.mock.calls[0]?.[1] as RequestInit).body as string)
    expect(body.website).toBe('')
    expect(body).not.toHaveProperty('trap')
  })

  it.each([
    [200, 'success'],
    [202, 'success'],
    [204, 'success'],
    [400, 'error'],
    [422, 'error'],
    [429, 'rateLimited'],
    [500, 'error'],
    [404, 'error'],
    [413, 'error'],
    [415, 'error'],
  ])('traduit le statut %i en %s', async (status, expected) => {
    const { result } = await sendDemoRequest('https://api.example.org', valid, respond(status))
    expect(result).toBe(expected)
  })

  it('lit les champs refusés d’un 400 invalid_body et les ramène aux champs de la page', async () => {
    const body = {
      error: 'invalid_body',
      details: {
        fieldErrors: { roomsCount: ['Too big'], centerName: ['Too small'], website: ['x'] },
      },
    }
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 400 }))
    expect(await sendDemoRequest('https://api.example.org', valid, fetchFn)).toEqual({
      result: 'invalid',
      fields: ['company', 'rooms'],
    })
  })

  it.each([
    ['un corps illisible', '<html>'],
    ['sans détail', JSON.stringify({ error: 'invalid_body' })],
    [
      'seulement des champs inconnus de la page',
      JSON.stringify({ details: { fieldErrors: { website: ['x'] } } }),
    ],
  ])('un 400 avec %s est une erreur générique, pas un refus de champ', async (_label, body) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 400 }))
    expect(await sendDemoRequest('https://api.example.org', valid, fetchFn)).toEqual({
      result: 'error',
      fields: [],
    })
  })

  it('envoie la langue de la page quand elle est connue, sinon rien', async () => {
    const fetchFn = respond(201)
    await sendDemoRequest('https://api.example.org', valid, fetchFn, 'fr')
    await sendDemoRequest('https://api.example.org', valid, fetchFn)
    const [withLocale, without] = fetchFn.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string)
    )
    expect(withLocale.locale).toBe('fr')
    expect(without).not.toHaveProperty('locale')
  })

  it('traduit une absence de réponse en erreur réseau', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = await sendDemoRequest('https://api.example.org', valid, fetchFn)
    expect(result).toBe('network')
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
      expect((await pending).result).toBe('network')
    } finally {
      vi.useRealTimers()
    }
  })
})
