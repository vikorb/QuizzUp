import {
  ANSWER_STATUS_ACTIVE,
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  THEME_MODE_AUDIO,
  THEME_MODE_CLASSIC,
  THEME_MODE_IMAGE,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  THEME_STATUS_INACTIVE,
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
 * Jeu de données commun aux tests des routes thèmes.
 *
 * Thèmes :
 *   1 Global A (global, actif)         – 1 question liée
 *   2 Global B (global, image, actif)  – 0 question
 *   3 Company1 A (compagnie 1, actif)  – 2 questions liées
 *   4 Company1 Draft (compagnie 1, brouillon)
 *   5 Company2 A (compagnie 2, actif)  – 1 question liée
 *   6 Deleted Global (global, supprimé)
 *   7 Company1 Inactive (compagnie 1, inactif)
 *
 * Questions :
 *   1 globale liée au thème 1
 *   2 compagnie 1 liée aux thèmes 3 et 4 (deux liens)
 *   3 compagnie 2 liée au thème 5
 *   4 compagnie 1 liée au seul thème 3 (dernier lien)
 *   5 compagnie 1 sans lien (pour l'attache)
 *   6 compagnie 1 supprimée liée au thème 3
 */
export function seedThemesData(): void {
  dbState.themes = [
    theme({ id: 1, name: 'Global A', scope: THEME_SCOPE_GLOBAL, company_id: null }),
    theme({
      id: 2,
      name: 'Global B',
      scope: THEME_SCOPE_GLOBAL,
      company_id: null,
      mode: THEME_MODE_IMAGE,
    }),
    theme({ id: 3, name: 'Company1 A', scope: THEME_SCOPE_COMPANY, company_id: 1 }),
    theme({
      id: 4,
      name: 'Company1 Draft',
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      status: THEME_STATUS_DRAFT,
      mode: THEME_MODE_AUDIO,
    }),
    theme({ id: 5, name: 'Company2 A', scope: THEME_SCOPE_COMPANY, company_id: 2 }),
    theme({
      id: 6,
      name: 'Deleted Global',
      scope: THEME_SCOPE_GLOBAL,
      company_id: null,
      status: THEME_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    }),
    theme({
      id: 7,
      name: 'Company1 Inactive',
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      status: THEME_STATUS_INACTIVE,
    }),
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
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      admin_id: 2,
      question: 'Single link Q',
    }),
    question({
      id: 5,
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      admin_id: 2,
      question: 'Unlinked Q',
    }),
    question({
      id: 6,
      scope: THEME_SCOPE_COMPANY,
      company_id: 1,
      admin_id: 2,
      question: 'Deleted Q',
      status: QUESTION_STATUS_DELETED,
      deleted_at: MOCK_NOW,
    }),
  ]

  dbState.question_themes = [
    { question_id: 1, theme_id: 1 },
    { question_id: 2, theme_id: 3 },
    { question_id: 2, theme_id: 4 },
    { question_id: 3, theme_id: 5 },
    { question_id: 4, theme_id: 3 },
    { question_id: 6, theme_id: 3 },
  ]

  dbState.answers = [
    answer({ id: 20, question_id: 2, response: 'Yes', is_correct: true }),
    answer({ id: 21, question_id: 2, response: 'No', is_correct: false }),
    answer({ id: 30, question_id: 4, response: 'A', is_correct: true }),
    answer({ id: 31, question_id: 4, response: 'B', is_correct: false }),
  ]
}
