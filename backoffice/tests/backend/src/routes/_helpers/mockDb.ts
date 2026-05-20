import { vi } from 'vitest'
import bcrypt from 'bcryptjs'

import {
  ADMIN_ROLE_ADMIN,
  ADMIN_ROLE_SUPERADMIN,
  ADMIN_ROLE_USER,
  ADMIN_STATUS_ACTIVE,
  ADMIN_STATUS_DELETED,
  ADMIN_STATUS_INACTIVE,
  COMPANY_STATUS_ACTIVE,
  COMPANY_STATUS_INACTIVE,
} from '@quizzup/shared'

export const MOCK_NOW = '2026-05-20T12:00:00.000Z'

const TEST_BCRYPT_ROUNDS = 4

const TEST_PASSWORD_HASHES = {
  root: bcrypt.hashSync('root-password', TEST_BCRYPT_ROUNDS),
  alice: bcrypt.hashSync('alice-password', TEST_BCRYPT_ROUNDS),
  bob: bcrypt.hashSync('bob-password', TEST_BCRYPT_ROUNDS),
}

type Row = Record<string, unknown>

type DbState = {
  companies: Row[]
  admins: Row[]
  admin_sessions: Row[]
}

export const dbState: DbState = {
  companies: [],
  admins: [],
  admin_sessions: [],
}

const DEFAULT_COMPANIES: Row[] = [
  {
    id: 1,
    name: 'QuizzUp',
    email: 'contact@quizzup.test',
    status: COMPANY_STATUS_ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  },
  {
    id: 2,
    name: 'Client Deux',
    email: 'client2@quizzup.test',
    status: COMPANY_STATUS_INACTIVE,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    deleted_at: null,
  },
]

const DEFAULT_ADMINS: Row[] = [
  {
    id: 1,
    company_id: 1,
    role: ADMIN_ROLE_SUPERADMIN,
    firstname: 'Root',
    lastname: 'Admin',
    username: 'root',
    email: 'root@quizzup.test',
    mdp_hash: TEST_PASSWORD_HASHES.root,
    status: ADMIN_STATUS_ACTIVE,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  },
  {
    id: 2,
    company_id: 1,
    role: ADMIN_ROLE_ADMIN,
    firstname: 'Alice',
    lastname: 'Admin',
    username: 'alice',
    email: 'alice@quizzup.test',
    mdp_hash: TEST_PASSWORD_HASHES.alice,
    status: ADMIN_STATUS_ACTIVE,
    created_at: '2026-01-02T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    deleted_at: null,
  },
  {
    id: 3,
    company_id: 2,
    role: ADMIN_ROLE_USER,
    firstname: 'Bob',
    lastname: 'User',
    username: 'bob',
    email: 'bob@client2.test',
    mdp_hash: TEST_PASSWORD_HASHES.bob,
    status: ADMIN_STATUS_INACTIVE,
    created_at: '2026-01-03T00:00:00.000Z',
    updated_at: '2026-01-03T00:00:00.000Z',
    deleted_at: null,
  },
]

export function resetDb(seed?: Partial<DbState>): void {
  dbState.companies = structuredClone(seed?.companies ?? DEFAULT_COMPANIES)
  dbState.admins = structuredClone(seed?.admins ?? DEFAULT_ADMINS)
  dbState.admin_sessions = structuredClone(seed?.admin_sessions ?? [])
  db.fn.now.mockClear()
  db.raw.mockClear()
}

function normalizeColumn(column: string): string {
  const withoutAlias = column.split(/\s+as\s+/i)[0] ?? column
  const withoutPrefix = withoutAlias.includes('.')
    ? withoutAlias.slice(withoutAlias.lastIndexOf('.') + 1)
    : withoutAlias

  return withoutPrefix.replaceAll('"', '').trim()
}

function normalizeAlias(column: string): string {
  const aliasMatch = column.match(/\s+as\s+("?[\w]+"?)/i)

  if (aliasMatch?.[1]) {
    return aliasMatch[1].replaceAll('"', '')
  }

  return normalizeColumn(column)
}

