export type ApiRequestOptions = {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: BodyInit | null
  headers?: HeadersInit
  authenticated?: boolean
  credentials?: RequestCredentials
}

export type ApiErrorCode =
  | 'missing_token'
  | 'unauthorized'
  | 'forbidden'
  | 'api_unreachable'
  | 'invalid_json'
  | 'invalid_body'
  | 'invalid_email'
  | 'email_already_exists'
  | 'name_already_exists'
  | 'conflict'
  | 'not_found'
  | 'room_name_already_exists'
  | 'room_account_already_exists'
  | 'room_account_not_found'
  | 'username_already_exists'
  | 'company_deleted'
  | 'server_error'

export type ApiSuccess<T> = {
  ok: true
  status: number
  data: T
}

export type ApiFailure = {
  ok: false
  status: number | null
  error: ApiErrorCode
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type ApiErrorPayload = {
  error?: string
  code?: string
  message?: string
}
