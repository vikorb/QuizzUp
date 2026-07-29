import {
  THEME_MODE_CLASSIC,
  THEME_SCOPE_COMPANY,
  THEME_SCOPE_GLOBAL,
  THEME_STATUS_ACTIVE,
  THEME_STATUS_DELETED,
  THEME_STATUS_DRAFT,
  type ThemeMode,
  type ThemeScope,
  type ThemeStatus,
} from '@quizzup/shared'
import { vi } from 'vitest'

export type ThemeMock = {
  id: number
  adminId: number
  companyId: number | null
  scope: ThemeScope
  name: string
  mode: ThemeMode
  status: ThemeStatus
  questionsCount?: number
  createdAt?: string
  updatedAt?: string | null
  deletedAt?: string | null
}

export type ThemeFiltersMock = {
  search?: string
  mode?: string
  status?: string
  scope?: string
}

type ServiceErrorResult = {
  ok: false
  status: number | null
  error: string
}

type ListThemesResult =
  | {
      ok: true
      status: number
      data: {
        themes: ThemeMock[]
      }
    }
  | ServiceErrorResult

type ThemeResult =
  | {
      ok: true
      status: number
      data: {
        theme: ThemeMock
      }
    }
  | ServiceErrorResult

type UpdateThemeStatusResult =
  | {
      ok: true
      theme: ThemeMock
    }
  | {
      ok: false
      error: string
    }

export function createThemeFixture(overrides: Partial<ThemeMock> = {}): ThemeMock {
  return {
    id: 1,
    adminId: 1,
    companyId: null,
    scope: THEME_SCOPE_GLOBAL,
    name: 'Global A',
    mode: THEME_MODE_CLASSIC,
    status: THEME_STATUS_ACTIVE,
    questionsCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

export const themesFixture: ThemeMock[] = [
  createThemeFixture({
    id: 1,
    name: 'Global A',
    scope: THEME_SCOPE_GLOBAL,
    companyId: null,
    questionsCount: 4,
  }),
  createThemeFixture({
    id: 2,
    name: 'Company One',
    scope: THEME_SCOPE_COMPANY,
    companyId: 1,
    questionsCount: 1,
  }),
  createThemeFixture({
    id: 3,
    name: 'Draft Theme',
    scope: THEME_SCOPE_COMPANY,
    companyId: 1,
    status: THEME_STATUS_DRAFT,
    questionsCount: 0,
  }),
]

export const deletedThemeFixture: ThemeMock = createThemeFixture({
  id: 9,
  name: 'Deleted Theme',
  status: THEME_STATUS_DELETED,
  deletedAt: '2026-03-01T00:00:00.000Z',
})

export const listThemesServiceMock = vi.fn(
  async (_filters: ThemeFiltersMock = {}): Promise<ListThemesResult> => ({
    ok: true,
    status: 200,
    data: {
      themes: themesFixture,
    },
  })
)

export const loadThemeServiceMock = vi.fn(async (themeId: number): Promise<ThemeResult> => ({
  ok: true,
  status: 200,
  data: {
    theme: createThemeFixture({ id: themeId }),
  },
}))

export const createThemeServiceMock = vi.fn(
  async (payload: Record<string, unknown>): Promise<ThemeResult> => ({
    ok: true,
    status: 201,
    data: {
      theme: createThemeFixture({
        id: 42,
        name: String(payload.name ?? 'Created'),
        mode: (payload.mode as ThemeMode | undefined) ?? THEME_MODE_CLASSIC,
        scope: (payload.scope as ThemeScope | undefined) ?? THEME_SCOPE_GLOBAL,
      }),
    },
  })
)

export const updateThemeServiceMock = vi.fn(
  async (themeId: number, payload: Record<string, unknown>): Promise<ThemeResult> => ({
    ok: true,
    status: 200,
    data: {
      theme: createThemeFixture({
        id: themeId,
        name: String(payload.name ?? 'Updated'),
        mode: (payload.mode as ThemeMode | undefined) ?? THEME_MODE_CLASSIC,
      }),
    },
  })
)

export const updateThemeStatusServiceMock = vi.fn(
  async (themeId: number, status: ThemeStatus): Promise<UpdateThemeStatusResult> => ({
    ok: true,
    theme: createThemeFixture({
      id: themeId,
      status,
      deletedAt: status === THEME_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
    }),
  })
)

export const deleteThemeServiceMock = vi.fn(async (themeId: number): Promise<ThemeResult> => ({
  ok: true,
  status: 200,
  data: {
    theme: createThemeFixture({
      id: themeId,
      status: THEME_STATUS_DELETED,
      deletedAt: '2026-03-01T00:00:00.000Z',
    }),
  },
}))

export function mockListThemesSuccess(themes: ThemeMock[] = themesFixture): void {
  listThemesServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      themes,
    },
  })
}

