import type { RouteLocationRaw } from 'vue-router'

export function getClientsRoute(): RouteLocationRaw {
  return { name: 'clients' }
}

export function getCreateCompanyRoute(): RouteLocationRaw {
  return { name: 'clients-create' }
}

export function getCompanyAccountsRoute(companyId: number | string): RouteLocationRaw {
  return {
    name: 'clients',
    query: {
      companyId: String(companyId),
    },
  }
}

export function getClientDetailsRoute(companyId: number | string): RouteLocationRaw {
  return getCompanyAccountsRoute(companyId)
}

export function getEditCompanyRoute(companyId: number | string): RouteLocationRaw {
  return {
    name: 'clients',
    query: {
      mode: 'edit',
      companyId: String(companyId),
    },
  }
}
