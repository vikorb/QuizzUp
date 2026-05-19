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
    name: 'company-account-create',
    params: {
      companyId: String(companyId),
    },
  }
}

export function getEditCompanyAccountRoute(
  companyId: number | string,
  accountId: number | string,
): RouteLocationRaw {
  return {
    name: 'company-account-edit',
    params: {
      companyId: String(companyId),
      accountId: String(accountId),
    },
  }
}
