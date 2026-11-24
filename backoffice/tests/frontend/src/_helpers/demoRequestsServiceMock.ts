import { vi } from 'vitest'

import type { DemoRequest } from '@/types/demoRequest'

export function demoRequestFixture(overrides: Partial<DemoRequest> = {}): DemoRequest {
  return {
    id: 1,
    name: 'Alice Martin',
    centerName: 'Escape Néon',
    email: 'alice@escape-neon.test',
    phone: '+33 6 12 34 56 78',
    roomsCount: 3,
    message: 'Nous voulons voir le moteur de jeu.',
    locale: 'fr',
    consentAt: '2026-11-20T10:00:00.000Z',
    processedAt: null,
    processedBy: null,
    createdAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  }
}

export const pendingDemoRequest = demoRequestFixture()
export const processedDemoRequest = demoRequestFixture({
  id: 2,
  name: 'Bruno Leroy',
  centerName: 'Laser Park',
  email: 'bruno@laser-park.test',
  phone: null,
  message: null,
  processedAt: '2026-11-21T09:00:00.000Z',
  processedBy: 1,
})

export const loadDemoRequestsServiceMock = vi.fn()
export const updateDemoRequestServiceMock = vi.fn()
export const deleteDemoRequestServiceMock = vi.fn()

export const demoRequestsServiceModuleMock = {
  loadDemoRequestsService: loadDemoRequestsServiceMock,
  updateDemoRequestService: updateDemoRequestServiceMock,
  deleteDemoRequestService: deleteDemoRequestServiceMock,
}

export function mockLoadDemoRequests(demoRequests: DemoRequest[]): void {
  loadDemoRequestsServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: { demoRequests, pendingCount: demoRequests.filter((item) => !item.processedAt).length },
  })
}

export function resetDemoRequestsServiceMock(): void {
  loadDemoRequestsServiceMock.mockReset()
  updateDemoRequestServiceMock.mockReset()
  deleteDemoRequestServiceMock.mockReset()
  mockLoadDemoRequests([pendingDemoRequest, processedDemoRequest])
  updateDemoRequestServiceMock.mockImplementation(async (id: number) => ({
    ok: true,
    status: 200,
    data: {
      demoRequest: demoRequestFixture({
        id,
        processedAt: '2026-11-24T08:00:00.000Z',
        processedBy: 1,
      }),
    },
  }))
  deleteDemoRequestServiceMock.mockResolvedValue({ ok: true })
}
