export type Company = {
  id: number
  name: string
  email: string
  accountsCount?: number
}

export type CompaniesResponse = {
  companies: Company[]
}
