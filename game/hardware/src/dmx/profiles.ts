/** Rôle d'un canal DMX dans un appareil. */
export const CHANNEL_ROLES = [
  'dimmer',
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'uv',
  'strobe',
  'pan',
  'panFine',
  'tilt',
  'tiltFine',
  'smoke',
  'fixed',
] as const
export type ChannelRole = (typeof CHANNEL_ROLES)[number]

export type ChannelSpec = {
  role: ChannelRole
  /** Valeur envoyée pour un canal `fixed` (mode, macro…) ou au repos pour les autres. */
  value?: number
  /** Fumée par relais : le canal passe à 255 dès que la fumée est active, quel que soit le niveau. */
  binary?: boolean
}

export const FIXTURE_KINDS = ['par', 'movingHead', 'dimmer', 'strobe', 'smoke'] as const
export type FixtureKind = (typeof FIXTURE_KINDS)[number]

/** Profil d'appareil : liste ordonnée des canaux à partir de l'adresse de départ. */
export type FixtureProfile = {
  id: string
  name: string
  kind: FixtureKind
  channels: ChannelSpec[]
}

const ch = (role: ChannelRole, extra: Omit<ChannelSpec, 'role'> = {}): ChannelSpec => ({
  role,
  ...extra,
})

/**
 * Bibliothèque de profils génériques couvrant le matériel courant. Chaque centre a son propre
 * matériel : un profil sur mesure (`customProfiles` de la config) couvre les cas restants.
 */
export const GENERIC_PROFILES: readonly FixtureProfile[] = [
  {
    id: 'par-rgb',
    name: 'PAR LED RGB (3 canaux)',
    kind: 'par',
    channels: [ch('red'), ch('green'), ch('blue')],
  },
  {
    id: 'par-rgbw',
    name: 'PAR LED RGBW (4 canaux)',
    kind: 'par',
    channels: [ch('red'), ch('green'), ch('blue'), ch('white')],
  },
  {
    id: 'par-drgb',
    name: 'PAR LED gradateur + RGB (4 canaux)',
    kind: 'par',
    channels: [ch('dimmer'), ch('red'), ch('green'), ch('blue')],
  },
  {
    id: 'par-drgbws',
    name: 'PAR LED gradateur + RGBW + strobe (6 canaux)',
    kind: 'par',
    channels: [ch('dimmer'), ch('red'), ch('green'), ch('blue'), ch('white'), ch('strobe')],
  },
  {
    id: 'dimmer',
    name: 'Gradateur simple (1 canal)',
    kind: 'dimmer',
    channels: [ch('dimmer')],
  },
  {
    id: 'strobe',
    name: 'Stroboscope (gradateur + vitesse)',
    kind: 'strobe',
    channels: [ch('dimmer'), ch('strobe')],
  },
  {
    id: 'moving-head-8',
    name: 'Lyre / projecteur motorisé (8 canaux)',
    kind: 'movingHead',
    channels: [
      ch('pan'),
      ch('panFine'),
      ch('tilt'),
      ch('tiltFine'),
      ch('dimmer'),
      ch('red'),
      ch('green'),
      ch('blue'),
    ],
  },
  {
    id: 'smoke-dmx',
    name: 'Machine à fumée DMX (1 canal)',
    kind: 'smoke',
    channels: [ch('smoke')],
  },
  {
    id: 'smoke-relay',
    name: 'Machine à fumée sur relais DMX (tout ou rien)',
    kind: 'smoke',
    channels: [ch('smoke', { binary: true })],
  },
]

export function findProfile(
  profileId: string,
  customProfiles: readonly FixtureProfile[] = []
): FixtureProfile | null {
  return (
    customProfiles.find((profile) => profile.id === profileId) ??
    GENERIC_PROFILES.find((profile) => profile.id === profileId) ??
    null
  )
}

export function hasRole(profile: FixtureProfile, role: ChannelRole): boolean {
  return profile.channels.some((channel) => channel.role === role)
}
