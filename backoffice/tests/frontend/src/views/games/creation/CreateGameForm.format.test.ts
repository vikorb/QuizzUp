import {
  createGameServiceMock,
  createScheduledGameFixture,
  mockServiceFailure,
  resetGamesServiceMock,
  roomsFixture,
  updateGameServiceMock,
} from '@frontend-tests/_helpers/gamesServiceMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import {
  GAME_DEFAULT_FORMAT,
  GAME_FORMAT_CUSTOM,
  GAME_FORMAT_SETTINGS,
  GAME_FORMAT_SHORT,
  GAME_FORMAT_STANDARD,
  GAME_FORMATS,
  MINI_GAME_TRUE_FALSE,
  MINI_GAMES,
} from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import enGames from '@/locales/en/games.json'
import frGames from '@/locales/fr/games.json'
import type { Game } from '@/types/game'
import CreateGameForm from '@/views/games/creation/CreateGameForm.vue'

vi.mock('@/services/gamesService', async () => {
  const gamesService = await import('@frontend-tests/_helpers/gamesServiceMock')

  return gamesService.gamesServiceModuleMock
})

// Les nombres du format passent par `t` : on veut les lire dans les textes.
vi.mock('vue-i18n', async () => {
  const i18n = await import('@frontend-tests/_helpers/i18nMock')
  const { tWithParamsMock: t } = await import('@frontend-tests/_helpers/mount')

  return { ...i18n, useI18n: () => ({ ...i18n.useI18n(), t }) }
})

resetFrontendMocksBeforeEach()

beforeEach(() => {
  resetGamesServiceMock()
})

function mountForm(game: Game | null = null): VueWrapper {
  return mountWithFrontendMocks(CreateGameForm, {
    props: { companyId: 1, rooms: roomsFixture, game },
    global: { mocks: { $t: tWithParamsMock } },
  })
}

const formatField = (wrapper: VueWrapper) => wrapper.get('#game-format')
const formatSelect = (wrapper: VueWrapper) => formatField(wrapper).get<HTMLSelectElement>('select')
const roundsInput = (wrapper: VueWrapper) =>
  wrapper.find<HTMLInputElement>('input[name="roundsCount"]')
const estimate = (wrapper: VueWrapper) => wrapper.find('[data-test="game-format-estimate"]')

/** Minutes lues dans « formatEstimate:{"min":…,"max":…} » (le mock de `t` expose les paramètres). */
function estimatedMinutes(wrapper: VueWrapper): { min: number; max: number } {
  return JSON.parse(estimate(wrapper).text().replace('games.form.formatEstimate:', ''))
}

