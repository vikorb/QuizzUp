import {
  createEmptyRegistration,
  DISPLAY_NAME_MAX_LENGTH,
  finalizeRegistrations,
  hasErrors,
  isRegistrationFilled,
  setConsent,
  toEngineParticipants,
  validateRegistration,
} from '@/game/registrations'

describe('registrations (lobby, RGPD)', () => {
  it('un pupitre vide n’est pas inscrit', () => {
    expect(isRegistrationFilled(createEmptyRegistration(1))).toBe(false)
    expect(isRegistrationFilled({ ...createEmptyRegistration(1), email: 'a@b.fr' })).toBe(true)
  })

  it('exige un pseudo, de longueur bornée', () => {
    expect(validateRegistration(createEmptyRegistration(1)).displayName).toBe('required')
    expect(
      validateRegistration({
        ...createEmptyRegistration(1),
        displayName: 'x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1),
      }).displayName
    ).toBe('too_long')
    expect(
      hasErrors(validateRegistration({ ...createEmptyRegistration(1), displayName: 'Léa' }))
    ).toBe(false)
  })

  it('email facultatif, mais valide et avec consentement explicite', () => {
    const base = { ...createEmptyRegistration(2), displayName: 'Hugo' }

    expect(validateRegistration({ ...base, email: 'pas-un-email' }).email).toBe('invalid')
    expect(validateRegistration({ ...base, email: 'hugo@exemple.fr' }).email).toBe(
      'consent_required'
    )
    expect(
      validateRegistration(setConsent({ ...base, email: 'hugo@exemple.fr' }, true)).email
    ).toBeUndefined()
  })

  it('horodate le consentement et l’efface au décochage', () => {
    const now = new Date('2026-11-03T21:00:00.000Z')
    const checked = setConsent(createEmptyRegistration(1), true, now)

    expect(checked).toMatchObject({ consent: true, consentAt: '2026-11-03T21:00:00.000Z' })
    expect(setConsent(checked, false)).toMatchObject({ consent: false, consentAt: null })
  })

  it('ne garde jamais un email sans consentement', () => {
    const result = finalizeRegistrations([
      { desk: 1, displayName: ' Léa ', email: 'lea@exemple.fr', consent: false, consentAt: null },
      createEmptyRegistration(2),
      {
        desk: 3,
        displayName: 'Inès',
        email: ' ines@exemple.fr ',
        consent: true,
        consentAt: '2026-11-03T21:00:00.000Z',
      },
    ])

    expect(result).toEqual([
      { desk: 1, displayName: 'Léa', email: '', consent: false, consentAt: null },
      {
        desk: 3,
        displayName: 'Inès',
        email: 'ines@exemple.fr',
        consent: true,
        consentAt: '2026-11-03T21:00:00.000Z',
      },
    ])
  })

  it('convertit en participants du moteur (id = pupitre, sans email)', () => {
    expect(toEngineParticipants([{ ...createEmptyRegistration(3), displayName: 'Inès' }])).toEqual([
      { id: 3, podium: 3, displayName: 'Inès' },
    ])
  })
})
