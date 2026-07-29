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
  QUESTION_STATUS_DELETED,
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
  themes: Row[]
  questions: Row[]
  answers: Row[]
  question_themes: Row[]
}

type TableName = keyof DbState

const QUALIFIED_KEY = '__qualified'

// Tables sans colonne `id` auto-incrémentée.
const TABLES_WITHOUT_ID = new Set<TableName>(['admin_sessions', 'question_themes'])

export const dbState: DbState = {
  companies: [],
  admins: [],
  admin_sessions: [],
  themes: [],
  questions: [],
  answers: [],
  question_themes: [],
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
  dbState.themes = structuredClone(seed?.themes ?? [])
  dbState.questions = structuredClone(seed?.questions ?? [])
  dbState.answers = structuredClone(seed?.answers ?? [])
  dbState.question_themes = structuredClone(seed?.question_themes ?? [])
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

// Nom pleinement qualifié (`table.colonne`) sans alias ni guillemets.
function qualifiedBase(column: string): string {
  const withoutAlias = column.split(/\s+as\s+/i)[0] ?? column

  return withoutAlias.replaceAll('"', '').trim()
}

// Lecture d'une valeur de colonne en tenant compte des jointures : les lignes
// jointes portent une map `__qualified` indexée par `table.colonne`.
function getRowValue(row: Row, column: string): unknown {
  const base = qualifiedBase(column)
  const qualified = row[QUALIFIED_KEY] as Record<string, unknown> | undefined

  if (qualified && base.includes('.') && base in qualified) {
    return qualified[base]
  }

  return row[normalizeColumn(base)]
}

function likeToNeedle(pattern: unknown): string {
  return String(pattern ?? '')
    .replaceAll('%', '')
    .toLowerCase()
}

function getTableRows(table: TableName): Row[] {
  return dbState[table]
}

function nextNumericId(table: TableName): number {
  const rows = getTableRows(table)
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))

  return ids.length > 0 ? Math.max(...ids) + 1 : 1
}

function computeAccountsCount(companyId: number): number {
  return dbState.admins.filter((admin) => {
    return admin.company_id === companyId && admin.status !== ADMIN_STATUS_DELETED
  }).length
}

