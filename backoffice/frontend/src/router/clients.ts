import type { RouteLocationRaw } from 'vue-router'

export function getClientsRoute(): RouteLocationRaw {
  return { name: 'clients' }
}

export function getCreateCompanyRoute(): RouteLocationRaw {
  return { name: 'clients-create' }
}

export function getClientDetailsRoute(companyId: number | string): RouteLocationRaw {
  return {
    name: 'client-details',
    params: {
      id: String(companyId),
    },
  }
}

export function getCompanyAccountsRoute(companyId: number | string): RouteLocationRaw {
  return {
    name: 'client-details',
    params: {
      id: String(companyId),
    },
    hash: '#accounts',
  }
}

export function getEditCompanyRoute(companyId: number | string): RouteLocationRaw {
  return {
    name: 'client-details',
    params: {
      id: String(companyId),
    },
    hash: '#company-info',
  }
}

export function getCreateCompanyAccountRoute(companyId: number | string): RouteLocationRaw {
  return {
    path: `/clients/${companyId}/accounts/create`,
  }
}

export function getEditCompanyAccountRoute(
  companyId: number | string,
  accountId: number | string,
): RouteLocationRaw {
  return {
    path: `/clients/${companyId}/accounts/${accountId}/edit`,
  }
}