function getTableRows(table: keyof DbState): Row[] {
  return dbState[table]
}

function nextNumericId(table: keyof DbState): number {
  const rows = getTableRows(table)
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))

  return ids.length > 0 ? Math.max(...ids) + 1 : 1
}

function computeAccountsCount(companyId: number): number {
  return dbState.admins.filter((admin) => {
    return admin.company_id === companyId && admin.status !== ADMIN_STATUS_DELETED
  }).length
}

function cloneRow(row: Row): Row {
  return structuredClone(row)
}

type RawSql = {
  __raw: true
  sql: string
  bindings: unknown[]
}

type SelectColumn = string | RawSql
type SortConfig = {
  column: string
  direction: 'asc' | 'desc'
}

class QueryBuilder {
  private readonly table: keyof DbState

  private readonly filters: Array<(row: Row) => boolean> = []

  private selectedColumns: SelectColumn[] | Record<string, string> | null = null

  private sortConfig: SortConfig | null = null

  private countMode = false

  private insertPayload: Row | Row[] | null = null

  private updatePayload: Row | null = null

  private executed = false

  private operationResult: unknown

  public constructor(table: string) {
    this.table = table as keyof DbState
  }

  public select(...columns: unknown[]): this {
    this.selectedColumns = this.flattenColumns(columns)

    return this
  }

  public first(...columns: unknown[]): Promise<Row | undefined> {
    if (columns.length > 0) {
      this.selectedColumns = this.flattenColumns(columns)
    }

    return Promise.resolve(this.executeSelect()[0])
  }

  public where(columnOrObject: string | Row, value?: unknown): this {
    if (typeof columnOrObject === 'object') {
      Object.entries(columnOrObject).forEach(([column, expected]) => {
        this.filters.push((row) => row[normalizeColumn(column)] === expected)
      })

      return this
    }

    const column = normalizeColumn(columnOrObject)
    this.filters.push((row) => row[column] === value)

    return this
  }

  public andWhereRaw(sql: string, bindings: unknown[]): this {
    return this.whereRaw(sql, bindings)
  }

  public whereRaw(sql: string, bindings: unknown[]): this {
    const columnMatch = sql.match(/lower\(([\w.]+)\)/i)
    const column = columnMatch?.[1] ? normalizeColumn(columnMatch[1]) : null
    const expected = String(bindings[0] ?? '').toLowerCase()

    if (column) {
      this.filters.push((row) => String(row[column] ?? '').toLowerCase() === expected)
    }

    return this
  }

  public whereNot(column: string, value: unknown): this {
    const normalizedColumn = normalizeColumn(column)
    this.filters.push((row) => row[normalizedColumn] !== value)

    return this
  }

  public leftJoin(): this {
    return this
  }

  public groupBy(): this {
    return this
  }

  public orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.sortConfig = {
      column: normalizeColumn(column),
      direction,
    }