function computeThemeQuestionsCount(themeId: number): number {
  return dbState.question_themes.filter((link) => {
    if (Number(link.theme_id) !== themeId) {
      return false
    }

    const question = dbState.questions.find((row) => Number(row.id) === Number(link.question_id))

    return question ? question.status !== QUESTION_STATUS_DELETED : false
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

type JoinConfig = {
  table: TableName
  leftColumn: string
  rightColumn: string
}

type Predicate = (row: Row) => boolean
type ClauseColumn = string | Row | ((this: ConditionGroup) => void)

// Groupe de conditions imbriqué (utilisé par `where(function () { ... })`) qui
// combine ses clauses de gauche à droite selon leur connecteur (and / or).
class ConditionGroup {
  private readonly clauses: Array<{ combinator: 'and' | 'or'; predicate: Predicate }> = []

  public where(column: ClauseColumn, value?: unknown): this {
    return this.add('and', column, value)
  }

  public orWhere(column: ClauseColumn, value?: unknown): this {
    return this.add('or', column, value)
  }

  public whereNot(column: string, value: unknown): this {
    this.clauses.push({
      combinator: 'and',
      predicate: (row) => getRowValue(row, column) !== value,
    })

    return this
  }

  public evaluate(row: Row): boolean {
    if (this.clauses.length === 0) {
      return true
    }

    let result = this.clauses[0]!.predicate(row)

    for (let index = 1; index < this.clauses.length; index += 1) {
      const clause = this.clauses[index]!

      result =
        clause.combinator === 'or'
          ? result || clause.predicate(row)
          : result && clause.predicate(row)
    }

    return result
  }

  private add(combinator: 'and' | 'or', column: ClauseColumn, value: unknown): this {
    this.clauses.push({ combinator, predicate: toPredicate(column, value) })

    return this
  }
}

function toPredicate(column: ClauseColumn, value: unknown): Predicate {
  if (typeof column === 'function') {
    const group = new ConditionGroup()
    column.call(group)

    return (row) => group.evaluate(row)
  }

  if (typeof column === 'object') {
    const entries = Object.entries(column)

    return (row) => entries.every(([col, expected]) => getRowValue(row, col) === expected)
  }

  return (row) => getRowValue(row, column) === value
}

// Sous-requête minimaliste pour `whereExists` (corrélée via `whereRaw`).
class ExistsBuilder {
  public table: TableName | null = null

  private readonly correlations: Array<[string, string]> = []

  private readonly equalities: Array<[string, unknown]> = []

  public select(): this {
    return this
  }

  public from(table: string): this {
    this.table = table as TableName

    return this
  }

  public whereRaw(sql: string): this {
    const match = String(sql).match(/([\w.]+)\s*=\s*([\w.]+)/)

    if (match?.[1] && match[2]) {
      this.correlations.push([match[1], match[2]])
    }

    return this
  }

  public where(column: string, value: unknown): this {
    this.equalities.push([column, value])

    return this
  }

  public andWhere(column: string, value: unknown): this {
    return this.where(column, value)
  }

  public matches(outerRow: Row): boolean {
    if (!this.table) {
      return false
    }

    return getTableRows(this.table).some((innerRow) => {
      const correlationsOk = this.correlations.every(([left, right]) => {
        return this.resolve(left, innerRow, outerRow) === this.resolve(right, innerRow, outerRow)
      })

      const equalitiesOk = this.equalities.every(([column, value]) => {
        return innerRow[normalizeColumn(column)] === value
      })

      return correlationsOk && equalitiesOk
    })
  }

  private resolve(column: string, innerRow: Row, outerRow: Row): unknown {
    const base = qualifiedBase(column)
    const [table] = base.split('.')

    if (table === this.table) {
      return innerRow[normalizeColumn(base)]
    }

    return getRowValue(outerRow, base)
  }
}

class QueryBuilder {
  private readonly table: TableName

  private readonly filters: Predicate[] = []

  private readonly joins: JoinConfig[] = []

  private selectedColumns: SelectColumn[] | Record<string, string> | null = null

  private sortConfig: SortConfig | null = null

  private countMode = false

  private insertPayload: Row | Row[] | null = null

  private updatePayload: Row | null = null

  private conflictColumns: string[] | null = null

  private ignoreConflicts = false

  private executed = false

  private operationResult: unknown

  public constructor(table: string) {
    this.table = table as TableName
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

  public where(columnOrObject: ClauseColumn, value?: unknown): this {
    this.filters.push(toPredicate(columnOrObject, value))

    return this
  }

  public orWhere(columnOrObject: ClauseColumn, value?: unknown): this {
    this.filters.push(toPredicate(columnOrObject, value))

    return this
  }

  public whereIn(column: string, values: unknown[]): this {
    const expected = new Set(values)
    this.filters.push((row) => expected.has(getRowValue(row, column)))

    return this
  }

  public whereILike(column: string, pattern: unknown): this {
    const needle = likeToNeedle(pattern)
    this.filters.push((row) =>
      String(getRowValue(row, column) ?? '')
        .toLowerCase()
        .includes(needle)
    )

    return this
  }

  public whereExists(builder: (this: ExistsBuilder) => void): this {
    const existsBuilder = new ExistsBuilder()
    builder.call(existsBuilder)
    this.filters.push((row) => existsBuilder.matches(row))

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
    this.filters.push((row) => getRowValue(row, column) !== value)

    return this
  }

  public join(table: string, leftColumn: string, rightColumn: string): this {
    this.joins.push({ table: table as TableName, leftColumn, rightColumn })

    return this
  }

  public whereNull(column: string): this {
    const normalizedColumn = normalizeColumn(column)
    this.filters.push(
      (row) => row[normalizedColumn] === null || row[normalizedColumn] === undefined
    )

    return this
  }

  public whereNotNull(column: string): this {
    const normalizedColumn = normalizeColumn(column)
    this.filters.push(
      (row) => row[normalizedColumn] !== null && row[normalizedColumn] !== undefined
    )

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
      column,
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

  public onConflict(columns: string[]): this {
    this.conflictColumns = columns

    return this
  }

  public ignore(): this {
    this.ignoreConflicts = true

    return this
  }

  public delete(): Promise<number> {
    const rows = this.filteredRows()
    const tableRows = getTableRows(this.table)

    rows.forEach((row) => {
      const index = tableRows.indexOf(row)

      if (index !== -1) {
        tableRows.splice(index, 1)
      }
    })

    return Promise.resolve(rows.length)
  }

  public returning(columns: unknown): Promise<Row[]> {
    this.selectedColumns = this.flattenColumns([columns])

    return Promise.resolve(this.executeMutationReturningRows())
  }

  public then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
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
    const insertedRows: Row[] = []

    rows
      .filter((row): row is Row => Boolean(row))
      .forEach((payload) => {
        if (this.ignoreConflicts && this.conflictColumns && this.conflicts(payload, insertedRows)) {
          return
        }

        const row: Row = {
          ...payload,
          created_at: payload.created_at ?? MOCK_NOW,
          updated_at: payload.updated_at ?? MOCK_NOW,
        }

        if (row.id === undefined && !TABLES_WITHOUT_ID.has(this.table)) {
          row.id = nextNumericId(this.table)
        }

        getTableRows(this.table).push(row)
        insertedRows.push(row)
      })

    return insertedRows
  }

  private conflicts(payload: Row, pending: Row[]): boolean {
    const columns = this.conflictColumns ?? []
    const matches = (row: Row): boolean =>
      columns.every((column) => row[column] === payload[column])

    return getTableRows(this.table).some(matches) || pending.some(matches)
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
    return this.baseRows().filter((row) => {
      return this.filters.every((filter) => filter(row))
    })
  }

  // Construit l'ensemble des lignes de base, en appliquant les jointures internes
  // et en conservant les colonnes qualifiées (`table.colonne`).
  private baseRows(): Row[] {
    if (this.joins.length === 0) {
      return getTableRows(this.table)
    }

    let combined = getTableRows(this.table).map((row) => this.toQualifiedRow(this.table, row))

    for (const join of this.joins) {
      const next: Row[] = []

      for (const current of combined) {
        for (const joinRow of getTableRows(join.table)) {
          const leftValue = this.resolveJoinValue(current, join.table, joinRow, join.leftColumn)
          const rightValue = this.resolveJoinValue(current, join.table, joinRow, join.rightColumn)

          if (leftValue === rightValue) {
            next.push(this.mergeQualified(current, join.table, joinRow))
          }
        }
      }

      combined = next
    }

    return combined
  }

  private toQualifiedRow(table: TableName, row: Row): Row {
    const qualified: Record<string, unknown> = {}

    Object.entries(row).forEach(([key, value]) => {
      qualified[`${table}.${key}`] = value
    })

    return { ...row, [QUALIFIED_KEY]: qualified }
  }

  private mergeQualified(current: Row, joinTable: TableName, joinRow: Row): Row {
    const qualified = { ...(current[QUALIFIED_KEY] as Record<string, unknown>) }

    Object.entries(joinRow).forEach(([key, value]) => {
      qualified[`${joinTable}.${key}`] = value
    })

    return { ...current, [QUALIFIED_KEY]: qualified }
  }

  private resolveJoinValue(
    current: Row,
    joinTable: TableName,
    joinRow: Row,
    column: string
  ): unknown {
    const base = qualifiedBase(column)
    const [table] = base.split('.')

    if (table === joinTable) {
      return joinRow[normalizeColumn(base)]
    }

    return getRowValue(current, base)
  }

  private sortRows(rows: Row[]): Row[] {
    if (!this.sortConfig) {
      return rows
    }

    const { column, direction } = this.sortConfig
    const multiplier = direction === 'desc' ? -1 : 1

    return [...rows].sort((a, b) => {
      const aValue = getRowValue(a, column) as string | number
      const bValue = getRowValue(b, column) as string | number

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

    if (
      columns.length === 1 &&
      typeof columns[0] === 'object' &&
      !('__raw' in (columns[0] as Row))
    ) {
      return columns[0] as Record<string, string>
    }

    return columns as SelectColumn[]
  }

  private mapSelectedRow(row: Row): Row {
    if (Array.isArray(this.selectedColumns) && this.selectedColumns.includes('*')) {
      return this.addComputedFields(this.stripQualified(row))
    }

    if (!this.selectedColumns) {
      return this.addComputedFields(this.stripQualified(row))
    }

    if (!Array.isArray(this.selectedColumns)) {
      return Object.fromEntries(
        Object.entries(this.selectedColumns).map(([alias, column]) => [
          alias,
          getRowValue(row, column),
        ])
      )
    }

    const mapped: Row = {}

    this.selectedColumns.forEach((column) => {
      if (typeof column !== 'string') {
        return
      }

      mapped[normalizeAlias(column)] = getRowValue(row, column)
    })

    return this.addComputedFields(mapped, row)
  }

  private stripQualified(row: Row): Row {
    const cloned = cloneRow(row)
    delete cloned[QUALIFIED_KEY]

    return cloned
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

    const hasThemeQuestionsCountSelection =
      Array.isArray(this.selectedColumns) &&
      this.selectedColumns.some((column) => {
        return typeof column !== 'string' && String(column.sql).includes('question_themes')
      })

    if (this.table === 'themes' && hasThemeQuestionsCountSelection) {
      mapped.questionsCount = computeThemeQuestionsCount(Number(sourceRow.id))
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
  transaction: <T>(callback: (trx: MockDb) => Promise<T> | T) => Promise<T>
}

export const db = Object.assign((table: string) => new QueryBuilder(table), {
  fn: {
    now: vi.fn(() => MOCK_NOW),
  },
  raw: vi.fn((sql: string, bindings: unknown[] = []) => ({
    __raw: true,
    sql,
    bindings,
  })),
  transaction: async <T>(callback: (trx: MockDb) => Promise<T> | T): Promise<T> => {
    return callback(db)
  },
}) as MockDb
