import type {
  CreateCompanyApiFieldError,
  CreateCompanyFieldErrors,
  CreateCompanyFormValues,
  CreateCompanyPayload,
} from '@/types/company'
import { getApiErrorKey } from '@/utils/api'
import { isBlank } from '@/utils/validation'

type Translate = (key: string) => string

export function createCompanyFieldErrors(): CreateCompanyFieldErrors {
  return {
    name: undefined,
    email: undefined,
  }
}

export function validateCreateCompanyForm(
  values: CreateCompanyFormValues,
  t: Translate,
): CreateCompanyFieldErrors {
  const errors = createCompanyFieldErrors()

  if (isBlank(values.name)) {
    errors.name = t('clients.create.errors.required')
  }

  if (isBlank(values.email)) {
    errors.email = t('clients.create.errors.required')
  } else if (!values.email.includes('@')) {
    errors.email = t('clients.create.errors.invalidEmail')
  }

  return errors
}

export function hasCreateCompanyFormErrors(errors: CreateCompanyFieldErrors): boolean {
  return Boolean(errors.name || errors.email)
}

export function buildCreateCompanyPayload(values: CreateCompanyFormValues): CreateCompanyPayload {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
  }
}

export function getCreateCompanyApiFieldError(
  error: string,
  t: Translate,
): CreateCompanyApiFieldError | null {
  if (error === 'invalid_email') {
    return {
      field: 'email',
      message: t('clients.create.errors.invalidEmail'),
    }
  }

  if (error === 'email_already_exists') {
    return {
      field: 'email',
      message: t('clients.create.errorsApi.emailAlreadyExists'),
    }
  }

  if (error === 'name_already_exists') {
    return {
      field: 'name',
      message: t('clients.create.errorsApi.nameAlreadyExists'),
    }
  }

  return null
}

export function getCreateCompanyApiFormError(error: string, t: Translate): string {
  return t(getApiErrorKey(error, 'clients.create.errorsApi'))
}
