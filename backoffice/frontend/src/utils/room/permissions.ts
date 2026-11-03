import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN, ADMIN_ROLE_USER } from '@quizzup/shared'

/** US-ROOM-01 : le staff (user) consulte les salles de sa compagnie. */
export function canShowCompanyRoomsSection(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE_SUPERADMIN || role === ADMIN_ROLE_ADMIN || role === ADMIN_ROLE_USER
}

/** Création, renommage, activation et suppression : superadmin et admin de la compagnie. */
export function canManageCompanyRooms(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE_SUPERADMIN || role === ADMIN_ROLE_ADMIN
}

/** Comme l'API, seules les salles supprimées sont réservées au superadmin. */
export function canSeeDeletedRooms(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE_SUPERADMIN
}
