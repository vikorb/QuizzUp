type ThemeRow = {
  id: number | string
  admin_id: number | string
  company_id: number | string | null
  scope: string
  name: string
  mode: string
  status: number
  created_at: string | Date
  updated_at: string | Date | null
  deleted_at: string | Date | null
}

type AnswerRow = {
  id: number | string
  admin_id: number | string
  question_id: number | string
  response: string
  is_correct: boolean
  status: number
  created_at: string | Date
  updated_at: string | Date | null
  deleted_at: string | Date | null
}

type QuestionRow = {
  id: number | string
  admin_id: number | string
  company_id: number | string | null
  theme_id: number | string
  theme_name?: string | null
  theme_mode?: string | null
  theme_scope?: string | null
  scope: string
  question: string
  type_media: string
  media_url: string | null
  status: number
  can_edit?: boolean
  answers?: AnswerRow[]
  created_at: string | Date
  updated_at: string | Date | null
  deleted_at: string | Date | null
}

function toNullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value)
}

export function toThemeResponse(theme: ThemeRow) {
  return {
    id: Number(theme.id),
    adminId: Number(theme.admin_id),
    companyId: toNullableNumber(theme.company_id),
    scope: theme.scope,
    name: theme.name,
    mode: theme.mode,
    status: theme.status,
    createdAt: theme.created_at,
    updatedAt: theme.updated_at,
    deletedAt: theme.deleted_at,
  }
}

export function toAnswerResponse(answer: AnswerRow) {
  return {
    id: Number(answer.id),
    adminId: Number(answer.admin_id),
    questionId: Number(answer.question_id),
    response: answer.response,
    isCorrect: answer.is_correct,
    status: answer.status,
    createdAt: answer.created_at,
    updatedAt: answer.updated_at,
    deletedAt: answer.deleted_at,
  }
}

export function toQuestionResponse(question: QuestionRow) {
  return {
    id: Number(question.id),
    adminId: Number(question.admin_id),
    companyId: toNullableNumber(question.company_id),
    themeId: Number(question.theme_id),
    themeName: question.theme_name ?? null,
    themeMode: question.theme_mode ?? null,
    themeScope: question.theme_scope ?? null,
    scope: question.scope,
    question: question.question,
    typeMedia: question.type_media,
    mediaUrl: question.media_url,
    status: question.status,
    canEdit: question.can_edit ?? false,
    answers: question.answers?.map(toAnswerResponse),
    createdAt: question.created_at,
    updatedAt: question.updated_at,
    deletedAt: question.deleted_at,
  }
}
