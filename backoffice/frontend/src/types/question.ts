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

/** Fichier audio uploadé (US-MEDIA-01) : l'URL est relative à l'API et protégée. */
export interface QuestionMediaFile {
  url: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  originalName: string | null
  uploadedAt: string | null
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
  mediaStartMs?: number
  mediaFile?: QuestionMediaFile | null
  status: number
  canEdit?: boolean
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
  status?: number
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

/** État du champ audio du formulaire question, envoyé à l'API après l'enregistrement. */
export interface QuestionAudioState {
  file: File | null
  durationMs: number | null
  /** Durée du fichier choisi en cours de lecture par le navigateur. */
  measuring: boolean
  startMs: number
  rightsAttested: boolean
  removeExisting: boolean
}
