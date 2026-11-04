import { expect, type Page } from '@playwright/test'

/**
 * Pilotage de l'écran de salle (`game/room-app`) comme en salle : clavier de simulation
 * des buzzers et lecture de l'écran. Seul le choix de la bonne réponse s'appuie sur le
 * contenu de la partie sauvegardé par la salle (`localStorage`), comme le ferait un joueur
 * qui connaît la réponse.
 */
export type Desk = 1 | 2 | 3 | 4
export type Button = 0 | 1 | 2 | 3

/** Clavier de simulation (`KeyboardEvent.code`) : une rangée par pupitre, A-D. */
const SIMULATION_KEYS: Record<Desk, readonly string[]> = {
  1: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
  2: ['KeyQ', 'KeyW', 'KeyE', 'KeyR'],
  3: ['KeyA', 'KeyS', 'KeyD', 'KeyF'],
  4: ['KeyZ', 'KeyX', 'KeyC', 'KeyV'],
}

export const GAME_STORAGE_KEY = 'quizzup_room_game'

/** Appui franc (enfoncé + relâché) sur un bouton de pupitre. */
export async function pressBuzzer(page: Page, desk: Desk, button: Button = 0): Promise<void> {
  const key = SIMULATION_KEYS[desk][button]
  if (!key) {
    throw new Error(`Pas de touche pour le pupitre ${desk}, bouton ${button}`)
  }
  await page.keyboard.press(key)
}

/** Fige l'horloge de la page : le temps de jeu n'avance plus qu'avec `advance`. */
export async function freezeClock(page: Page): Promise<void> {
  const start = new Date('2026-11-04T20:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
}

/**
 * Marge ajoutée quand on veut franchir une échéance du moteur (fin de palier, de fenêtre) :
 * le moteur n'avance qu'au tick de la salle, qui doit tomber après l'échéance.
 */
export const TICK_MARGIN_MS = 100

/** Fait avancer le temps de jeu (ticks, délais, minuteurs). */
export async function advance(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms)
}

/** Réglage de salle (`game/room-app`, `miniGamesSetting.ts`) : mini-jeux tirés au sort. */
export const MINI_GAMES_STORAGE_KEY = 'quizzup_room_mini_games'

/**
 * Entre en mode démo. Par défaut la salle ne tire que le blind test éclair, dont ces
 * scénarios vérifient les règles ; `miniGames: 'all'` garde le tirage de tous les
 * mini-jeux, une liste (`['streak']`) restreint le tirage à ces mini-jeux.
 */
export async function enterDemo(
  page: Page,
  options: { miniGames?: 'blind_test' | 'all' | string[] } = {}
): Promise<void> {
  const setting = options.miniGames ?? 'blind_test'
  if (setting !== 'all') {
    const miniGames = setting === 'blind_test' ? ['flash_blind_test'] : setting
    await page.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value)
      },
      { key: MINI_GAMES_STORAGE_KEY, value: JSON.stringify(miniGames) }
    )
  }
  await page.goto('/login')
  await page.getByRole('button', { name: 'Essayer en mode démo (sans compte)' }).click()
  await expect(page.getByRole('heading', { name: 'Prêt à jouer' })).toBeVisible()
}

export type Player = { desk: Desk; name: string; email?: string }

/** Lance la salle, inscrit les joueurs et démarre une partie courte (3 × 3). */
export async function startShortGame(page: Page, players: Player[]): Promise<void> {
  await page.getByRole('button', { name: 'Lancer la salle' }).click()
  await expect(page.getByText('Inscription des joueurs')).toBeVisible()

  for (const player of players) {
    await page.locator(`input[name="desk-${player.desk}-name"]`).fill(player.name)
    if (player.email) {
      await page.locator(`input[name="desk-${player.desk}-email"]`).fill(player.email)
      await page
        .locator(`.desk--${player.desk}`)
        .getByRole('checkbox', { name: /J’accepte que le centre conserve mon email/ })
        .check()
    }
  }

  await page.getByRole('radio', { name: /Partie courte · 3 manches × 3 questions/ }).check()
  await page.getByRole('button', { name: 'Démarrer la partie' }).click()
  await expect(page).toHaveURL(/\/play$/)
}

