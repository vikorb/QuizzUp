import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_ROOM,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

import { API_ACTION, API_RESOURCE, canRoleAccessApi } from '@backend/security/permissions'

const CONTENT_RESOURCES = [API_RESOURCE.THEME, API_RESOURCE.QUESTION, API_RESOURCE.ANSWER]
const WRITE_ACTIONS = [
  API_ACTION.CREATE,
  API_ACTION.UPDATE,
  API_ACTION.UPDATE_STATUS,
  API_ACTION.DELETE,
]

describe('security/permissions — contenu (US-PERM-01)', () => {
  it.each(CONTENT_RESOURCES)('lets superadmin and admin write %s', (resource) => {
    for (const action of WRITE_ACTIONS) {
      expect(canRoleAccessApi(ADMIN_ROLE_SUPERADMIN, resource, action)).toBe(true)
      expect(canRoleAccessApi(ADMIN_ROLE_ADMIN, resource, action)).toBe(true)
    }
  })

  it.each(CONTENT_RESOURCES)('keeps the user role read-only on %s', (resource) => {
    expect(canRoleAccessApi(ADMIN_ROLE_USER, resource, API_ACTION.LIST)).toBe(true)
    expect(canRoleAccessApi(ADMIN_ROLE_USER, resource, API_ACTION.READ)).toBe(true)

    for (const action of WRITE_ACTIONS) {
      expect(canRoleAccessApi(ADMIN_ROLE_USER, resource, action)).toBe(false)
    }
  })

  it('grants nothing to the room role or to an unknown role', () => {
    for (const resource of CONTENT_RESOURCES) {
      expect(canRoleAccessApi(ADMIN_ROLE_ROOM, resource, API_ACTION.READ)).toBe(false)
      expect(canRoleAccessApi('ghost', resource, API_ACTION.READ)).toBe(false)
    }
  })
})
