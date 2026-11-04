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
  'colorWheel',
  'shutter',
] as const
export type ChannelRole = (typeof CHANNEL_ROLES)[number]

/** Nombre maximal d'emplacements d'une roue (une valeur DMX par emplacement). */
export const MAX_COLOR_SLOTS = 256

/** Emplacement d'une roue de couleurs : valeur DMX (0-255) et couleur affichée (RVB 0-255). */
export type ColorSlot = { value: number; rgb: [number, number, number] }

export type ChannelSpec = {
  role: ChannelRole
  /**
   * Valeur envoyée pour un canal `fixed` (mode, macro, vitesse pan/tilt, gobo ouvert…) ou au repos
   * pour les autres, ainsi que pour une `colorWheel` sans emplacement ou sur du noir.
   */
  value?: number
  /** `colorWheel` : emplacements de la roue ; la couleur demandée prend le plus proche (RVB). */
  slots?: ColorSlot[]
  /** `shutter` : valeur d'ouverture (défaut 255). */
  open?: number
  /** `shutter` : valeur fermée, envoyée quand l'intensité vaut 0. Absente = toujours ouvert. */
  closed?: number
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
 * Emplacements indicatifs d'une roue de couleurs de lyre générique (blanc 0, rouge 10, vert 20…).
 * À vérifier sur la notice : chaque lyre a ses propres plages. Copie neuve à chaque appel pour que
 * deux profils ne partagent jamais le même tableau.
 */
export const defaultColorWheelSlots = (): ColorSlot[] => [
  { value: 0, rgb: [255, 255, 255] },
  { value: 10, rgb: [255, 0, 0] },
  { value: 20, rgb: [0, 255, 0] },
  { value: 30, rgb: [0, 0, 255] },
  { value: 40, rgb: [255, 255, 0] },
  { value: 50, rgb: [255, 128, 0] },
  { value: 60, rgb: [255, 0, 255] },
  { value: 70, rgb: [0, 255, 255] },
]

/**
 * Lyre spot générique : ordre de canaux courant des lyres chinoises, **à vérifier sur la notice**.
 * Canaux au-delà du 9e (prisme, focus, programmes automatiques, reset…) laissés à 0.
 */
const genericSpot = (channelCount: number): FixtureProfile => ({
  id: `moving-head-spot-${channelCount}`,
  name: `Lyre spot générique à roue de couleurs (${channelCount} canaux, à vérifier)`,
  kind: 'movingHead',
  channels: [
    ch('pan'),
    ch('panFine'),
    ch('tilt'),
    ch('tiltFine'),
    ch('fixed', { value: 0 }), // vitesse pan/tilt : 0 = maximale sur la plupart des modèles
    ch('dimmer'),
    // Fermé quand l'intensité vaut 0. Le strobe n'est pas piloté sur ces profils (shutter ouvert).
    ch('shutter', { open: 255, closed: 0 }),
    ch('colorWheel', { slots: defaultColorWheelSlots() }),
    ch('fixed', { value: 0 }), // gobo : ouvert (pas de gobo)
    ...Array.from({ length: channelCount - 9 }, () => ch('fixed', { value: 0 })),
  ],
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
  genericSpot(9),
  genericSpot(11),
  genericSpot(16),
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
