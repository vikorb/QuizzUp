/** Demande de démonstration reçue de la vitrine (`GET /demo-requests`, contrat `DemoRequest`). */
export type DemoRequest = {
  id: number
  name: string
  centerName: string
  email: string
  phone: string | null
  roomsCount: number
  message: string | null
  locale: 'fr' | 'en' | null
  consentAt: string
  processedAt: string | null
  processedBy: number | null
  createdAt: string
}

export type DemoRequestsResponse = {
  demoRequests: DemoRequest[]
  pendingCount: number
}

export type DemoRequestFilter = 'pending' | 'processed' | 'all'

export type DeleteDemoRequestResult = { ok: true } | { ok: false; error: string }
