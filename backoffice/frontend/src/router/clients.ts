import type { RouteLocationRaw } from 'vue-router'

export function getClientsRoute(): RouteLocationRaw {
  return { name: 'clients' }
}

export function getCreateCompanyRoute(): RouteLocationRaw {
  return { name: 'clients-create' }
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

export function getCompanyAccountsRoute(companyId: number | string): RouteLocationRaw {
  return {
    name: 'clients',
    query: {
      companyId: String(companyId),
    },
  }
}
