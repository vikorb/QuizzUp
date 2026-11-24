import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN, ADMIN_ROLE_USER } from '@quizzup/shared'

export const API_RESOURCE = {
  COMPANY: 'company',
  COMPANY_ACCOUNT: 'companyAccount',
  THEME: 'theme',
  QUESTION: 'question',
  ANSWER: 'answer',
  ROOM: 'room',
  ROOM_ACCOUNT: 'roomAccount',
  GAME: 'game',
  PLAYER: 'player',
  VOUCHER: 'voucher',
  STATS: 'stats',
  ROOM_LOG: 'roomLog',
  DEMO_REQUEST: 'demoRequest',
  API_KEY: 'apiKey',
  API_LOG: 'apiLog',
} as const

export const API_ACTION = {
  LIST: 'list',
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  UPDATE_STATUS: 'updateStatus',
  DELETE: 'delete',
  PERMANENT_DELETE: 'permanentDelete',
} as const

export type ApiResource = (typeof API_RESOURCE)[keyof typeof API_RESOURCE]
export type ApiAction = (typeof API_ACTION)[keyof typeof API_ACTION]

export type ApiRole =
  typeof ADMIN_ROLE_SUPERADMIN | typeof ADMIN_ROLE_ADMIN | typeof ADMIN_ROLE_USER

type PermissionKey = `${ApiResource}:${ApiAction}`

const contentReadPermissions: PermissionKey[] = [
  'theme:list',
  'theme:read',

  'question:list',
  'question:read',

  'answer:list',
  'answer:read',
]

// US-PERM-01 : seuls le superadmin et l'admin d'une compagnie créent ou modifient du contenu.
const contentWritePermissions: PermissionKey[] = [
  'theme:create',
  'question:create',
  'answer:create',

  'theme:update',
  'theme:updateStatus',
  'theme:delete',

  'question:update',
  'question:updateStatus',
  'question:delete',

  'answer:update',
  'answer:updateStatus',
  'answer:delete',
]

// US-ROOM-01 : le staff (user) consulte les salles, l'admin les gère.
const roomReadPermissions: PermissionKey[] = ['room:list', 'room:read']

const roomWritePermissions: PermissionKey[] = [
  'room:create',
  'room:update',
  'room:updateStatus',
  'room:delete',

  // US-ROOM-02 : compte de connexion du PC de la salle.
  'roomAccount:read',
  'roomAccount:create',
  'roomAccount:delete',
]

// US-GAME-08 : tout le staff (opérateur compris) lance et suit les parties de sa compagnie.
const gamePermissions: PermissionKey[] = ['game:list', 'game:read', 'game:create', 'game:update']

// Lots 6 et 7 : tout le staff consulte les joueurs (e-mails masqués pour `user`) et manipule les
// bons (émission, recherche, utilisation) ; l'annulation d'un bon est réservée à l'admin (Q9).
const staffPlayerVoucherPermissions: PermissionKey[] = [
  'player:list',

  'voucher:list',
  'voucher:read',
  'voucher:create',
  'voucher:update',
]

// Export, désinscription et effacement RGPD des joueurs, annulation d'un bon, statistiques (Q11 :
// pas pour `user`), journaux des salles et clés d'API (réservés à l'admin) : superadmin et admin
// seulement.
const adminPlayerVoucherPermissions: PermissionKey[] = [
  'player:read',
  'player:update',
  'player:delete',

  'voucher:updateStatus',

  'stats:read',

  'roomLog:list',

  // Lot 14 : clés de l'API de réservation et journal de leurs appels, jamais pour `user`.
  'apiKey:list',
  'apiKey:create',
  'apiKey:delete',

  'apiLog:list',
]

const permissionsByRole: Record<ApiRole, PermissionKey[]> = {
  [ADMIN_ROLE_SUPERADMIN]: [
    'company:list',
    'company:read',
    'company:create',
    'company:update',
    'company:updateStatus',
    'company:delete',
    'company:permanentDelete',

    'companyAccount:list',
    'companyAccount:read',
    'companyAccount:create',
    'companyAccount:update',
    'companyAccount:updateStatus',
    'companyAccount:delete',

    ...contentReadPermissions,
    ...contentWritePermissions,

    ...roomReadPermissions,
    ...roomWritePermissions,

    ...gamePermissions,

    ...staffPlayerVoucherPermissions,
    ...adminPlayerVoucherPermissions,

    // Lot 12c : demandes de démonstration de la vitrine, ressource de l'éditeur.
    'demoRequest:list',
    'demoRequest:update',
    'demoRequest:delete',
  ],

  [ADMIN_ROLE_ADMIN]: [
    'company:read',
    'company:update',

    'companyAccount:list',
    'companyAccount:read',
    'companyAccount:create',
    'companyAccount:update',
    'companyAccount:updateStatus',
    'companyAccount:delete',

    ...contentReadPermissions,
    ...contentWritePermissions,

    ...roomReadPermissions,
    ...roomWritePermissions,

    ...gamePermissions,

    ...staffPlayerVoucherPermissions,
    ...adminPlayerVoucherPermissions,
  ],

  [ADMIN_ROLE_USER]: [
    'company:read',

    'companyAccount:read',
    'companyAccount:update',

    ...contentReadPermissions,

    ...roomReadPermissions,

    ...gamePermissions,

    ...staffPlayerVoucherPermissions,
  ],
}

export function canRoleAccessApi(role: string, resource: ApiResource, action: ApiAction): boolean {
  const permissionKey = `${resource}:${action}` as PermissionKey
  const permissions = permissionsByRole[role as ApiRole] ?? []

  return permissions.includes(permissionKey)
}
