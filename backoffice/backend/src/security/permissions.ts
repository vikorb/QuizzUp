import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN, ADMIN_ROLE_USER } from '@quizzup/shared'

export const API_RESOURCE = {
  COMPANY: 'company',
  COMPANY_ACCOUNT: 'companyAccount',
  THEME: 'theme',
  QUESTION: 'question',
  ANSWER: 'answer',
  ROOM: 'room',
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
  ],

  [ADMIN_ROLE_USER]: [
    'company:read',

    'companyAccount:read',
    'companyAccount:update',

    ...contentReadPermissions,

    ...roomReadPermissions,
  ],
}

export function canRoleAccessApi(role: string, resource: ApiResource, action: ApiAction): boolean {
  const permissionKey = `${resource}:${action}` as PermissionKey
  const permissions = permissionsByRole[role as ApiRole] ?? []

  return permissions.includes(permissionKey)
}
