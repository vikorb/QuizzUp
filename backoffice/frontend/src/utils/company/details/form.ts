import type { AdminRole } from '@quizzup/shared'
import { ADMIN_ROLE_ADMIN, ADMIN_ROLE_SUPERADMIN, ADMIN_ROLE_USER, COMPANY_STATUS_ACTIVE } from '@quizzup/shared'
import type { ComposerTranslation } from 'vue-i18n'

import { updateCompanyService } from '@/services/companiesService'
import type { ClientDetailFormValues, ClientDetailPermissions, ClientDetailSaveResult, Company, EditCompanyFieldErrors, EditCompanyFormValues } from '@/types/company'
import {
  canManageCompanyDetails,
  canShowCompanyStatusSwitch,
  isCompanyDetailsReadonly,
} from '@/utils/company/details/permissions'
import { getNextCompanyStatus } from '@/utils/company/details/status'
import {
  buildUpdateCompanyPayload,
  createEditCompanyFieldErrors,
  getEditCompanyApiFieldError,
  getEditCompanyApiFormError,
  hasEditCompanyFormErrors,
  validateEditCompanyForm,
} from '@/utils/company/edit'

export function createCompanyDetailsForm(): EditCompanyFormValues {
  return {
    name: '',
    email: '',
    status: COMPANY_STATUS_ACTIVE,
  }
}

export function getCompanyDetailsFormValues(company: Company): EditCompanyFormValues {
  return {
    name: company.name,
    email: company.email,
    status: company.status,
  }
}

export function hasCompanyDetailsChanges(
  form: EditCompanyFormValues,
  company: Company | null,
  canManageCompany: boolean,
): boolean {
  if (!company || !canManageCompany) {
    return false
  }

  return (
    form.name.trim() !== company.name ||
    form.email.trim().toLowerCase() !== company.email.toLowerCase() ||
    form.status !== company.status
  )
}

function toAdminRole(role: unknown): AdminRole | null {
  if (
    role === ADMIN_ROLE_SUPERADMIN ||
    role === ADMIN_ROLE_ADMIN ||
    role === ADMIN_ROLE_USER
  ) {
    return role
  }

  return null
}

export function createClientDetailFormValues(): ClientDetailFormValues {
  return createCompanyDetailsForm()
}

export function createClientDetailFieldErrors(): EditCompanyFieldErrors {
  return createEditCompanyFieldErrors()
}

export function getClientDetailFormValues(company: Company): ClientDetailFormValues {
  return getCompanyDetailsFormValues(company)
}

export function getClientDetailPermissions(role: unknown): ClientDetailPermissions {
  const currentRole = toAdminRole(role)

  return {
    canManageCompany: canManageCompanyDetails(currentRole),
    canShowStatusSwitch: canShowCompanyStatusSwitch(currentRole),
    isCompanyReadonly: isCompanyDetailsReadonly(currentRole),
  }
}

export function hasClientDetailCompanyChanges(
  form: ClientDetailFormValues,
  company: Company,
  canManageCompany: boolean,
): boolean {
  return hasCompanyDetailsChanges(form, company, canManageCompany)
}

export function getClientDetailNextStatus(status: ClientDetailFormValues['status']) {
  return getNextCompanyStatus(status)
}

export async function saveClientDetailCompany(
  companyId: number,
  form: ClientDetailFormValues,
  t: ComposerTranslation,
): Promise<ClientDetailSaveResult> {
  const fieldErrors = validateEditCompanyForm(form, t)

  if (hasEditCompanyFormErrors(fieldErrors)) {
    return {
      ok: false,
      fieldErrors,
      formError: null,
    }
  }

  const result = await updateCompanyService(companyId, buildUpdateCompanyPayload(form))

  if (!result.ok) {
    const apiFieldError = getEditCompanyApiFieldError(result.error, t)
    const apiFieldErrors = createClientDetailFieldErrors()

    if (apiFieldError) {
      apiFieldErrors[apiFieldError.field] = apiFieldError.message

      return {
        ok: false,
        fieldErrors: apiFieldErrors,
        formError: null,
      }
    }

    return {
      ok: false,
      fieldErrors: apiFieldErrors,
      formError: getEditCompanyApiFormError(result.error, t),
    }
  }

  return {
    ok: true,
    company: result.data.company,
    successMessage: t('clients.details.form.success.updated'),
  }
}