export type Screen = 'intro' | 'choice' | 'blind' | 'reveal' | 'summary' | 'finished'

const SCREENS: Screen[] = ['intro', 'choice', 'blind', 'reveal', 'summary', 'finished']

export async function currentScreen(page: Page): Promise<Screen | null> {
  for (const screen of SCREENS) {
    if (await page.locator(`.game__stage > .${screen}`).isVisible()) {
      return screen
    }
  }
  return null
}

export async function expectScreen(page: Page, screen: Screen): Promise<void> {
  await expect(page.locator(`.game__stage > .${screen}`)).toBeVisible()
}

/** Pupitre désigné pour choisir le thème (« Pupitre N : appuie sur A, B, C ou D »). */
export async function chooserDesk(page: Page): Promise<Desk> {
  const hint = await page.locator('.choice__hint').innerText()
  const match = /Pupitre (\d)/.exec(hint)
  if (!match) {
    throw new Error(`Pupitre qui choisit introuvable : ${hint}`)
  }
  return Number(match[1]) as Desk
}

export async function currentStage(page: Page): Promise<number> {
  const label = await page.locator('.blind__stage--current .blind__stage-label').innerText()
  return Number(label.replace(/\D/g, ''))
}

type SavedAnswer = { text: string; isCorrect: boolean }
type SavedTheme = { name: string; questions: { answers: SavedAnswer[] }[] }

/**
 * Boutons de la bonne et d'une mauvaise réponse pour la question affichée : on retrouve,
 * dans le contenu de la partie, la question du thème en cours qui propose ces réponses.
 */
export async function answerButtons(page: Page): Promise<{ correct: Button; wrong: Button[] }> {
  const shown = await page.locator('.blind .answer__text').allInnerTexts()
  const themeName = (await page.locator('.game__theme').innerText()).trim()
  const themes = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { setup: { themes: SavedTheme[] } }).setup.themes : []
  }, GAME_STORAGE_KEY)

  const theme = themes.find((item) => item.name === themeName)
  const question = theme?.questions.find((item) => {
    const texts = item.answers.map((answer) => answer.text).sort()
    return JSON.stringify(texts) === JSON.stringify([...shown].sort())
  })
  if (!question) {
    throw new Error(`Question introuvable pour ${themeName} : ${shown.join(', ')}`)
  }

  const correctTexts = new Set(
    question.answers.filter((answer) => answer.isCorrect).map((answer) => answer.text)
  )
  const buttons = shown.map((text, index) => ({
    index: index as Button,
    ok: correctTexts.has(text),
  }))
  const correct = buttons.find((item) => item.ok)
  if (!correct) {
    throw new Error('Aucune bonne réponse affichée')
  }
  return {
    correct: correct.index,
    wrong: buttons.filter((item) => !item.ok).map((item) => item.index),
  }
}

/** Score affiché sur le tableau des scores pour un joueur. */
export function scoreOf(page: Page, name: string) {
  return page.locator('.scoreboard .score', { hasText: name }).locator('.score__value')
}

export function lockOf(page: Page, name: string) {
  return page.locator('.scoreboard .score', { hasText: name }).locator('.score__locked')
}

/** Choisit le thème A avec le pupitre désigné et renvoie son nom. */
export async function chooseFirstTheme(page: Page): Promise<string> {
  await expectScreen(page, 'choice')
  const desk = await chooserDesk(page)
  const theme = (await page.locator('.choice__theme .choice__name').first().innerText()).trim()
  await pressBuzzer(page, desk, 0)
  await expectScreen(page, 'blind')
  await expect(page.locator('.game__theme')).toHaveText(theme)
  return theme
}
