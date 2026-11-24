import { API_ACTION, API_RESOURCE, canRoleAccessApi } from '@backend/security/permissions'
import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_ROOM,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
} from '@quizzup/shared'
import { describe, expect, it } from 'vitest'

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

describe('security/permissions — salles (US-ROOM-01)', () => {
  const roomWriteActions = [
    API_ACTION.CREATE,
    API_ACTION.UPDATE,
    API_ACTION.UPDATE_STATUS,
    API_ACTION.DELETE,
  ]

  it('lets superadmin and admin manage rooms', () => {
    for (const action of [API_ACTION.LIST, API_ACTION.READ, ...roomWriteActions]) {
      expect(canRoleAccessApi(ADMIN_ROLE_SUPERADMIN, API_RESOURCE.ROOM, action)).toBe(true)
      expect(canRoleAccessApi(ADMIN_ROLE_ADMIN, API_RESOURCE.ROOM, action)).toBe(true)
    }
  })

  it('lets the user role read rooms only', () => {
    expect(canRoleAccessApi(ADMIN_ROLE_USER, API_RESOURCE.ROOM, API_ACTION.LIST)).toBe(true)
    expect(canRoleAccessApi(ADMIN_ROLE_USER, API_RESOURCE.ROOM, API_ACTION.READ)).toBe(true)

    for (const action of roomWriteActions) {
      expect(canRoleAccessApi(ADMIN_ROLE_USER, API_RESOURCE.ROOM, action)).toBe(false)
    }
  })
})

describe('security/permissions — joueurs, bons, statistiques, journaux (lots 6 et 7)', () => {
  const { PLAYER, VOUCHER, STATS, ROOM_LOG } = API_RESOURCE
  const can = canRoleAccessApi

  it('lets the whole staff list players and handle vouchers', () => {
    for (const role of [ADMIN_ROLE_SUPERADMIN, ADMIN_ROLE_ADMIN, ADMIN_ROLE_USER]) {
      expect(can(role, PLAYER, API_ACTION.LIST)).toBe(true)

      for (const action of [
        API_ACTION.LIST,
        API_ACTION.READ,
        API_ACTION.CREATE,
        API_ACTION.UPDATE,
      ]) {
        expect(can(role, VOUCHER, action)).toBe(true)
      }
    }
  })

  it('keeps export, unsubscribe and erasure of players to superadmin and admin', () => {
    for (const action of [API_ACTION.READ, API_ACTION.UPDATE, API_ACTION.DELETE]) {
      expect(can(ADMIN_ROLE_SUPERADMIN, PLAYER, action)).toBe(true)
      expect(can(ADMIN_ROLE_ADMIN, PLAYER, action)).toBe(true)
      expect(can(ADMIN_ROLE_USER, PLAYER, action)).toBe(false)
    }
  })

  it('reserves voucher cancellation to superadmin and admin', () => {
    expect(can(ADMIN_ROLE_SUPERADMIN, VOUCHER, API_ACTION.UPDATE_STATUS)).toBe(true)
    expect(can(ADMIN_ROLE_ADMIN, VOUCHER, API_ACTION.UPDATE_STATUS)).toBe(true)
    expect(can(ADMIN_ROLE_USER, VOUCHER, API_ACTION.UPDATE_STATUS)).toBe(false)
  })

  it('hides statistics and room logs from the user role (Q11, Q14)', () => {
    for (const [resource, action] of [
      [STATS, API_ACTION.READ],
      [ROOM_LOG, API_ACTION.LIST],
    ] as const) {
      expect(can(ADMIN_ROLE_SUPERADMIN, resource, action)).toBe(true)
      expect(can(ADMIN_ROLE_ADMIN, resource, action)).toBe(true)
      expect(can(ADMIN_ROLE_USER, resource, action)).toBe(false)
    }
  })

  it('grants nothing on the new resources to the room role or an unknown role', () => {
    for (const resource of [PLAYER, VOUCHER, STATS, ROOM_LOG]) {
      for (const action of Object.values(API_ACTION)) {
        expect(can(ADMIN_ROLE_ROOM, resource, action)).toBe(false)
        expect(can('ghost', resource, action)).toBe(false)
      }
    }
  })

  it('does not hand out actions that no route needs', () => {
    expect(can(ADMIN_ROLE_SUPERADMIN, STATS, API_ACTION.LIST)).toBe(false)
    expect(can(ADMIN_ROLE_SUPERADMIN, ROOM_LOG, API_ACTION.DELETE)).toBe(false)
    expect(can(ADMIN_ROLE_SUPERADMIN, PLAYER, API_ACTION.CREATE)).toBe(false)
  })
})

describe('security/permissions — demandes de démonstration (lot 12c)', () => {
  const { DEMO_REQUEST } = API_RESOURCE
  const actions = [API_ACTION.LIST, API_ACTION.UPDATE, API_ACTION.DELETE]

  it('reserves list, update and delete to the superadmin', () => {
    for (const action of actions) {
      expect(canRoleAccessApi(ADMIN_ROLE_SUPERADMIN, DEMO_REQUEST, action)).toBe(true)
      expect(canRoleAccessApi(ADMIN_ROLE_ADMIN, DEMO_REQUEST, action)).toBe(false)
      expect(canRoleAccessApi(ADMIN_ROLE_USER, DEMO_REQUEST, action)).toBe(false)
      expect(canRoleAccessApi(ADMIN_ROLE_ROOM, DEMO_REQUEST, action)).toBe(false)
      expect(canRoleAccessApi('ghost', DEMO_REQUEST, action)).toBe(false)
    }
  })

  it('does not hand out actions that no route needs', () => {
    for (const action of [
      API_ACTION.READ,
      API_ACTION.CREATE,
      API_ACTION.UPDATE_STATUS,
      API_ACTION.PERMANENT_DELETE,
    ]) {
      expect(canRoleAccessApi(ADMIN_ROLE_SUPERADMIN, DEMO_REQUEST, action)).toBe(false)
    }
  })
})

describe("security/permissions — clés d'API de réservation et journal (lot 14)", () => {
  const { API_KEY, API_LOG } = API_RESOURCE
  const can = canRoleAccessApi

  const granted = [
    [API_KEY, API_ACTION.LIST],
    [API_KEY, API_ACTION.CREATE],
    [API_KEY, API_ACTION.DELETE],
    [API_LOG, API_ACTION.LIST],
  ] as const

  it('lets superadmin and admin list, create and revoke keys and read the call log', () => {
    for (const [resource, action] of granted) {
      expect(can(ADMIN_ROLE_SUPERADMIN, resource, action)).toBe(true)
      expect(can(ADMIN_ROLE_ADMIN, resource, action)).toBe(true)
    }
  })

  it('refuses the user role, the room role and an unknown role', () => {
    for (const [resource, action] of granted) {
      expect(can(ADMIN_ROLE_USER, resource, action)).toBe(false)
      expect(can(ADMIN_ROLE_ROOM, resource, action)).toBe(false)
      expect(can('ghost', resource, action)).toBe(false)
    }
  })

  it('does not hand out actions that no route needs', () => {
    for (const action of [
      API_ACTION.READ,
      API_ACTION.UPDATE,
      API_ACTION.UPDATE_STATUS,
      API_ACTION.PERMANENT_DELETE,
    ]) {
      expect(can(ADMIN_ROLE_SUPERADMIN, API_KEY, action)).toBe(false)
    }

    for (const action of Object.values(API_ACTION).filter((a) => a !== API_ACTION.LIST)) {
      expect(can(ADMIN_ROLE_SUPERADMIN, API_LOG, action)).toBe(false)
    }
  })
})
