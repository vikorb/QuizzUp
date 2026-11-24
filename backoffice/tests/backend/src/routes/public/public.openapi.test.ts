import '../_helpers/registerDbMock'

import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dbState, resetDb } from '../_helpers/mockDb'
import { createPublicApp } from '../_helpers/publicApi'
import { resolveApiDocPath } from '@backend/utils/apiDocPath'

type App = Awaited<ReturnType<typeof createPublicApp>>

const CONTRACT = path.resolve(process.cwd(), 'docs/api/public-v1.yaml')

let app: App

beforeEach(() => {
  resetDb()
})

afterEach(async () => {
  await app?.close()
  vi.unstubAllEnvs()
})

describe('routes/public/openapi — GET /public/v1/openapi.yaml', () => {
  it('serves public-v1.yaml as YAML without any credential, and leaves no call log', async () => {
    app = await createPublicApp()

    const response = await app.inject({ method: 'GET', url: '/public/v1/openapi.yaml' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/yaml; charset=utf-8')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.body).toBe(fs.readFileSync(CONTRACT, 'utf8'))
    expect(dbState.api_request_logs).toHaveLength(0)
  })

  it('does not ask for a key: a wrong Authorization header changes nothing', async () => {
    app = await createPublicApp()

    const response = await app.inject({
      method: 'GET',
      url: '/public/v1/openapi.yaml',
      headers: { authorization: 'Bearer qzk_nope_nope' },
    })

    expect(response.statusCode).toBe(200)
  })
})

describe('utils/apiDocPath — resolveApiDocPath', () => {
  it('finds public-v1.yaml next to openapi.yaml', () => {
    expect(resolveApiDocPath('public-v1.yaml')).toBe(CONTRACT)
  })

  it('looks in the folder of OPENAPI_PATH for the other contracts', () => {
    vi.stubEnv('OPENAPI_PATH', path.resolve(process.cwd(), 'docs/api/openapi.yaml'))

    expect(resolveApiDocPath('public-v1.yaml')).toBe(CONTRACT)
  })

  it('fails with a clear error when the contract is missing', () => {
    vi.stubEnv('OPENAPI_PATH', path.resolve(process.cwd(), 'docs/nope/openapi.yaml'))

    expect(() => resolveApiDocPath('public-v1.yaml')).toThrow(/public-v1\.yaml not found/)
    expect(() => resolveApiDocPath('absent.yaml')).toThrow(/absent\.yaml not found/)
  })
})
