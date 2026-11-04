import { expect, type Page, test } from '@playwright/test'

import { createCapturer } from '../support/captures'
import {
  advance,
  type Button,
  chooserDesk,
  type Desk,
  enterDemo,
  expectScreen,
  freezeClock,
  GAME_STORAGE_KEY,
  pressBuzzer,
  scoreOf,
  startShortGame,
  TICK_MARGIN_MS,
} from '../support/roomApp'

/**
 * Chacun des 10 mini-jeux joué en mode démo sur l'écran de salle : la salle ne tire que
 * ce mini-jeu (réglage `quizzup_room_mini_games`), on joue la première manche (3 questions)
 * au clavier de simulation, Alice répond juste, Bob se trompe (ou répond juste aussi pour
 * le vol de points, qui a besoin d'une cible), et on vérifie le bilan de manche. Une
 * capture d'écran est prise à chaque étape.
 */
const MINI_GAMES = [
  { id: 'flash_blind_test', name: 'Blind test éclair' },
  { id: 'quick_answer', name: 'Rapidité' },
  { id: 'first_buzz', name: 'Premier buzz' },
  { id: 'true_false', name: 'Vrai ou faux éclair' },
  { id: 'double_or_nothing', name: 'Quitte ou double' },
  { id: 'sudden_death', name: 'Mort subite' },
  { id: 'point_steal', name: 'Vol de points' },
  { id: 'streak', name: 'Série' },
  { id: 'estimate', name: 'Estimation' },
  { id: 'progressive_reveal', name: 'Révélation progressive' },
] as const

type MiniGameId = (typeof MINI_GAMES)[number]['id']

const ALICE = { desk: 1 as const, name: 'Alice' }
const BOB = { desk: 2 as const, name: 'Bob' }

/** Écrans d'une question (le premier visible gagne). */
const QUESTION_SCREENS = ['blind', 'buzz', 'bet', 'all', 'steal', 'reveal'] as const
type QuestionScreen = (typeof QUESTION_SCREENS)[number]

/** Pas de temps quand on attend que le moteur passe à l'écran suivant. */
const STEP_MS = 250

async function visibleScreen(page: Page): Promise<QuestionScreen | null> {
  for (const screen of QUESTION_SCREENS) {
    if (await page.locator(`.game__stage > .${screen}`).isVisible()) {
      return screen
    }
  }
  return null
}

/** Fait avancer le temps jusqu'à ce qu'un autre écran que `from` s'affiche. */
async function advanceUntilLeaving(page: Page, from: QuestionScreen, maxMs: number) {
  for (let elapsed = 0; elapsed <= maxMs; elapsed += STEP_MS) {
    const screen = await visibleScreen(page)
    if (screen !== from) {
      return screen
    }
    await advance(page, STEP_MS)
  }
  throw new Error(`Toujours sur l'écran « ${from} » après ${maxMs} ms`)
}

type SavedAnswer = { text: string; isCorrect: boolean }
type SavedQuestion = { text: string; answers: SavedAnswer[] }
type SavedTheme = { name: string; questions: SavedQuestion[] }

/**
 * Bonne et mauvaise réponse de la question affichée, retrouvées dans le contenu de la
 * partie sauvegardé par la salle (énoncé + propositions : le vrai/faux a toujours
 * « Vrai, Faux », les images d'un thème ont toutes le même énoncé).
 */
async function answerButtons(page: Page): Promise<{ correct: Button; wrong: Button }> {
  const stage = page.locator('.game__stage')
  const shown = await stage.locator('.answer__text').allInnerTexts()
  const prompt = stage.locator('.prompt__text')
  const text = (await prompt.count()) > 0 ? (await prompt.innerText()).trim() : null
  const themeName = (await page.locator('.game__theme').innerText()).trim()
  const themes = await page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as { setup: { themes: SavedTheme[] } }).setup.themes : []
  }, GAME_STORAGE_KEY)

  const sorted = JSON.stringify([...shown].sort())
  const question = themes
    .find((theme) => theme.name === themeName)
    ?.questions.find(
      (item) =>
        (text === null || item.text === text) &&
        JSON.stringify(item.answers.map((answer) => answer.text).sort()) === sorted
    )
  if (!question) {
    throw new Error(`Question introuvable (${themeName}) : ${text ?? '?'} / ${shown.join(', ')}`)
  }

  const correctTexts = new Set(
    question.answers.filter((answer) => answer.isCorrect).map((answer) => answer.text)
  )
  const correct = shown.findIndex((item) => correctTexts.has(item))
  const wrong = shown.findIndex((item) => !correctTexts.has(item))
  if (correct < 0 || wrong < 0) {
    throw new Error(`Réponses inattendues : ${shown.join(', ')}`)
  }
  return { correct: correct as Button, wrong: wrong as Button }
}

