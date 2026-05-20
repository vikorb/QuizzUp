import '../_helpers/registerRouteMocks'

import { adminParamsSchema, createCompanySchema, updateAdminSchema, updateCompanySchema } from '@backend/routes/companies/_schemas'
import { describe, expect, it } from 'vitest'

describe('routes/companies/_schemas.ts', () => {
  it('normalizes company creation input', () => {
    const parsed = createCompanySchema.parse({
      name: '  Client Test  ',
      email: '  CLIENT@TEST.FR  ',
    })

    expect(parsed).toEqual({
      name: 'Client Test',
      email: 'client@test.fr',
    })
  })

  it('rejects empty company and account update payloads', () => {
    expect(updateCompanySchema.safeParse({}).success).toBe(false)
    expect(updateAdminSchema.safeParse({}).success).toBe(false)
  })

  it('rejects invalid admin params and roles', () => {
    expect(adminParamsSchema.safeParse({ companyId: '1', adminId: '2' }).success).toBe(true)
    expect(adminParamsSchema.safeParse({ companyId: '0', adminId: '-1' }).success).toBe(false)
    expect(updateAdminSchema.safeParse({ role: 'owner' }).success).toBe(false)
  })
})
