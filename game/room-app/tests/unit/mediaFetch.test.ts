import { setRoomToken } from '@/utils/auth'
import { fetchRoomMedia, isApiMediaUrl } from '@/utils/mediaFetch'

const API = 'http://localhost:3001'
const DEEZER_URL = 'https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/12.mp3?hdnea=exp=1~hmac=abc'

describe('isApiMediaUrl', () => {
  it('reconnaît un chemin relatif et une URL de l’origine de l’API', () => {
    expect(isApiMediaUrl('/room/questions/3/media', API)).toBe(true)
    expect(isApiMediaUrl(`${API}/room/questions/3/media`, API)).toBe(true)
    expect(isApiMediaUrl('/room/questions/3/media', `${API}/`)).toBe(true)
  })

  it('refuse toute autre origine : domaine tiers, port, schéma, sous-domaine, adresse sans schéma', () => {
    expect(isApiMediaUrl(DEEZER_URL, API)).toBe(false)
    expect(isApiMediaUrl('http://localhost:3002/x', API)).toBe(false)
    expect(isApiMediaUrl('https://localhost:3001/x', API)).toBe(false)
    expect(isApiMediaUrl('http://localhost:3001.evil.test/x', API)).toBe(false)
    expect(isApiMediaUrl('//cdn.dzcdn.net/x.mp3', API)).toBe(false)
    expect(isApiMediaUrl(`${API}@evil.test/x`, API)).toBe(false)
  })

  it('refuse une URL ou une base illisible', () => {
    expect(isApiMediaUrl('http://', API)).toBe(false)
    expect(isApiMediaUrl('/room/questions/3/media', 'pas une url')).toBe(false)
  })
})

function spyFetch() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
}

describe('fetchRoomMedia', () => {
  beforeEach(() => setRoomToken('tok'))

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('envoie le jeton de la salle à l’API (chemin complet ou absolu)', async () => {
    const fetchMock = spyFetch()

    await fetchRoomMedia(`${API}/room/questions/3/media`)
    await fetchRoomMedia(`${API}/room/questions/4/media`)

    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok')
    }
  })

  it('sans jeton, interroge l’API sans en-tête', async () => {
    setRoomToken(null)
    const fetchMock = spyFetch()

    await fetchRoomMedia(`${API}/room/questions/3/media`)

    expect(fetchMock).toHaveBeenCalledWith(`${API}/room/questions/3/media`, {})
  })

  it('n’envoie ni jeton, ni en-tête, ni cookie à un domaine tiers', async () => {
    const fetchMock = spyFetch()

    await fetchRoomMedia(DEEZER_URL)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Aucune clé `headers` : un en-tête hors `Range` ferait échouer le préflight du tiers.
    expect(fetchMock).toHaveBeenCalledWith(DEEZER_URL, { credentials: 'omit' })
  })

  it('traite une URL illisible comme un tiers : jamais de jeton', async () => {
    const fetchMock = spyFetch()

    await fetchRoomMedia('http://').catch(() => undefined)

    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toBeUndefined()
    }
  })
})
