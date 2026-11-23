/** Codes renvoyés par l'API média, ou déduits du statut HTTP (413 / 415). */
export type QuestionMediaErrorCode =
  | 'question_media_required'
  | 'question_media_invalid_file'
  | 'question_media_rights_required'
  | 'question_media_duration_invalid'
  | 'question_media_not_found'
  | 'question_media_too_large'
  | 'question_media_type_unsupported'
  | 'forbidden'
  | 'api_unreachable'
  | 'server_error'

export class QuestionMediaError extends Error {
  readonly code: QuestionMediaErrorCode

  constructor(code: QuestionMediaErrorCode) {
    super(code)
    this.code = code
    this.name = 'QuestionMediaError'
  }
}
