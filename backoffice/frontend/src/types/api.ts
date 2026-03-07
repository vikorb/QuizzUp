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
  | 'forbidden'
  | 'unauthorized'
  | 'server_error'
  | 'api_unreachable'
  | 'invalid_json'

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
