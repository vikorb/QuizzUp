import { setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import {
  attachQuestionToThemeServiceMock,
  createQuestionMock,
  detachQuestionFromThemeServiceMock,
  mockDetachQuestionFailure,
  mockListQuestionsSuccess,
} from '@frontend-tests/_helpers/questionsServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ThemeDetailQuestionsSection from '@/views/themes/detail/ThemeDetailQuestionsSection.vue'

resetFrontendMocksBeforeEach()

beforeEach(() => {
  mockListQuestionsSuccess([
    createQuestionMock({ id: 101, question: 'Linked one', themeId: 1, themeIds: [1, 2] }),
    createQuestionMock({ id: 102, question: 'Linked two', themeId: 1, themeIds: [1] }),
    createQuestionMock({ id: 200, question: 'Capitale de la France', themeId: 2, themeIds: [2] }),
  ])
})

async function mountSection(canEdit = true) {
  const wrapper = mountWithFrontendMocks(ThemeDetailQuestionsSection, {
    props: { themeId: 1, canEdit },
  })

  await flushPromises()
  await nextTick()

  return wrapper
}

function removeButtons(wrapper: Awaited<ReturnType<typeof mountSection>>) {
  return wrapper.findAll('[aria-label="themes.questions.remove"]')
}

function linkedQuestionLabels(wrapper: Awaited<ReturnType<typeof mountSection>>): string[] {
  return wrapper.findAll('.question-link').map((button) => button.text())
}

describe('views/themes/detail/ThemeDetailQuestionsSection.vue', () => {
  it('lists the linked questions and their count', async () => {
    const wrapper = await mountSection()

    expect(linkedQuestionLabels(wrapper)).toEqual(['Linked one', 'Linked two'])
    expect(wrapper.find('.linked-questions__count').text()).toContain('2')
  })

  it('attaches a searched question and flags questions already linked elsewhere', async () => {
    setConfirmResult(true)

    const wrapper = await mountSection()

    await wrapper.find('input').setValue('capitale')
    await nextTick()

    // La question 200 est liée au thème 2 : badge « déjà liée à un autre thème ».
    const result = wrapper.find('.question-result')
    expect(result.exists()).toBe(true)
    expect(result.text()).toContain('themes.questions.fromAnotherTheme')

    await result.find('[data-test="ui-button"]').trigger('click')
    await flushPromises()
    await nextTick()

    expect(attachQuestionToThemeServiceMock).toHaveBeenCalledWith(200, 1)
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('questionAttached')
  })

  it('detaches a linked question, updates the list and the count, and shows a banner', async () => {
    setConfirmResult(true)

    const wrapper = await mountSection()

    expect(removeButtons(wrapper)).toHaveLength(2)

    // Retirer « Linked one » (id 101) du thème courant.
    await removeButtons(wrapper)[0].trigger('click')
    await flushPromises()
    await nextTick()

    expect(detachQuestionFromThemeServiceMock).toHaveBeenCalledWith(101, 1)
    expect(linkedQuestionLabels(wrapper)).toEqual(['Linked two'])
    expect(wrapper.find('.linked-questions__count').text()).toContain('1')
    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('questionDetached')
  })

  it('surfaces the last-link invariant error and keeps the question linked', async () => {
    setConfirmResult(true)
    mockDetachQuestionFailure('question_theme_last_link')

    const wrapper = await mountSection()

    await removeButtons(wrapper)[1].trigger('click')
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test="base-banner"]').text()).toContain('question_theme_last_link')
    // La question reste liée (aucune suppression locale).
    expect(linkedQuestionLabels(wrapper)).toEqual(['Linked one', 'Linked two'])
  })

  it('skips detaching when the confirmation is dismissed', async () => {
    setConfirmResult(false)

    const wrapper = await mountSection()

    await removeButtons(wrapper)[0].trigger('click')
    await flushPromises()

    expect(detachQuestionFromThemeServiceMock).not.toHaveBeenCalled()
  })

  it('disables the attach and detach controls in read-only mode', async () => {
    const wrapper = await mountSection(false)

    // Le champ de recherche est désactivé.
    expect(wrapper.find('input').attributes('disabled')).toBeDefined()
    // Les boutons « retirer » sont désactivés.
    expect(
      removeButtons(wrapper).every((button) => button.attributes('disabled') !== undefined)
    ).toBe(true)
  })
})
