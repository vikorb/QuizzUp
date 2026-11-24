import {
  GAME_PODIUMS,
  MINI_GAME_DOUBLE_OR_NOTHING,
  MINI_GAME_ESTIMATE,
  MINI_GAME_FIRST_BUZZ,
  MINI_GAME_FLASH_BLIND_TEST,
  MINI_GAME_POINT_STEAL,
  MINI_GAME_PROGRESSIVE_REVEAL,
  MINI_GAME_QUICK_ANSWER,
  MINI_GAME_STREAK,
  MINI_GAME_SUDDEN_DEATH,
  MINI_GAME_TRUE_FALSE,
  MINI_GAMES,
  type MiniGame,
} from '@quizzup/shared'

/**
 * Catalogue des annonces vocales du présentateur : 48 identifiants, chacun avec son texte fr et
 * en. Ce fichier sert aussi de **script d'enregistrement** : un fichier par identifiant et par
 * langue (`/announcer/<lang>/<id>.mp3`), sans changer le code quand la voix est remplacée.
 * Aucune annonce ne cite un prénom : on dit le numéro de pupitre.
 */

export type Announcement = { id: string; fr: string; en: string }

/** Manches annoncées par leur numéro ; au-delà, seule « Dernière manche » est dite (`round.last`). */
export const ANNOUNCED_ROUNDS_MAX = 10
export const ANSWER_CORRECT_VARIANTS = 3
export const ANSWER_WRONG_VARIANTS = 2

// Nombres de 1 à 10, dits pour les manches (jusqu'à 10) et les pupitres (jusqu'à `GAME_PODIUMS`).
const NUMBER_FR = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix']
const NUMBER_EN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** Noms prononcés des mini-jeux : égaux à `game.miniGames.<code>.name` des locales (testé). */
const MINI_GAME_NAMES: Record<MiniGame, { fr: string; en: string }> = {
  [MINI_GAME_FLASH_BLIND_TEST]: { fr: 'Blind test éclair', en: 'Flash blind test' },
  [MINI_GAME_QUICK_ANSWER]: { fr: 'Rapidité', en: 'Quick answer' },
  [MINI_GAME_FIRST_BUZZ]: { fr: 'Premier buzz', en: 'First buzz' },
  [MINI_GAME_TRUE_FALSE]: { fr: 'Vrai ou faux éclair', en: 'Flash true or false' },
  [MINI_GAME_DOUBLE_OR_NOTHING]: { fr: 'Quitte ou double', en: 'Double or nothing' },
  [MINI_GAME_SUDDEN_DEATH]: { fr: 'Mort subite', en: 'Sudden death' },
  [MINI_GAME_POINT_STEAL]: { fr: 'Vol de points', en: 'Point steal' },
  [MINI_GAME_STREAK]: { fr: 'Série', en: 'Streak' },
  [MINI_GAME_ESTIMATE]: { fr: 'Estimation', en: 'Estimate' },
  [MINI_GAME_PROGRESSIVE_REVEAL]: { fr: 'Révélation progressive', en: 'Progressive reveal' },
}

const ANSWER_CORRECT = [
  { fr: 'Bonne réponse.', en: 'Correct.' },
  { fr: 'Exactement.', en: 'Exactly.' },
  { fr: 'Bien vu.', en: 'Well spotted.' },
]

const ANSWER_WRONG = [
  { fr: 'Raté.', en: 'Wrong.' },
  { fr: 'Eh non.', en: 'Not quite.' },
]

function numbered(
  prefix: string,
  count: number,
  text: (fr: string, en: string) => { fr: string; en: string }
): Announcement[] {
  return NUMBER_FR.slice(0, count).map((fr, index) => ({
    id: `${prefix}.${index + 1}`,
    ...text(fr, NUMBER_EN[index] as string),
  }))
}

function variants(prefix: string, texts: { fr: string; en: string }[]): Announcement[] {
  return texts.map((text, index) => ({ id: `${prefix}.${index + 1}`, ...text }))
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'game.start',
    fr: 'C’est parti, la partie commence.',
    en: 'Here we go, the game is starting.',
  },
  ...numbered('round', ANNOUNCED_ROUNDS_MAX, (fr, en) => ({
    fr: `Manche ${fr}.`,
    en: `Round ${en}.`,
  })),
  { id: 'round.last', fr: 'Dernière manche.', en: 'Final round.' },
  ...MINI_GAMES.map((code) => ({ id: `minigame.${code}`, ...MINI_GAME_NAMES[code] })),
  ...numbered('chooser.desk', GAME_PODIUMS, (fr, en) => ({
    fr: `Pupitre ${fr}, à toi de choisir le thème.`,
    en: `Desk ${en}, pick the theme.`,
  })),
  ...variants('answer.correct', ANSWER_CORRECT),
  ...variants('answer.wrong', ANSWER_WRONG),
  { id: 'question.lost', fr: 'Personne n’a trouvé.', en: 'Nobody got it.' },
  {
    id: 'round.end',
    fr: 'Fin de la manche, voyons les scores.',
    en: 'End of the round, let’s see the scores.',
  },
  { id: 'points.stolen', fr: 'Points volés.', en: 'Points stolen.' },
  { id: 'player.eliminated', fr: 'Éliminé.', en: 'Eliminated.' },
  { id: 'bets.closed', fr: 'Les mises sont faites.', en: 'Bets are closed.' },
  {
    id: 'game.paused',
    fr: 'Petite pause, on reprend dans un instant.',
    en: 'Short break, back in a moment.',
  },
  { id: 'game.resumed', fr: 'On reprend.', en: 'And we’re back.' },
  ...numbered('game.winner.desk', GAME_PODIUMS, (fr, en) => ({
    fr: `Victoire du pupitre ${fr}.`,
    en: `Desk ${en} wins.`,
  })),
  {
    id: 'game.tie',
    fr: 'Égalité en tête, bravo à vous.',
    en: 'It’s a tie at the top, well played.',
  },
  {
    id: 'session.exit',
    fr: 'Merci d’avoir joué. La sortie est par ici.',
    en: 'Thanks for playing. The exit is this way.',
  },
]