export function mockListThemesFailure(error = 'server_error'): void {
  listThemesServiceMock.mockResolvedValue({
    ok: false,
    status: 500,
    error,
  })
}

export function mockLoadThemeSuccess(theme: ThemeMock = themesFixture[0]): void {
  loadThemeServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      theme,
    },
  })
}

export function mockLoadThemeFailure(error = 'not_found'): void {
  loadThemeServiceMock.mockResolvedValue({
    ok: false,
    status: 404,
    error,
  })
}

export function mockCreateThemeSuccess(theme: ThemeMock = createThemeFixture({ id: 42 })): void {
  createThemeServiceMock.mockResolvedValue({
    ok: true,
    status: 201,
    data: {
      theme,
    },
  })
}

export function mockCreateThemeFailure(error = 'name_already_exists'): void {
  createThemeServiceMock.mockResolvedValue({
    ok: false,
    status: 409,
    error,
  })
}

export function mockUpdateThemeSuccess(theme: ThemeMock = themesFixture[0]): void {
  updateThemeServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      theme,
    },
  })
}

export function mockUpdateThemeFailure(error = 'server_error'): void {
  updateThemeServiceMock.mockResolvedValue({
    ok: false,
    status: 500,
    error,
  })
}

export function mockUpdateThemeStatusSuccess(theme: Partial<ThemeMock> = {}): void {
  updateThemeStatusServiceMock.mockImplementation(
    async (themeId, status): Promise<UpdateThemeStatusResult> => ({
      ok: true,
      theme: createThemeFixture({
        ...theme,
        id: themeId,
        status,
        deletedAt: status === THEME_STATUS_DELETED ? '2026-03-01T00:00:00.000Z' : null,
      }),
    })
  )
}

export function mockUpdateThemeStatusFailure(error = 'forbidden'): void {
  updateThemeStatusServiceMock.mockResolvedValue({
    ok: false,
    error,
  })
}

export function mockDeleteThemeSuccess(themeId = 1): void {
  deleteThemeServiceMock.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      theme: createThemeFixture({
        id: themeId,
        status: THEME_STATUS_DELETED,
        deletedAt: '2026-03-01T00:00:00.000Z',
      }),
    },
  })
}

export function mockDeleteThemeFailure(error = 'server_error'): void {
  deleteThemeServiceMock.mockResolvedValue({
    ok: false,
    status: 500,
    error,
  })
}

export function resetThemesServiceMock(): void {
  listThemesServiceMock.mockReset()
  loadThemeServiceMock.mockReset()
  createThemeServiceMock.mockReset()
  updateThemeServiceMock.mockReset()
  updateThemeStatusServiceMock.mockReset()
  deleteThemeServiceMock.mockReset()

  mockListThemesSuccess()
  mockLoadThemeSuccess()
  mockCreateThemeSuccess()
  mockUpdateThemeSuccess()
  mockUpdateThemeStatusSuccess()
  mockDeleteThemeSuccess()
}