/** Buzz puis réponse du même pupitre (blind test, premier buzz, révélation). */
async function buzzThenAnswer(page: Page, desk: Desk, answeringClass: string): Promise<void> {
  await pressBuzzer(page, desk, 0)
  await expect(page.locator(answeringClass)).toContainText(`${ALICE.name} répond !`)
  const { correct } = await answerButtons(page)
  await pressBuzzer(page, desk, correct)
}

/** Joue la question affichée jusqu'à sa révélation, en capturant chaque écran. */
async function playQuestion(
  page: Page,
  miniGame: MiniGameId,
  capture: (step: string) => Promise<void>,
  index: number
): Promise<void> {
  const prefix = `q${index}`
  let screen = await visibleScreen(page)

  for (let guard = 0; guard < 6 && screen !== 'reveal'; guard += 1) {
    if (screen === null) {
      await advance(page, STEP_MS)
      screen = await visibleScreen(page)
      continue
    }

    await capture(`${prefix}-${screen}`)

    switch (screen) {
      case 'blind': {
        await buzzThenAnswer(page, ALICE.desk, '.blind__status--answering')
        break
      }
      case 'buzz': {
        await buzzThenAnswer(page, ALICE.desk, '.buzz__status--answering')
        break
      }
      case 'bet': {
        // Alice : mise simple (B) ; Bob passe (A).
        await pressBuzzer(page, ALICE.desk, 1)
        await pressBuzzer(page, BOB.desk, 0)
        // Tout le monde a misé : la question s'affiche aussitôt.
        break
      }
      case 'all': {
        const { correct, wrong } = await answerButtons(page)
        await pressBuzzer(page, ALICE.desk, correct)
        // Le vol de points a besoin d'une cible qui a marqué : Bob trouve aussi, après Alice.
        await advance(page, 200)
        const bobAnswer = miniGame === 'point_steal' ? correct : wrong
        // Mort subite : une fois éliminé, l'appui de Bob est ignoré par le moteur.
        await pressBuzzer(page, BOB.desk, bobAnswer)
        break
      }
      case 'steal': {
        await expect(page.locator('.steal__title')).toHaveText(`${ALICE.name} choisit qui voler`)
        // Lettre du pupitre visé : B = pupitre 2.
        await pressBuzzer(page, ALICE.desk, (BOB.desk - 1) as Button)
        break
      }
    }

    screen = await advanceUntilLeaving(page, screen, 30_000)
  }

  await expectScreen(page, 'reveal')
  await capture(`${prefix}-reveal`)
  if (miniGame === 'flash_blind_test') {
    await expect(page.locator('.reveal__title')).toContainText(`${ALICE.name} trouve au palier 1`)
  } else {
    await expect(
      page.locator('.reveal__result--ok', { hasText: ALICE.name }),
      `${ALICE.name} a la bonne réponse`
    ).toBeVisible()
  }
}

test.describe('Écran de salle — les 10 mini-jeux en mode démo', () => {
  for (const miniGame of MINI_GAMES) {
    test(`${miniGame.name} : une manche jouée au clavier`, async ({ page }, testInfo) => {
      const index = MINI_GAMES.indexOf(miniGame) + 1
      const capture = createCapturer(
        page,
        testInfo,
        `mini-jeux/${String(index).padStart(2, '0')}-${miniGame.id}`
      )

      await freezeClock(page)
      await enterDemo(page, { miniGames: [miniGame.id] })
      await startShortGame(page, [ALICE, BOB])

      await expectScreen(page, 'intro')
      await expect(page.locator('.intro__name')).toHaveText(miniGame.name)
      await capture('intro')
      await advance(page, 4000 + TICK_MARGIN_MS)

      await expectScreen(page, 'choice')
      await capture('choix-du-theme')
      await pressBuzzer(page, await chooserDesk(page), 0)

      // Mort subite : la manche s'arrête dès qu'il ne reste qu'un survivant.
      const expectedQuestions = miniGame.id === 'sudden_death' ? 1 : 3
      for (let question = 1; question <= expectedQuestions; question += 1) {
        await playQuestion(page, miniGame.id, capture, question)
        await expect(page.locator('.topbar')).toContainText(`Question ${question} / 3`)
        await advanceUntilLeaving(page, 'reveal', 10_000)
      }

      await expectScreen(page, 'summary')
      await expect(page.locator('.summary__title')).toHaveText('Fin de la manche 1')
      await capture('bilan-de-manche')

      const alice = Number(await scoreOf(page, ALICE.name).innerText())
      const bob = Number(await scoreOf(page, BOB.name).innerText())
      expect(alice, `${ALICE.name} a marqué`).toBeGreaterThan(0)
      expect(alice, `${ALICE.name} devant ${BOB.name}`).toBeGreaterThan(bob)
    })
  }
})