async function fillAndSubmit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-test="select-field"] select').setValue('10')
  await wrapper.get('input[name="participants.0.displayName"]').setValue('Team A')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('views/games/creation/CreateGameForm.vue : format de partie', () => {
  describe('choix du format', () => {
    it('offers every shared format, the default one selected', () => {
      const wrapper = mountForm()
      const values = formatSelect(wrapper)
        .findAll('option')
        .map((option) => option.attributes('value'))

      expect(values).toEqual([...GAME_FORMATS])
      expect(formatSelect(wrapper).element.value).toBe(GAME_DEFAULT_FORMAT)
    })

    it('shows the counts and the duration of each fixed format in its option', () => {
      const wrapper = mountForm()
      const labels = Object.fromEntries(
        formatSelect(wrapper)
          .findAll('option')
          .map((option) => [option.attributes('value'), option.text()])
      )

      expect(labels[GAME_FORMAT_STANDARD]).toBe(
        `games.form.formatOption:${JSON.stringify({
          name: 'games.form.formats.standard',
          rounds: GAME_FORMAT_SETTINGS[GAME_FORMAT_STANDARD].roundsCount,
          questions: GAME_FORMAT_SETTINGS[GAME_FORMAT_STANDARD].questionsPerRound,
          min: 28,
          max: 47,
        })}`
      )
      expect(labels[GAME_FORMAT_SHORT]).toContain('"rounds":6,"questions":7,"min":12,"max":21')
      expect(labels[GAME_FORMAT_CUSTOM]).toBe('games.form.formats.custom')
    })

    it('shortens the durations of the options when mini-games are unticked', async () => {
      const wrapper = mountForm()
      const before = formatSelect(wrapper).findAll('option')[2].text()

      for (const miniGame of MINI_GAMES.filter((code) => code !== MINI_GAME_TRUE_FALSE)) {
        await wrapper.get(`[data-test="game-mini-game-${miniGame}"]`).setValue(false)
      }

      expect(formatSelect(wrapper).findAll('option')[2].text()).not.toBe(before)
      expect(formatSelect(wrapper).findAll('option')[2].text()).toContain('"min":13,"max":19')
    })
  })

  describe('format personnalisé', () => {
    it('hides the counts and the estimate while a fixed format is chosen', () => {
      const wrapper = mountForm()

      expect(roundsInput(wrapper).exists()).toBe(false)
      expect(wrapper.find('input[name="questionsPerRound"]').exists()).toBe(false)
      expect(estimate(wrapper).exists()).toBe(false)
    })

    it('shows the counts and the estimate once Custom is chosen, and hides them again', async () => {
      const wrapper = mountForm()

      await formatSelect(wrapper).setValue(GAME_FORMAT_CUSTOM)

      expect(roundsInput(wrapper).element.value).toBe('10')
      expect(wrapper.find('input[name="questionsPerRound"]').exists()).toBe(true)
      expect(estimatedMinutes(wrapper)).toEqual({ min: 28, max: 47 })

      await formatSelect(wrapper).setValue(GAME_FORMAT_SHORT)

      expect(roundsInput(wrapper).exists()).toBe(false)
      expect(estimate(wrapper).exists()).toBe(false)
    })

    it('recomputes the estimate from the typed counts and the ticked mini-games', async () => {
      const wrapper = mountForm()

      await formatSelect(wrapper).setValue(GAME_FORMAT_CUSTOM)
      await roundsInput(wrapper).setValue('3')
      await wrapper.get('input[name="questionsPerRound"]').setValue('3')

      expect(estimatedMinutes(wrapper)).toEqual({ min: 3, max: 6 })

      await roundsInput(wrapper).setValue('6')
      await wrapper.get('input[name="questionsPerRound"]').setValue('7')

      expect(estimatedMinutes(wrapper)).toEqual({ min: 12, max: 21 })

      for (const miniGame of MINI_GAMES.filter((code) => code !== MINI_GAME_TRUE_FALSE)) {
        await wrapper.get(`[data-test="game-mini-game-${miniGame}"]`).setValue(false)
      }

      expect(estimatedMinutes(wrapper).max).toBeLessThan(21)
    })

    it('shows no estimate while a typed count is invalid, and refuses to send it', async () => {
      const wrapper = mountForm()

      await formatSelect(wrapper).setValue(GAME_FORMAT_CUSTOM)
      await roundsInput(wrapper).setValue('abc')

      expect(estimate(wrapper).exists()).toBe(false)

      await fillAndSubmit(wrapper)

      expect(createGameServiceMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-name="roundsCount"] [data-test="form-field-error"]').text()).toBe(
        'games.form.errors.roundsInvalid:{"max":20}'
      )
    })
  })

  describe('corps envoyé à la création', () => {
    it('sends the default format alone, with no counts', async () => {
      const wrapper = mountForm()

      await fillAndSubmit(wrapper)

      const payload = createGameServiceMock.mock.calls[0][1] as Record<string, unknown>
      expect(payload).toMatchObject({ roomId: 10, format: GAME_DEFAULT_FORMAT })
      expect(payload).not.toHaveProperty('roundsCount')
      expect(payload).not.toHaveProperty('questionsPerRound')
    })

    it('sends the chosen fixed format, even after typing counts in Custom', async () => {
      const wrapper = mountForm()

      await formatSelect(wrapper).setValue(GAME_FORMAT_CUSTOM)
      await roundsInput(wrapper).setValue('5')
      await formatSelect(wrapper).setValue(GAME_FORMAT_SHORT)
      await fillAndSubmit(wrapper)

      const payload = createGameServiceMock.mock.calls[0][1] as Record<string, unknown>
      expect(payload).toMatchObject({ format: GAME_FORMAT_SHORT })
      expect(payload).not.toHaveProperty('roundsCount')
      expect(payload).not.toHaveProperty('questionsPerRound')
    })

    it('sends the custom format with its typed counts', async () => {
      const wrapper = mountForm()

      await formatSelect(wrapper).setValue(GAME_FORMAT_CUSTOM)
      await roundsInput(wrapper).setValue('4')
      await wrapper.get('input[name="questionsPerRound"]').setValue('5')
      await fillAndSubmit(wrapper)

      expect(createGameServiceMock.mock.calls[0][1]).toMatchObject({
        format: GAME_FORMAT_CUSTOM,
        roundsCount: 4,
        questionsPerRound: 5,
      })
    })
  })

  describe('erreurs du serveur', () => {
    it('shows a format that cannot carry counts under the format field', async () => {
      mockServiceFailure(createGameServiceMock, 'format_fixes_counts', 400)
      const wrapper = mountForm()

      await fillAndSubmit(wrapper)

      expect(formatField(wrapper).attributes('error')).toBe('games.errors.formatFixesCounts')
      expect(wrapper.find('[data-test="form-result-error"]').exists()).toBe(false)
      expect(wrapper.emitted('created')).toBeUndefined()
    })

    it('clears the format error on the next attempt', async () => {
      mockServiceFailure(createGameServiceMock, 'format_fixes_counts', 400)
      const wrapper = mountForm()

      await fillAndSubmit(wrapper)
      resetGamesServiceMock()
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(formatField(wrapper).attributes('error')).toBeUndefined()
    })

    it('shows a refused format change as a form error', async () => {
      mockServiceFailure(createGameServiceMock, 'format_not_updatable', 400)
      const wrapper = mountForm()

      await fillAndSubmit(wrapper)

      expect(wrapper.get('[data-test="form-result-error"]').text()).toBe(
        'games.errors.formatNotUpdatable'
      )
    })
  })

  describe('modification d’une session programmée', () => {
    const edited = createScheduledGameFixture('2026-12-05T13:00:00.000Z', {
      id: 5,
      roomId: 10,
      roundsCount: 8,
      questionsPerRound: 6,
      format: GAME_FORMAT_CUSTOM,
    })

    it('offers no format choice, but the counts and their estimate', () => {
      const wrapper = mountForm(edited)

      expect(wrapper.find('#game-format').exists()).toBe(false)
      expect(roundsInput(wrapper).element.value).toBe('8')
      expect(estimate(wrapper).exists()).toBe(true)
    })

    it('never sends a format, whether the counts changed or not', async () => {
      const wrapper = mountForm(edited)

      await roundsInput(wrapper).setValue('9')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      const payload = updateGameServiceMock.mock.calls[0][2] as Record<string, unknown>
      expect(payload.roundsCount).toBe(9)
      expect(payload).not.toHaveProperty('format')
    })
  })

  describe('traductions', () => {
    it.each([
      ['fr', frGames],
      ['en', enGames],
    ])('has a name for every format and the format texts in %s', (_locale, messages) => {
      const { form, errors } = messages.games

      for (const format of GAME_FORMATS) {
        expect(form.formats[format], format).toBeTruthy()
      }

      expect(form.format).toBeTruthy()
      expect(form.formatOption).toContain('{name}')
      expect(form.formatEstimate).toContain('{min}')
      expect(errors.formatFixesCounts).toBeTruthy()
      expect(errors.formatNotUpdatable).toBeTruthy()
    })

    it('uses the same placeholders in both languages', () => {
      expect(enGames.games.form.formatOption.match(/\{\w+\}/g)?.sort()).toEqual(
        frGames.games.form.formatOption.match(/\{\w+\}/g)?.sort()
      )
      expect(enGames.games.form.formatEstimate.match(/\{\w+\}/g)?.sort()).toEqual(
        frGames.games.form.formatEstimate.match(/\{\w+\}/g)?.sort()
      )
    })
  })
})
