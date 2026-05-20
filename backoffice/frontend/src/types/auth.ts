export type LoginFailReason =
  | 'invalid_credentials'
  | 'invalid_form'
  | 'server_error'
  | 'missing_token'
  | 'api_unreachable'

export type LoginResult = { ok: true; token: string } | { ok: false; reason: LoginFailReason }
