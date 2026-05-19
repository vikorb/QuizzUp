import { describe, expect, it } from 'vitest'
import { buildApp } from '../../../../backend/src/app'

describe('GET /health', () => {
  it('should return API status', async () => {
    const app = buildApp()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })
})
