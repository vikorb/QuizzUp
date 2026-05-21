export const COMPANY_STATUS_INACTIVE = 0 as const
export const COMPANY_STATUS_ACTIVE = 1 as const
export const COMPANY_STATUS_DELETED = 2 as const

export const COMPANY_STATUS = {
  INACTIVE: COMPANY_STATUS_INACTIVE,
  ACTIVE: COMPANY_STATUS_ACTIVE,
  DELETED: COMPANY_STATUS_DELETED,
} as const

export type CompanyStatus = (typeof COMPANY_STATUS)[keyof typeof COMPANY_STATUS]

export const ADMIN_STATUS_INACTIVE = 0 as const
export const ADMIN_STATUS_ACTIVE = 1 as const
export const ADMIN_STATUS_DELETED = 2 as const

export const ADMIN_STATUS = {
  ACTIVE: ADMIN_STATUS_ACTIVE,
  INACTIVE: ADMIN_STATUS_INACTIVE,
  DELETED: ADMIN_STATUS_DELETED,
} as const

export type AdminStatus = (typeof ADMIN_STATUS)[keyof typeof ADMIN_STATUS]

export const ADMIN_ROLE_SUPERADMIN = 'superadmin' as const
export const ADMIN_ROLE_ADMIN = 'admin' as const
export const ADMIN_ROLE_USER = 'user' as const

export const ADMIN_ROLE = {
  SUPERADMIN: ADMIN_ROLE_SUPERADMIN,
  ADMIN: ADMIN_ROLE_ADMIN,
  USER: ADMIN_ROLE_USER,
} as const

export type AdminRole = (typeof ADMIN_ROLE)[keyof typeof ADMIN_ROLE]

export const THEME_STATUS_INACTIVE = 0 as const
export const THEME_STATUS_ACTIVE = 1 as const
export const THEME_STATUS_DELETED = 2 as const
export const THEME_STATUS_DRAFT = 3 as const

export const THEME_STATUS = {
  INACTIVE: THEME_STATUS_INACTIVE,
  ACTIVE: THEME_STATUS_ACTIVE,
  DELETED: THEME_STATUS_DELETED,
  DRAFT: THEME_STATUS_DRAFT,
} as const

export const THEME_STATUSES = [
  THEME_STATUS_INACTIVE,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
] as const

export type ThemeStatus = (typeof THEME_STATUS)[keyof typeof THEME_STATUS]

export const THEME_MODE_CLASSIC = 'classic' as const
export const THEME_MODE_IMAGE = 'image' as const
export const THEME_MODE_AUDIO = 'audio' as const
export const THEME_MODE_MIXED = 'mixed' as const

export const THEME_MODE = {
  CLASSIC: THEME_MODE_CLASSIC,
  IMAGE: THEME_MODE_IMAGE,
  AUDIO: THEME_MODE_AUDIO,
  MIXED: THEME_MODE_MIXED,
} as const

export const THEME_MODES = [
  THEME_MODE_CLASSIC,
  THEME_MODE_IMAGE,
  THEME_MODE_AUDIO,
  THEME_MODE_MIXED,
] as const

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE]

export const THEME_SCOPE_GLOBAL = 'global' as const
export const THEME_SCOPE_COMPANY = 'company' as const

export const THEME_SCOPE = {
  GLOBAL: THEME_SCOPE_GLOBAL,
  COMPANY: THEME_SCOPE_COMPANY,
} as const

export const THEME_SCOPES = [
  THEME_SCOPE_GLOBAL,
  THEME_SCOPE_COMPANY,
] as const

export type ThemeScope = (typeof THEME_SCOPE)[keyof typeof THEME_SCOPE]

export const QUESTION_STATUS_INACTIVE = 0 as const
export const QUESTION_STATUS_ACTIVE = 1 as const
export const QUESTION_STATUS_DELETED = 2 as const
export const QUESTION_STATUS_DRAFT = 3 as const

export const QUESTION_STATUS = {
  INACTIVE: QUESTION_STATUS_INACTIVE,
  ACTIVE: QUESTION_STATUS_ACTIVE,
  DELETED: QUESTION_STATUS_DELETED,
  DRAFT: QUESTION_STATUS_DRAFT,
} as const

export const QUESTION_STATUSES = [
  QUESTION_STATUS_INACTIVE,
  QUESTION_STATUS_ACTIVE,
  QUESTION_STATUS_DELETED,
  QUESTION_STATUS_DRAFT,
] as const

export type QuestionStatus = (typeof QUESTION_STATUS)[keyof typeof QUESTION_STATUS]

export const QUESTION_MEDIA_TYPE_NONE = 'none' as const
export const QUESTION_MEDIA_TYPE_IMAGE = 'image' as const
export const QUESTION_MEDIA_TYPE_AUDIO = 'audio' as const
export const QUESTION_MEDIA_TYPE_VIDEO = 'video' as const

export const QUESTION_MEDIA_TYPE = {
  NONE: QUESTION_MEDIA_TYPE_NONE,
  IMAGE: QUESTION_MEDIA_TYPE_IMAGE,
  AUDIO: QUESTION_MEDIA_TYPE_AUDIO,
  VIDEO: QUESTION_MEDIA_TYPE_VIDEO,
} as const

export const QUESTION_MEDIA_TYPES = [
  QUESTION_MEDIA_TYPE_NONE,
  QUESTION_MEDIA_TYPE_IMAGE,
  QUESTION_MEDIA_TYPE_AUDIO,
  QUESTION_MEDIA_TYPE_VIDEO,
] as const

export type QuestionMediaType = (typeof QUESTION_MEDIA_TYPE)[keyof typeof QUESTION_MEDIA_TYPE]

export const ANSWER_STATUS_INACTIVE = 0 as const
export const ANSWER_STATUS_ACTIVE = 1 as const
export const ANSWER_STATUS_DELETED = 2 as const
export const ANSWER_STATUS_DRAFT = 3 as const

export const ANSWER_STATUS = {
  INACTIVE: ANSWER_STATUS_INACTIVE,
  ACTIVE: ANSWER_STATUS_ACTIVE,
  DELETED: ANSWER_STATUS_DELETED,
  DRAFT: ANSWER_STATUS_DRAFT,
} as const

export const ANSWER_STATUSES = [
  ANSWER_STATUS_INACTIVE,
  ANSWER_STATUS_ACTIVE,
  ANSWER_STATUS_DELETED,
  ANSWER_STATUS_DRAFT,
] as const

export type AnswerStatus = (typeof ANSWER_STATUS)[keyof typeof ANSWER_STATUS]
