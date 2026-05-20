import type { TranslateFn } from '@/types'
import type {
  EditCompanyFieldErrors,
  EditCompanyFormValues,
  UpdateCompanyPayload,
} from '@/types/company'
import { getApiErrorKey } from '@/utils/api'
import { isBlank } from '@/utils/validation'

export function createEditCompanyFieldErrors(): EditCompanyFieldErrors {
  return {
    name: undefined,
    email: undefined,
  }
}

export function validateEditCompanyForm(
  values: EditCompanyFormValues,
  t: TranslateFn,
): EditCompanyFieldErrors {
  const errors = createEditCompanyFieldErrors()

  if (isBlank(values.name)) {
    errors.name = t('clients.details.form.errors.required')
  }

  if (isBlank(values.email)) {
    errors.email = t('clients.details.form.errors.required')
  } else if (!values.email.includes('@')) {
    errors.email = t('clients.details.form.errors.invalidEmail')
  }

  return errors
}

export function hasEditCompanyFormErrors(errors: EditCompanyFieldErrors): boolean {
  return Boolean(errors.name || errors.email)
}

export function buildUpdateCompanyPayload(values: EditCompanyFormValues): UpdateCompanyPayload {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    status: values.status,
  }
}

export function getEditCompanyApiFieldError(
  error: string,
  t: TranslateFn,
): { field: keyof EditCompanyFieldErrors; message: string } | null {
  if (error === 'invalid_email') {
    return {
      field: 'email',
      message: t('clients.details.form.errors.invalidEmail'),
    }
  }

  if (error === 'email_already_exists') {
    return {
      field: 'email',
      message: t('clients.details.form.errorsApi.emailAlreadyExists'),
    }
  }

  if (error === 'name_already_exists') {
    return {
      field: 'name',
      message: t('clients.details.form.errorsApi.nameAlreadyExists'),
    }
  }

  return null
}

export function getEditCompanyApiFormError(error: string, t: TranslateFn): string {
  return t(getApiErrorKey(error, 'clients.details.form.errorsApi'))
}