    return this
  }

  public count(): this {
    this.countMode = true

    return this
  }

  public insert(payload: Row | Row[]): this {
    this.insertPayload = payload

    return this
  }

  public update(payload: Row): this {
    this.updatePayload = payload

    return this
  }

  public returning(columns: unknown): Promise<Row[]> {
    this.selectedColumns = this.flattenColumns([columns])

    return Promise.resolve(this.executeMutationReturningRows())
  }

  public then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute(): unknown {
    if (this.executed) {
      return this.operationResult
    }

    if (this.insertPayload) {
      this.operationResult = this.executeInsert()
    } else if (this.updatePayload) {
      this.operationResult = this.executeUpdate()
    } else {
      this.operationResult = this.executeSelect()
    }

    this.executed = true

    return this.operationResult
  }

  private executeSelect(): Row[] {
    const rows = this.filteredRows()

    if (this.countMode) {
      return [{ count: String(rows.length) }]
    }

    return this.sortRows(rows).map((row) => this.mapSelectedRow(row))
  }

  private executeInsert(): Row[] {
    const rows = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload]
    const insertedRows = rows
      .filter((row): row is Row => Boolean(row))
      .map((payload) => {
        const row: Row = {
          ...payload,
          created_at: payload.created_at ?? MOCK_NOW,
          updated_at: payload.updated_at ?? MOCK_NOW,
        }

        if (row.id === undefined && this.table !== 'admin_sessions') {
          row.id = nextNumericId(this.table)
        }

        getTableRows(this.table).push(row)

        return row
      })

    return insertedRows
  }

  private executeUpdate(): number {
    const rows = this.filteredRows()
    rows.forEach((row) => Object.assign(row, this.updatePayload ?? {}))

    return rows.length
  }

  private executeMutationReturningRows(): Row[] {
    if (this.executed) {
      return Array.isArray(this.operationResult) ? (this.operationResult as Row[]) : []
    }

    let rows: Row[] = []

    if (this.insertPayload) {
      rows = this.executeInsert()
    } else if (this.updatePayload) {
      rows = this.filteredRows()
      rows.forEach((row) => Object.assign(row, this.updatePayload ?? {}))
    }

    this.executed = true
    this.operationResult = rows

    return rows.map((row) => this.mapSelectedRow(row))
  }

  private filteredRows(): Row[] {
    return getTableRows(this.table).filter((row) => {
      return this.filters.every((filter) => filter(row))
    })
  }

  private sortRows(rows: Row[]): Row[] {
    if (!this.sortConfig) {
      return rows
    }

    const { column, direction } = this.sortConfig
    const multiplier = direction === 'desc' ? -1 : 1

    return [...rows].sort((a, b) => {
      const aValue = a[column] as string | number
      const bValue = b[column] as string | number

      if (aValue === bValue) {
        return 0
      }

      return aValue > bValue ? multiplier : -multiplier
    })
  }

  private flattenColumns(columns: unknown[]): SelectColumn[] | Record<string, string> | null {
    if (columns.length === 1 && Array.isArray(columns[0])) {
      return columns[0] as SelectColumn[]
    }

    if (columns.length === 1 && typeof columns[0] === 'object' && !('__raw' in (columns[0] as Row))) {
      return columns[0] as Record<string, string>
    }

    return columns as SelectColumn[]
  }

  private mapSelectedRow(row: Row): Row {
    const cloned = cloneRow(row)

    if (!this.selectedColumns) {
      return this.addComputedFields(cloned)
    }

    if (!Array.isArray(this.selectedColumns)) {
      return Object.fromEntries(
        Object.entries(this.selectedColumns).map(([alias, column]) => [
          alias,
          row[normalizeColumn(column)],
        ]),
      )
    }

    const mapped: Row = {}

    this.selectedColumns.forEach((column) => {
      if (typeof column !== 'string') {
        return
      }

      mapped[normalizeAlias(column)] = row[normalizeColumn(column)]
    })

    return this.addComputedFields(mapped, row)
  }

  private addComputedFields(mapped: Row, sourceRow = mapped): Row {
    const hasAccountsCountSelection =
      Array.isArray(this.selectedColumns) &&
      this.selectedColumns.some((column) => {
        return typeof column !== 'string' && String(column.sql).includes('COUNT(admins.id)')
      })

    if (this.table === 'companies' && hasAccountsCountSelection) {
      mapped.accountsCount = computeAccountsCount(Number(sourceRow.id))
    }

    return mapped
  }
}

type MockDb = {
  (table: string): QueryBuilder
  fn: {
    now: ReturnType<typeof vi.fn>
  }
  raw: ReturnType<typeof vi.fn>
}

export const db = Object.assign(
  (table: string) => new QueryBuilder(table),
  {
    fn: {
      now: vi.fn(() => MOCK_NOW),
    },
    raw: vi.fn((sql: string, bindings: unknown[] = []) => ({
      __raw: true,
      sql,
      bindings,
    })),
  },
) as MockDb
