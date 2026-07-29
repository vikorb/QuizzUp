import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  QUESTION_STATUS_DELETED,
  THEME_SCOPE_COMPANY,
} from '@quizzup/shared'

import type { Question } from '@/types/question'

export function canCreateQuestion(role: string | null | undefined): boolean {
  return role === ADMIN_ROLE_SUPERADMIN || role === ADMIN_ROLE_ADMIN || role === ADMIN_ROLE_USER
}

export function canUpdateQuestion(question: Question, role: string | null | undefined): boolean {
  if (question.status === QUESTION_STATUS_DELETED) {
    return false
  }

  // Le backend du module questions renvoie toujours `canEdit`. Le repli sur le rôle
  // ne sert que lorsqu'une question provient d'un autre contexte (ex. le détail d'un
  // thème) où `canEdit` n'est pas calculé : on reste alors permissif (le serveur
  // reste la source de vérité), sauf pour un rôle connu insuffisant.
  if (question.canEdit !== undefined) {
    return question.canEdit
  }

  if (role === ADMIN_ROLE_SUPERADMIN) {
    return true
  }

  if (role === ADMIN_ROLE_ADMIN) {
    return question.scope === THEME_SCOPE_COMPANY
  }

  return role === null || role === undefined
}

export function canDeleteQuestion(question: Question, role: string | null | undefined): boolean {
  return canUpdateQuestion(question, role)
}

export function canUpdateQuestionStatus(
  question: Question,
  role: string | null | undefined
): boolean {
  return canUpdateQuestion(question, role)
}
