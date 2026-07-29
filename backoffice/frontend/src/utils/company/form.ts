import type { TranslateFn } from '@/types'
import type {
  CreateCompanyApiFieldError,
  CreateCompanyFieldErrors,
  CreateCompanyFormValues,
  CreateCompanyPayload,
  EditCompanyFieldErrors,
  EditCompanyFormValues,
  UpdateCompanyPayload,
} from '@/types/company'
import { getApiErrorKey } from '@/utils/api'
import { isBlank } from '@/utils/validation'

export type CompanyFormMode = 'create' | 'edit'

type CompanyFieldErrors = CreateCompanyFieldErrors | EditCompanyFieldErrors
type CompanyFormValues = CreateCompanyFormValues | EditCompanyFormValues

/**
 * Racine i18n propre à chaque mode. Le formulaire de création et celui d'édition
 * partagent exactement la même logique de validation/erreurs, seul le namespace
 * des clés de traduction diffère (et le champ `status` porté par le payload
 * d'édition).
 */
const COMPANY_FORM_I18N_BASE: Record<CompanyFormMode, string> = {
  create: 'clients.create',
  edit: 'clients.details.form',
}

export function createCompanyFieldErrors(): CreateCompanyFieldErrors {
  return {
    name: undefined,
    email: undefined,
  }
}

export function validateCompanyForm(
  values: CompanyFormValues,
  t: TranslateFn,
  mode: CompanyFormMode
): CreateCompanyFieldErrors {
  const base = COMPANY_FORM_I18N_BASE[mode]
  const errors = createCompanyFieldErrors()

  if (isBlank(values.name)) {
    errors.name = t(`${base}.errors.required`)
  }

  if (isBlank(values.email)) {
    errors.email = t(`${base}.errors.required`)
  } else if (!values.email.includes('@')) {
    errors.email = t(`${base}.errors.invalidEmail`)
  }

  return errors
}

export function hasCompanyFormErrors(errors: CompanyFieldErrors): boolean {
  return Boolean(errors.name || errors.email)
}

export function buildCreateCompanyPayload(values: CreateCompanyFormValues): CreateCompanyPayload {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
  }
}

export function buildUpdateCompanyPayload(values: EditCompanyFormValues): UpdateCompanyPayload {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    status: values.status,
  }
}

export function getCompanyApiFieldError(
  error: string,
  t: TranslateFn,
  mode: CompanyFormMode
): CreateCompanyApiFieldError | null {
  const base = COMPANY_FORM_I18N_BASE[mode]

  if (error === 'invalid_email') {
    return {
      field: 'email',
      message: t(`${base}.errors.invalidEmail`),
    }
  }

  if (error === 'email_already_exists') {
    return {
      field: 'email',
      message: t(`${base}.errorsApi.emailAlreadyExists`),
    }
  }

  if (error === 'name_already_exists') {
    return {
      field: 'name',
      message: t(`${base}.errorsApi.nameAlreadyExists`),
    }
  }

  return null
}

export function getCompanyApiFormError(
  error: string,
  t: TranslateFn,
  mode: CompanyFormMode
): string {
  return t(getApiErrorKey(error, `${COMPANY_FORM_I18N_BASE[mode]}.errorsApi`))
}
