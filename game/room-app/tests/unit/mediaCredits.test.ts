import { getMediaCredit, setMediaCredits } from '@/game/mediaCredits'

const CREDIT = {
  provider: 'deezer',
  title: 'Titre',
  artist: 'Artiste',
  coverUrl: 'https://cdn-images.dzcdn.net/cover.jpg',
  link: 'https://www.deezer.com/track/1',
}

function themesWith(...questions: { id: number; mediaCredit?: unknown }[]) {
  return [{ questions }]
}

describe('crédits des extraits', () => {
  afterEach(() => setMediaCredits([]))

  it('garde le crédit de chaque question qui en a un', () => {
    setMediaCredits(
      themesWith({ id: 1, mediaCredit: CREDIT }, { id: 2 }, { id: 3, mediaCredit: null })
    )

    expect(getMediaCredit(1)).toEqual(CREDIT)
    expect(getMediaCredit(2)).toBeNull()
    expect(getMediaCredit(3)).toBeNull()
    expect(getMediaCredit(99)).toBeNull()
  })

  it('remplace la table à chaque partie', () => {
    setMediaCredits(themesWith({ id: 1, mediaCredit: CREDIT }))
    setMediaCredits(themesWith({ id: 2, mediaCredit: CREDIT }))

    expect(getMediaCredit(1)).toBeNull()
    expect(getMediaCredit(2)).not.toBeNull()
  })

  it('tolère une pochette absente, et écarte une pochette qui n’est pas en https', () => {
    setMediaCredits(
      themesWith(
        { id: 1, mediaCredit: { ...CREDIT, coverUrl: null } },
        { id: 2, mediaCredit: { ...CREDIT, coverUrl: 'http://cdn.test/c.jpg' } },
        { id: 3, mediaCredit: { ...CREDIT, coverUrl: undefined } }
      )
    )

    expect(getMediaCredit(1)?.coverUrl).toBeNull()
    expect(getMediaCredit(2)?.coverUrl).toBeNull()
    expect(getMediaCredit(3)?.coverUrl).toBeNull()
  })

  it('garde un crédit sans lien : le lien vaut null', () => {
    setMediaCredits(
      themesWith(
        { id: 1, mediaCredit: { ...CREDIT, link: null } },
        { id: 2, mediaCredit: { ...CREDIT, link: undefined } }
      )
    )

    expect(getMediaCredit(1)?.link).toBeNull()
    expect(getMediaCredit(2)?.link).toBeNull()
  })

  it('ignore un crédit mal formé au lieu de casser la partie', () => {
    setMediaCredits(
      themesWith(
        { id: 1, mediaCredit: 'Deezer' },
        { id: 2, mediaCredit: { ...CREDIT, provider: 'autre' } },
        { id: 3, mediaCredit: { ...CREDIT, title: 12 } },
        { id: 4, mediaCredit: { ...CREDIT, artist: undefined } }
      )
    )

    for (const id of [1, 2, 3, 4]) {
      expect(getMediaCredit(id)).toBeNull()
    }
  })
})
