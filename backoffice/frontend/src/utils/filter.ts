export function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

export function matchesSearch(value: string, query: string): boolean {
  return normalizeSearchValue(value).includes(normalizeSearchValue(query))
}

export function filterByQuery<T>(items: T[], query: string, selector: (item: T) => string[]): T[] {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery) return items

  return items.filter((item) => {
    const values = selector(item)

    return values.some((value) => matchesSearch(value, normalizedQuery))
  })
}
