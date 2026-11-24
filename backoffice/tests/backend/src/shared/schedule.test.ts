import {
  type BusyInterval,
  computeRoomSlots,
  GAME_MAX_PLAYERS,
  type RoomSchedule,
  type RoomScheduleDay,
  type RoomScheduleDayKey,
  SESSION_DEFAULT_MINUTES,
  SESSION_HORIZON_DAYS,
  SESSION_MAX_BREAK_MINUTES,
  SESSION_MAX_MINUTES,
  SESSION_MIN_MINUTES,
  SESSION_OPEN_EARLY_MINUTES,
  zonedLocalToUtc,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

const ALL_DAYS: RoomScheduleDayKey[] = ['1', '2', '3', '4', '5', '6', '7']
// Loin avant toutes les dates testées : aucun créneau n'est « passé ».
const LONG_AGO = new Date('2027-01-01T00:00:00.000Z')

/** Salle ouverte les sept jours aux mêmes horaires. */
function makeSchedule(
  day: RoomScheduleDay,
  overrides: Partial<Omit<RoomSchedule, 'days'>> = {}
): RoomSchedule {
  return {
    timezone: 'Europe/Paris',
    slotMinutes: 60,
    breakMinutes: 0,
    bookableDesks: 4,
    publicBooking: true,
    days: Object.fromEntries(ALL_DAYS.map((key) => [key, day])),
    ...overrides,
  }
}

function slots(
  schedule: RoomSchedule,
  date: string,
  extra: { now?: Date; busy?: BusyInterval[] } = {}
) {
  return computeRoomSlots({ schedule, date, now: LONG_AGO, ...extra })
}

describe('@quizzup/shared — constantes de sessions', () => {
  it('fixe les bornes de durée et de réservation du cadrage', () => {
    expect(SESSION_DEFAULT_MINUTES).toBe(60)
    expect(SESSION_MIN_MINUTES).toBe(10)
    expect(SESSION_MAX_MINUTES).toBe(240)
    expect(SESSION_MAX_BREAK_MINUTES).toBe(120)
    expect(SESSION_OPEN_EARLY_MINUTES).toBe(60)
    expect(SESSION_HORIZON_DAYS).toBe(365)
    expect(GAME_MAX_PLAYERS).toBe(12)
  })

  it('calcule des créneaux avec la durée minimale, la durée maximale et la pause maximale', () => {
    const open = { opensAt: '10:00', closesAt: '11:00' }

    expect(
      slots(makeSchedule(open, { slotMinutes: SESSION_MIN_MINUTES }), '2027-06-15')
    ).toHaveLength(6)

    const long = { opensAt: '10:00', closesAt: '20:00' }
    const schedule = makeSchedule(long, {
      slotMinutes: SESSION_MAX_MINUTES,
      breakMinutes: SESSION_MAX_BREAK_MINUTES,
    })

    // 10:00-14:00, pause de 2 h, 16:00-20:00 : le dernier créneau finit pile à la fermeture.
    expect(slots(schedule, '2027-06-15').map((slot) => slot.localTime)).toEqual(['10:00', '16:00'])
  })
})

describe('@quizzup/shared — zonedLocalToUtc', () => {
  it('convertit une heure ordinaire, été comme hiver', () => {
    expect(zonedLocalToUtc('2027-06-15T10:00', 'Europe/Paris')?.toISOString()).toBe(
      '2027-06-15T08:00:00.000Z'
    )
    expect(zonedLocalToUtc('2027-01-15T10:00', 'Europe/Paris')?.toISOString()).toBe(
      '2027-01-15T09:00:00.000Z'
    )
  })

  it('renvoie null pour une heure qui n’existe pas (passage à l’heure d’été)', () => {
    expect(zonedLocalToUtc('2027-03-28T02:30', 'Europe/Paris')).toBeNull()
    expect(zonedLocalToUtc('2027-03-28T02:00', 'Europe/Paris')).toBeNull()
    expect(zonedLocalToUtc('2027-03-28T03:00', 'Europe/Paris')?.toISOString()).toBe(
      '2027-03-28T01:00:00.000Z'
    )
    expect(zonedLocalToUtc('2027-03-28T01:59', 'Europe/Paris')?.toISOString()).toBe(
      '2027-03-28T00:59:00.000Z'
    )
  })

  it('garde le premier passage d’une heure ambiguë (retour à l’heure d’hiver)', () => {
    // 02:30 existe deux fois le 31 octobre 2027 : à 00:30Z (heure d’été) puis à 01:30Z.
    expect(zonedLocalToUtc('2027-10-31T02:30', 'Europe/Paris')?.toISOString()).toBe(
      '2027-10-31T00:30:00.000Z'
    )
    expect(zonedLocalToUtc('2027-10-31T03:00', 'Europe/Paris')?.toISOString()).toBe(
      '2027-10-31T02:00:00.000Z'
    )
  })

  it('garde le premier passage aussi dans un fuseau à +13 h (Pacific/Auckland)', () => {
    // 02:30 existe deux fois le 4 avril 2027 : à +13 h (13:30Z la veille) puis à +12 h (14:30Z).
    expect(zonedLocalToUtc('2027-04-04T02:30', 'Pacific/Auckland')?.toISOString()).toBe(
      '2027-04-03T13:30:00.000Z'
    )
  })

  it('gère un fuseau sans changement d’heure, avec demi-heure de décalage', () => {
    expect(zonedLocalToUtc('2027-03-28T02:30', 'Asia/Kolkata')?.toISOString()).toBe(
      '2027-03-27T21:00:00.000Z'
    )
    expect(zonedLocalToUtc('2027-10-31T02:30', 'UTC')?.toISOString()).toBe(
      '2027-10-31T02:30:00.000Z'
    )
  })

  it('refuse un format, une date ou un fuseau invalides', () => {
    expect(() => zonedLocalToUtc('2027-06-15 10:00', 'Europe/Paris')).toThrow(RangeError)
    expect(() => zonedLocalToUtc('2027-06-15T10:00', 'Mars/Olympus')).toThrow(RangeError)
  })

  it('refuse une date ou une heure impossibles au lieu de les faire déborder', () => {
    expect(() => zonedLocalToUtc('2027-02-30T10:00', 'Europe/Paris')).toThrow(RangeError)
    expect(() => zonedLocalToUtc('2027-06-31T10:00', 'Europe/Paris')).toThrow(RangeError)
    expect(() => zonedLocalToUtc('2027-13-01T10:00', 'Europe/Paris')).toThrow(RangeError)
    expect(() => zonedLocalToUtc('2027-06-15T24:00', 'Europe/Paris')).toThrow(RangeError)
    expect(() => zonedLocalToUtc('2027-06-15T10:99', 'Europe/Paris')).toThrow(RangeError)
    // 2028 est bissextile : le 29 février existe, pas en 2027.
    expect(zonedLocalToUtc('2028-02-29T10:00', 'Europe/Paris')?.toISOString()).toBe(
      '2028-02-29T09:00:00.000Z'
    )
    expect(() => zonedLocalToUtc('2027-02-29T10:00', 'Europe/Paris')).toThrow(RangeError)
  })
})

describe('@quizzup/shared — computeRoomSlots', () => {
  it('construit les créneaux d’un jour ordinaire avec pause, en UTC et en heure locale', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '14:00' }, { breakMinutes: 30 })

    expect(slots(schedule, '2027-06-15')).toEqual([
      {
        startsAt: '2027-06-15T08:00:00.000Z',
        endsAt: '2027-06-15T09:00:00.000Z',
        localTime: '10:00',
      },
      {
        startsAt: '2027-06-15T09:30:00.000Z',
        endsAt: '2027-06-15T10:30:00.000Z',
        localTime: '11:30',
      },
      {
        startsAt: '2027-06-15T11:00:00.000Z',
        endsAt: '2027-06-15T12:00:00.000Z',
        localTime: '13:00',
      },
    ])
  })

  it('enchaîne les créneaux bout à bout avec une pause de 0', () => {
    const result = slots(makeSchedule({ opensAt: '10:00', closesAt: '13:00' }), '2027-06-15')

    expect(result.map((slot) => slot.localTime)).toEqual(['10:00', '11:00', '12:00'])
    expect(result[0].endsAt).toBe(result[1].startsAt)
    expect(result[1].endsAt).toBe(result[2].startsAt)
  })

  it('ne garde pas un dernier créneau qui dépasse la fermeture', () => {
    // 90 min : 10:00-11:30, 11:30-13:00, puis 13:00-14:30 dépasse 14:00.
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '14:00' }, { slotMinutes: 90 })

    expect(slots(schedule, '2027-06-15').map((slot) => slot.localTime)).toEqual(['10:00', '11:30'])
  })

  it('renvoie une liste vide un jour fermé, selon le jour du calendrier de la date', () => {
    const schedule: RoomSchedule = {
      ...makeSchedule({ opensAt: '10:00', closesAt: '12:00' }),
      days: { '1': { opensAt: '10:00', closesAt: '12:00' } },
    }

    // 14 juin 2027 : lundi (jour ISO 1) ; 15 juin : mardi, fermé ; 20 juin : dimanche (jour 7).
    expect(slots(schedule, '2027-06-14')).toHaveLength(2)
    expect(slots(schedule, '2027-06-15')).toEqual([])
    expect(slots(schedule, '2027-06-20')).toEqual([])
  })

  it('commence à firstSessionAt quand il est fourni', () => {
    const schedule = makeSchedule({ opensAt: '10:00', firstSessionAt: '10:30', closesAt: '12:30' })

    expect(slots(schedule, '2027-06-15').map((slot) => slot.localTime)).toEqual(['10:30', '11:30'])
  })

  it('franchit minuit : le créneau après minuit appartient au jour d’ouverture', () => {
    const schedule = makeSchedule({ opensAt: '20:00', closesAt: '01:00' })
    const result = slots(schedule, '2027-06-15')

    expect(result.map((slot) => slot.localTime)).toEqual([
      '20:00',
      '21:00',
      '22:00',
      '23:00',
      '00:00',
    ])
    // Dernier créneau : 00:00 le 16 juin à Paris (CEST), soit le 15 à 22:00Z.
    expect(result[4].startsAt).toBe('2027-06-15T22:00:00.000Z')
    expect(result[4].endsAt).toBe('2027-06-15T23:00:00.000Z')
  })

  it('franchit minuit avec une pause et un dernier créneau qui ne tient pas avant la fermeture', () => {
    // Ferme à 01:00 : 23:00-00:30 tient, 00:30-02:00 non.
    const schedule = makeSchedule({ opensAt: '20:00', closesAt: '01:00' }, { slotMinutes: 90 })

    expect(slots(schedule, '2027-06-15').map((slot) => slot.localTime)).toEqual([
      '20:00',
      '21:30',
      '23:00',
    ])
  })

  it('place firstSessionAt après minuit quand il précède l’ouverture', () => {
    const schedule = makeSchedule({ opensAt: '22:00', firstSessionAt: '01:00', closesAt: '04:00' })
    const result = slots(schedule, '2027-06-15')

    expect(result.map((slot) => slot.localTime)).toEqual(['01:00', '02:00', '03:00'])
    // 01:00 le lendemain (16 juin) à Paris : 23:00Z le 15.
    expect(result[0].startsAt).toBe('2027-06-15T23:00:00.000Z')
  })

  it('Europe/Paris, 28 mars 2027 : les créneaux de l’heure qui saute disparaissent', () => {
    const schedule = makeSchedule({ opensAt: '01:00', closesAt: '04:00' }, { slotMinutes: 30 })
    const result = slots(schedule, '2027-03-28')

    expect(result.map((slot) => slot.localTime)).toEqual(['01:00', '01:30', '03:00', '03:30'])
    expect(result.map((slot) => slot.startsAt)).toEqual([
      '2027-03-28T00:00:00.000Z',
      '2027-03-28T00:30:00.000Z',
      '2027-03-28T01:00:00.000Z',
      '2027-03-28T01:30:00.000Z',
    ])
    // Il n'y a pas de 02:30 local ce jour-là.
    expect(result.some((slot) => slot.localTime === '02:30')).toBe(false)
  })

  it('Europe/Paris, nuit du 27 au 28 mars 2027 : un créneau qui enjambe le saut ne chevauche pas le suivant', () => {
    // 120 min d'horloge locale : 01:00 locale = 00:00Z-02:00Z, 03:00 locale = 01:00Z, donc le
    // créneau de 03:00 commencerait avant la fin réelle de celui de 01:00. Il est écarté.
    const schedule = makeSchedule(
      { opensAt: '23:00', closesAt: '05:00' },
      { slotMinutes: 120, breakMinutes: 0 }
    )
    const result = slots(schedule, '2027-03-27')

    expect(result.map((slot) => [slot.localTime, slot.startsAt, slot.endsAt])).toEqual([
      ['23:00', '2027-03-27T22:00:00.000Z', '2027-03-28T00:00:00.000Z'],
      ['01:00', '2027-03-28T00:00:00.000Z', '2027-03-28T02:00:00.000Z'],
    ])

    for (let index = 1; index < result.length; index += 1) {
      expect(Date.parse(result[index].startsAt)).toBeGreaterThanOrEqual(
        Date.parse(result[index - 1].endsAt)
      )
    }
  })

  it('Europe/Paris, 28 mars 2027 : aucun créneau ne finit après l’instant de fermeture', () => {
    // Fermeture 03:00 locale = 01:00Z. Le créneau de 01:00 (00:00Z) durerait jusqu'à 02:00Z, soit
    // 04:00 locale : après la fermeture, donc refusé. Pas de créneau du tout.
    const schedule = makeSchedule(
      { opensAt: '01:00', closesAt: '03:00' },
      { slotMinutes: 120, breakMinutes: 0 }
    )

    expect(slots(schedule, '2027-03-28')).toEqual([])

    // Même fermeture, créneaux d'une heure : 01:00-02:00 locale (00:00Z-01:00Z) tient pile.
    expect(
      slots(makeSchedule({ opensAt: '01:00', closesAt: '03:00' }), '2027-03-28').map(
        (slot) => slot.endsAt
      )
    ).toEqual(['2027-03-28T01:00:00.000Z'])
  })

  it('Europe/Paris, 28 mars 2027 : la grille ne dépend pas de l’heure à laquelle on la calcule', () => {
    const schedule = makeSchedule(
      { opensAt: '23:00', closesAt: '05:00' },
      { slotMinutes: 120, breakMinutes: 0 }
    )
    // Le créneau de 23:00 est passé : celui de 03:00 locale (01:00Z) ne doit pas réapparaître.
    const result = slots(schedule, '2027-03-27', { now: new Date('2027-03-27T22:00:00.000Z') })

    expect(result.map((slot) => slot.localTime)).toEqual(['01:00'])
  })

  it('Europe/Paris, 31 octobre 2027 : pas de chevauchement, un trou d’une heure', () => {
    const schedule = makeSchedule({ opensAt: '01:00', closesAt: '05:00' })
    const result = slots(schedule, '2027-10-31')

    expect(result.map((slot) => slot.startsAt)).toEqual([
      '2027-10-30T23:00:00.000Z',
      '2027-10-31T00:00:00.000Z', // 02:00 (heure d'été), premier passage
      '2027-10-31T02:00:00.000Z', // 03:00 (heure d'hiver)
      '2027-10-31T03:00:00.000Z',
    ])

    for (let index = 1; index < result.length; index += 1) {
      expect(Date.parse(result[index].startsAt)).toBeGreaterThanOrEqual(
        Date.parse(result[index - 1].endsAt)
      )
    }

    // Le trou : le créneau de 02:00 finit à 01:00Z, le suivant commence à 02:00Z.
    expect(result[1].endsAt).toBe('2027-10-31T01:00:00.000Z')
    expect(result[2].startsAt).toBe('2027-10-31T02:00:00.000Z')
  })

  it('America/New_York, 14 mars 2027 : saute l’heure inexistante', () => {
    const schedule = makeSchedule(
      { opensAt: '01:00', closesAt: '04:00' },
      { timezone: 'America/New_York' }
    )
    const result = slots(schedule, '2027-03-14')

    expect(result.map((slot) => [slot.localTime, slot.startsAt])).toEqual([
      ['01:00', '2027-03-14T06:00:00.000Z'],
      ['03:00', '2027-03-14T07:00:00.000Z'],
    ])
  })

  it('fuseau sans changement d’heure : même décalage toute l’année', () => {
    const schedule = makeSchedule(
      { opensAt: '10:00', closesAt: '11:00' },
      { timezone: 'Asia/Kolkata' }
    )

    expect(slots(schedule, '2027-03-28')[0].startsAt).toBe('2027-03-28T04:30:00.000Z')
    expect(slots(schedule, '2027-10-31')[0].startsAt).toBe('2027-10-31T04:30:00.000Z')
  })

  it('l’heure s’affiche dans le fuseau de la salle, pas dans celui de la machine', () => {
    const open = { opensAt: '10:00', closesAt: '11:00' }
    const paris = slots(makeSchedule(open), '2027-06-15')[0]
    const tokyo = slots(makeSchedule(open, { timezone: 'Asia/Tokyo' }), '2027-06-15')[0]

    expect(paris.localTime).toBe('10:00')
    expect(tokyo.localTime).toBe('10:00')
    expect(Date.parse(paris.startsAt) - Date.parse(tokyo.startsAt)).toBe(7 * 3_600_000)
  })

  it('écarte les créneaux déjà passés, début ≤ maintenant compris', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '13:00' })
    const taken = (now: string) =>
      slots(schedule, '2027-06-15', { now: new Date(now) }).map((slot) => slot.localTime)

    expect(taken('2027-06-15T07:59:59.999Z')).toEqual(['10:00', '11:00', '12:00'])
    // 08:00Z = 10:00 locale : le créneau qui commence à l'instant même n'est plus réservable.
    expect(taken('2027-06-15T08:00:00.000Z')).toEqual(['11:00', '12:00'])
    expect(taken('2027-06-15T11:00:00.000Z')).toEqual([])
  })

  it('écarte les créneaux au-delà de l’horizon, borne incluse', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '11:00' })
    // Le créneau du 14 juin 2028 à 10:00 locale (08:00Z) tombe pile à maintenant + 365 jours.
    const limit = Date.parse('2028-06-14T08:00:00.000Z')
    const now = (offsetMs: number) => new Date(limit - SESSION_HORIZON_DAYS * 86_400_000 + offsetMs)

    expect(slots(schedule, '2028-06-14', { now: now(0) })).toHaveLength(1)
    expect(slots(schedule, '2028-06-14', { now: now(1) })).toHaveLength(1)
    expect(slots(schedule, '2028-06-14', { now: now(-1) })).toHaveLength(0)
  })

  it('écarte un créneau qui chevauche une session déjà prise, bords exacts acceptés', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '14:00' })
    const busy = (startsAt: string, endsAt: string) =>
      slots(schedule, '2027-06-15', { busy: [{ startsAt, endsAt }] }).map((slot) => slot.localTime)

    // Session prise 09:30Z-10:30Z (11:30-12:30 locale) : coupe les créneaux 11:00 et 12:00.
    expect(busy('2027-06-15T09:30:00.000Z', '2027-06-15T10:30:00.000Z')).toEqual(['10:00', '13:00'])
    // Bout à bout : une session 09:00Z-10:00Z (11:00-12:00 locale) ne bloque que 11:00.
    expect(busy('2027-06-15T09:00:00.000Z', '2027-06-15T10:00:00.000Z')).toEqual([
      '10:00',
      '12:00',
      '13:00',
    ])
  })

  it('accepte les sessions occupées sous forme de Date comme de chaîne ISO', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '12:00' })
    const busy = [
      {
        startsAt: new Date('2027-06-15T08:00:00.000Z'),
        endsAt: new Date('2027-06-15T09:00:00.000Z'),
      },
    ]

    expect(
      computeRoomSlots({ schedule, date: '2027-06-15', now: LONG_AGO, busy }).map(
        (slot) => slot.localTime
      )
    ).toEqual(['11:00'])
  })

  it('sans sessions occupées, la grille reste complète (validation d’une réservation)', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '12:00' })

    expect(slots(schedule, '2027-06-15')).toHaveLength(2)
  })

  it('refuse des entrées invalides au lieu de boucler', () => {
    const schedule = makeSchedule({ opensAt: '10:00', closesAt: '12:00' })

    expect(() => slots({ ...schedule, slotMinutes: 0 }, '2027-06-15')).toThrow(RangeError)
    expect(() => slots({ ...schedule, breakMinutes: -1 }, '2027-06-15')).toThrow(RangeError)
    expect(() => slots(schedule, '15/06/2027')).toThrow(RangeError)
    // Jour qui n'existe pas : pas de report sur le 2 mars.
    expect(() => slots(schedule, '2027-02-30')).toThrow(RangeError)
    expect(() => slots(schedule, '2027-13-01')).toThrow(RangeError)
    expect(() =>
      slots(makeSchedule({ opensAt: '10:00', closesAt: '24:00' }), '2027-06-15')
    ).toThrow(RangeError)
    expect(() =>
      slots(makeSchedule({ opensAt: '10:99', closesAt: '12:00' }), '2027-06-15')
    ).toThrow(RangeError)
    expect(() =>
      slots(makeSchedule({ opensAt: '25:00', closesAt: '12:00' }), '2027-06-15')
    ).toThrow(RangeError)
  })
})
