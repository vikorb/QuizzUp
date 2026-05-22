export type QuestionScope = 'global' | 'company'
export type ThemeMode = 'classic' | 'image' | 'audio' | 'mixed'
export type QuestionMediaType = 'none' | 'image' | 'audio' | 'video'

export interface Theme {
  id: number
  adminId: number
  companyId: number | null
  scope: QuestionScope
  name: string
  mode: ThemeMode
  status: number
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export interface Answer {
  id?: number
  adminId?: number
  questionId?: number
  response: string
  isCorrect: boolean
  status?: number
}

export interface Question {
  id: number
  adminId: number
  companyId: number | null
  themeId: number | null
  themeIds?: number[]
  themes?: Theme[]
  themeName?: string | null
  themeMode?: ThemeMode | null
  themeScope?: QuestionScope | null
  scope: QuestionScope
  question: string
  typeMedia: QuestionMediaType
  mediaUrl: string | null
  status: number
  canEdit: boolean
  answers?: Answer[]
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export interface QuestionFilters {
  search: string
  themeId: string
  status: string
  typeMedia: string
  scope: string
}

export interface QuestionPayload {
  themeIds: number[]
  question: string
  typeMedia: QuestionMediaType
  mediaUrl: string | null
  answers: Answer[]
}

export type UpdateQuestionStatusResult =
  | {
      ok: true
      question: Question
    }
  | {
      ok: false
      error: string
    }
