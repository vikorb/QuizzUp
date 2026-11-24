import { QUESTION_MEDIA_PROVIDER_DEEZER, type QuestionMediaProvider } from '@quizzup/shared'

/**
 * Crédit d'un extrait fourni par un service tiers, montré à la révélation de la réponse (jamais
 * avant : il donnerait la réponse). Il vient du contenu de la partie ; le moteur ne le connaît pas :
 * la salle le garde ici, par identifiant de question.
 */
export type MediaCredit = {
  provider: QuestionMediaProvider
  title: string
  artist: string
  coverUrl: string | null
  /** Page du morceau : non affichée (l'écran de salle ne quitte pas le jeu). */
  link: string | null
}

const credits = new Map<number, MediaCredit>()

function readCredit(raw: unknown): MediaCredit | null {
  const credit = raw as Partial<MediaCredit> | null | undefined
  if (
    credit?.provider !== QUESTION_MEDIA_PROVIDER_DEEZER ||
    typeof credit.title !== 'string' ||
    typeof credit.artist !== 'string'
  ) {
    return null
  }
  return {
    provider: credit.provider,
    title: credit.title,
    artist: credit.artist,
    // Une pochette n'est chargée qu'en https ; sinon la révélation se passe de pochette.
    coverUrl:
      typeof credit.coverUrl === 'string' && credit.coverUrl.startsWith('https://')
        ? credit.coverUrl
        : null,
    link: typeof credit.link === 'string' ? credit.link : null,
  }
}

/** Remplace la table par celle des thèmes d'une partie (contenu reçu ou sauvegarde reprise). */
export function setMediaCredits(
  themes: { questions: { id: number; mediaCredit?: unknown }[] }[]
): void {
  credits.clear()
  for (const theme of themes) {
    for (const question of theme.questions) {
      const credit = readCredit(question.mediaCredit)
      if (credit) {
        credits.set(question.id, credit)
      }
    }
  }
}

export function getMediaCredit(questionId: number): MediaCredit | null {
  return credits.get(questionId) ?? null
}
