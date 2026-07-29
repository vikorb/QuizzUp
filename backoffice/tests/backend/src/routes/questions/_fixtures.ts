import {
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  THEME_MODE_CLASSIC,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
} from '@quizzup/shared'

import { dbState, MOCK_NOW } from '../_helpers/mockDb'

function theme(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    admin_id: 1,
    company_id: null,
    scope: THEME_SCOPE_GLOBAL,
    name: 'Theme',
    mode: THEME_MODE_CLASSIC,
    status: THEME_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: MOCK_NOW,
    deleted_at: null,
    ...overrides,
  }
}

function question(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    admin_id: 1,
    company_id: null,
    scope: THEME_SCOPE_GLOBAL,
    question: 'Question ?',
    type_media: QUESTION_MEDIA_TYPE_NONE,
    media_url: null,
    status: QUESTION_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: MOCK_NOW,
    deleted_at: null,
    ...overrides,
  }
}

function answer(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    admin_id: 1,
    question_id: 1,
    response: 'Answer',
    is_correct: false,
    status: ANSWER_STATUS_ACTIVE,
    created_at: MOCK_NOW,
    updated_at: MOCK_NOW,
    deleted_at: null,
    ...overrides,
  }
}

/**
 * Jeu de données commun aux tests des routes questions.
 *
 * Thèmes : 1 & 2 globaux, 3 & 4 rattachés à la compagnie 1, 5 à la compagnie 2.
 * Questions : 1 globale, 2 compagnie 1, 3 compagnie 2, 4 globale supprimée.
 */
export function seedQuestionsData(): void {
  dbState.themes = [
    theme({ id: 1, name: 'Global A', scope: THEME_SCOPE_GLOBAL, company_id: null }),
    theme({ id: 2, name: 'Global B', scope: THEME_SCOPE_GLOBAL, company_id: null }),
    theme({ id: 3, name: 'Company1 A', scope: THEME_SCOPE_COMPANY, company_id: 1 }),
    theme({ id: 4, name: 'Company1 B', scope: THEME_SCOPE_COMPANY, company_id: 1 }),
    theme({ id: 5, name: 'Company2 A', scope: THEME_SCOPE_COMPANY, company_id: 2 }),
  ]

  dbState.questions = [
    question({
      id: 1,
      scope: THEME_SCOPE_GLOBAL,
      company_id: null,
      admin_id: 1,
      question: 'Global Q',
    }),
    question({
      id: 2,
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      admin_id: 2,
      question: 'Company1 Q',
    }),
    question({
      id: 3,
      scope: THEME_SCOPE_COMPANY,
      company_id: 2,
      admin_id: 3,
      question: 'Company2 Q',
    }),
    question({
      id: 4,
      scope: THEME_SCOPE_GLOBAL,
      company_id: null,
      admin_id: 1,
      question: 'Deleted Q',
      status: QUESTION_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    }),
  ]

  dbState.question_themes = [
    { question_id: 1, theme_id: 1 },
    { question_id: 2, theme_id: 3 },
    { question_id: 3, theme_id: 5 },
    { question_id: 4, theme_id: 1 },
  ]

  dbState.answers = [
    answer({ id: 10, question_id: 2, response: 'A', is_correct: true }),
    answer({ id: 11, question_id: 2, response: 'B', is_correct: false }),
    answer({
      id: 12,
      question_id: 2,
      response: 'Old removed',
      is_correct: false,
      status: ANSWER_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    }),
    answer({ id: 20, question_id: 1, response: 'Yes', is_correct: true }),
    answer({ id: 21, question_id: 1, response: 'No', is_correct: false }),
  ]
}
