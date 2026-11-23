import {
  setAuthenticatedAdmin,
  setAuthenticatedSuperadmin,
} from '@frontend-tests/_helpers/authStateMock'
import {
  companiesFixture,
  loadCompaniesServiceMock,
  mockLoadCompaniesFailure,
  mockLoadCompaniesSuccess,
} from '@frontend-tests/_helpers/companiesServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import {
  createDryRunResult,
  importQuestionsServiceMock,
  mockImportFailure,
} from '@frontend-tests/_helpers/questionImportServiceMock'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import { COMPANY_STATUS_DELETED, QUESTION_IMPORT_MAX_BYTES } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { QuestionImportResult } from '@/types/questionImport'
import ImportQuestionsView from '@/views/questions/import/ImportQuestionsView.vue'

resetFrontendMocksBeforeEach()

const rowErrors = [
  { line: 2, column: 'theme', code: 'csv_theme_not_found' },
  { line: 4, column: null, code: 'csv_too_many_columns' },
]

function csv(name = 'questions.csv', type = 'text/csv'): File {
  return new File(['theme;question\n'], name, { type })
}

function mountView(): VueWrapper {
  return mountWithFrontendMocks(ImportQuestionsView, { attachTo: document.body })
}

async function pickFile(wrapper: VueWrapper, file: File | null): Promise<void> {
  const input = wrapper.find<HTMLInputElement>('#import-file')

  Object.defineProperty(input.element, 'files', { value: file ? [file] : [], configurable: true })
  await input.trigger('change')
}

const checkButton = (wrapper: VueWrapper) => wrapper.find('.import-check')
const confirmButton = (wrapper: VueWrapper) => wrapper.find('.import-confirm')
// Le stub du bandeau ajoute le texte de son bouton de fermeture : on ne garde que le message.
const bannerText = (wrapper: VueWrapper) =>
  wrapper
    .find('[data-test="base-banner"]')
    .text()
    .replace(/dismiss$/, '')

async function checkFile(wrapper: VueWrapper): Promise<void> {
  await checkButton(wrapper).trigger('click')
  await flushPromises()
}

function deferredResult(): {
  promise: Promise<QuestionImportResult>
  resolve: (result: QuestionImportResult) => void
} {
  let settle: ((result: QuestionImportResult) => void) | undefined
  const promise = new Promise<QuestionImportResult>((done) => {
    settle = done
  })

  return { promise, resolve: (result) => settle?.(result) }
}

async function mountChecked(): Promise<VueWrapper> {
  const wrapper = mountView()

  await pickFile(wrapper, csv())
  await checkFile(wrapper)

  return wrapper
}

beforeEach(() => {
  setAuthenticatedAdmin()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('views/questions/import/ImportQuestionsView.vue — before the check', () => {
  it('starts without file: check disabled and primary, nothing else offered', () => {
    const wrapper = mountView()

    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    expect(checkButton(wrapper).attributes('data-variant')).toBe('primary')
    expect(confirmButton(wrapper).exists()).toBe(false)
    expect(wrapper.find('[data-test="import-report-valid"]').exists()).toBe(false)
    expect(wrapper.find('#import-file').attributes('accept')).toContain('.csv')
  })

  it('refuses a file that is not a CSV before any request', async () => {
    const wrapper = mountView()

    await pickFile(wrapper, csv('questions.xlsx', 'application/vnd.ms-office'))

    expect(bannerText(wrapper)).toBe('questionImport.errors.csv_content_type_unsupported')
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    expect(importQuestionsServiceMock).not.toHaveBeenCalled()
  })

  it('refuses a file above the shared size limit before any request', async () => {
    const wrapper = mountView()
    const big = csv()

    Object.defineProperty(big, 'size', { value: QUESTION_IMPORT_MAX_BYTES + 1 })
    await pickFile(wrapper, big)

    expect(bannerText(wrapper)).toBe('questionImport.errors.file_too_large')
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    expect(importQuestionsServiceMock).not.toHaveBeenCalled()
  })

  it('enables the check once a valid file is chosen and clears an earlier refusal', async () => {
    const wrapper = mountView()

    await pickFile(wrapper, csv('questions.txt', 'text/plain'))
    await pickFile(wrapper, csv())

    expect(bannerText(wrapper)).toBe('')
    expect(checkButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('downloads the template as a CSV file', async () => {
    const createObjectURL = vi.fn(() => 'blob:template')
    const revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))

    const wrapper = mountView()

    await wrapper.find('.import-form__template').trigger('click')

    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0]

    expect(blob.type).toBe('text/csv;charset=utf-8')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template')

    click.mockRestore()
    vi.unstubAllGlobals()
  })
})

describe('views/questions/import/ImportQuestionsView.vue — check', () => {
  it('shows the line errors and offers no import while one error remains', async () => {
    importQuestionsServiceMock.mockResolvedValue(createDryRunResult(rowErrors))

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)

    expect(importQuestionsServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, scope: undefined, companyId: null })
    )
    expect(wrapper.find('[data-test="import-report-invalid"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="import-report-blocked"]').exists()).toBe(true)

    const rows = wrapper.findAll('[data-test="base-table-row"]')

    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('questionImport.errors.csv_theme_not_found')
    expect(rows[0]?.text()).toContain('theme')
    expect(rows[1]?.text()).toContain('questionImport.errors.csv_too_many_columns')
    expect(confirmButton(wrapper).exists()).toBe(false)
    expect(checkButton(wrapper).attributes('data-variant')).toBe('primary')
  })

  it('flags a truncated list of errors', async () => {
    // 300 lignes en erreur, 200 renvoyées par le serveur.
    const shown = Array.from({ length: 200 }, (unused, index) => ({
      line: index + 2,
      column: 'theme',
      code: 'csv_theme_not_found',
    }))

    importQuestionsServiceMock.mockResolvedValue({
      ok: true,
      dryRun: true,
      rows: 400,
      valid: 100,
      errors: shown,
    } satisfies QuestionImportResult)

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)

    expect(wrapper.find('[data-test="import-report-truncated"]').exists()).toBe(true)
  })

  it('offers the import, as the only primary button, after a clean check', async () => {
    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)

    expect(wrapper.find('[data-test="import-report-clean"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="import-report-invalid"]').exists()).toBe(false)
    expect(confirmButton(wrapper).exists()).toBe(true)
    expect(confirmButton(wrapper).attributes('data-variant')).toBe('primary')
    expect(checkButton(wrapper).attributes('data-variant')).toBe('default')
    expect(wrapper.findAll('[data-variant="primary"]')).toHaveLength(1)
  })

  it('does not offer the import when the file holds no valid question', async () => {
    importQuestionsServiceMock.mockResolvedValue({
      ok: true,
      dryRun: true,
      rows: 0,
      valid: 0,
      errors: [],
    })

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)

    expect(confirmButton(wrapper).exists()).toBe(false)
  })

  it('shows the check in progress and blocks a second click', async () => {
    const { promise, resolve: finish } = deferredResult()

    importQuestionsServiceMock.mockImplementationOnce(() => promise)

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkButton(wrapper).trigger('click')

    expect(checkButton(wrapper).text()).toBe('questionImport.actions.checking')
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    expect(checkButton(wrapper).attributes('aria-busy')).toBe('true')
    expect(wrapper.find('#import-file').attributes('disabled')).toBeDefined()

    finish(createDryRunResult())
    await flushPromises()

    expect(checkButton(wrapper).text()).toBe('questionImport.actions.check')
    expect(importQuestionsServiceMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['file_too_large'],
    ['csv_content_type_unsupported'],
    ['csv_encoding_invalid'],
    ['csv_header_invalid'],
    ['csv_too_many_rows'],
    ['forbidden'],
    ['api_unreachable'],
    ['server_error'],
  ])('shows the translated text of the server code %s, without any report', async (code) => {
    mockImportFailure(code)

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)

    expect(bannerText(wrapper)).toBe(`questionImport.errors.${code}`)
    expect(wrapper.find('[data-test="import-report-valid"]').exists()).toBe(false)
    expect(confirmButton(wrapper).exists()).toBe(false)
  })

  it('dismisses the error banner', async () => {
    mockImportFailure('server_error')

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)
    await wrapper.find('[data-test="base-banner-dismiss"]').trigger('click')

    expect(bannerText(wrapper)).toBe('')
  })

  it('drops the report when another file is chosen', async () => {
    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkFile(wrapper)
    await pickFile(wrapper, csv('autre.csv'))

    expect(wrapper.find('[data-test="import-report-valid"]').exists()).toBe(false)
    expect(confirmButton(wrapper).exists()).toBe(false)
    expect(checkButton(wrapper).attributes('data-variant')).toBe('primary')
  })

  it('locks the file field during the check, then unlocks it with the report', async () => {
    const { promise, resolve: finish } = deferredResult()

    importQuestionsServiceMock.mockImplementationOnce(() => promise)

    const wrapper = mountView()

    await pickFile(wrapper, csv())
    await checkButton(wrapper).trigger('click')

    expect(wrapper.find('#import-file').attributes('disabled')).toBeDefined()

    finish(createDryRunResult())
    await flushPromises()

    expect(wrapper.find('#import-file').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-test="import-report-valid"]').exists()).toBe(true)
  })
})

describe('views/questions/import/ImportQuestionsView.vue — import', () => {
  it('sends the same file for real and shows the result', async () => {
    const wrapper = await mountChecked()

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(importQuestionsServiceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ dryRun: false })
    )
    expect(importQuestionsServiceMock.mock.calls[1]?.[0].file).toBe(
      importQuestionsServiceMock.mock.calls[0]?.[0].file
    )
    expect(bannerText(wrapper)).toBe('questionImport.result.created')
    expect(wrapper.find('[data-test="base-banner-dismiss"]').exists()).toBe(false)
    expect(confirmButton(wrapper).exists()).toBe(false)
    expect(checkButton(wrapper).exists()).toBe(false)
    expect(wrapper.find('.import-list').attributes('data-variant')).toBe('primary')
  })

  it('shows the import in progress, keeping the report on screen', async () => {
    const wrapper = await mountChecked()
    const { promise, resolve: finish } = deferredResult()

    importQuestionsServiceMock.mockImplementationOnce(() => promise)
    await confirmButton(wrapper).trigger('click')

    expect(confirmButton(wrapper).text()).toBe('questionImport.actions.importing')
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="import-report-clean"]').exists()).toBe(true)

    finish({ ok: true, dryRun: false, created: 3 })
    await flushPromises()

    expect(bannerText(wrapper)).toBe('questionImport.result.created')
  })

  it('goes back to the questions list from the result', async () => {
    const wrapper = await mountChecked()

    await confirmButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.find('.import-list').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'questions' })
  })

  it('starts again from the result', async () => {
    const wrapper = await mountChecked()

    await confirmButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.find('.import-another').trigger('click')

    expect(bannerText(wrapper)).toBe('')
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="import-report-valid"]').exists()).toBe(false)
  })

  it('shows the server refusal and asks for a new check when the file changed meanwhile', async () => {
    const wrapper = await mountChecked()

    mockImportFailure('csv_invalid', rowErrors)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(bannerText(wrapper)).toBe('questionImport.errors.csv_invalid')
    expect(confirmButton(wrapper).exists()).toBe(false)
    expect(checkButton(wrapper).attributes('data-variant')).toBe('primary')
  })

  it.each([['file_too_large'], ['csv_content_type_unsupported'], ['server_error']])(
    'shows the translated text of the code %s when the import fails',
    async (code) => {
      const wrapper = await mountChecked()

      mockImportFailure(code)
      await confirmButton(wrapper).trigger('click')
      await flushPromises()

      expect(bannerText(wrapper)).toBe(`questionImport.errors.${code}`)
    }
  )
})

describe('views/questions/import/ImportQuestionsView.vue — scope', () => {
  it('lets an establishment admin import in their company only', () => {
    const wrapper = mountView()

    expect(wrapper.find('#import-scope').exists()).toBe(false)
    expect(loadCompaniesServiceMock).not.toHaveBeenCalled()
  })

  it('lets a superadmin import in the global scope by default', async () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountView()

    await flushPromises()
    await pickFile(wrapper, csv())
    await checkFile(wrapper)

    expect(wrapper.find('#import-scope').exists()).toBe(true)
    expect(wrapper.find('#import-company').exists()).toBe(false)
    expect(importQuestionsServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'global', companyId: null })
    )
  })

  it('asks a superadmin for the company before checking a company import', async () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountView()

    await flushPromises()
    await pickFile(wrapper, csv())
    await wrapper.find('#import-scope select').setValue('company')

    expect(loadCompaniesServiceMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('#import-company').exists()).toBe(true)
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.find('#import-company select').setValue('2')

    expect(checkButton(wrapper).attributes('disabled')).toBeUndefined()

    await checkFile(wrapper)

    expect(importQuestionsServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, scope: 'company', companyId: 2 })
    )
  })

  it('drops the report when the target changes', async () => {
    setAuthenticatedSuperadmin()

    const wrapper = mountView()

    await flushPromises()
    await pickFile(wrapper, csv())
    await checkFile(wrapper)
    await wrapper.find('#import-scope select').setValue('company')

    expect(wrapper.find('[data-test="import-report-valid"]').exists()).toBe(false)
    expect(confirmButton(wrapper).exists()).toBe(false)
  })

  it('keeps the company import blocked when the companies cannot be loaded', async () => {
    setAuthenticatedSuperadmin()
    mockLoadCompaniesFailure()

    const wrapper = mountView()

    await flushPromises()
    await pickFile(wrapper, csv())
    await wrapper.find('#import-scope select').setValue('company')

    expect(wrapper.find('#import-company option[value="1"]').exists()).toBe(false)
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('does not offer a deleted company', async () => {
    setAuthenticatedSuperadmin()
    mockLoadCompaniesSuccess([
      ...companiesFixture,
      { ...companiesFixture[0]!, id: 3, name: 'Gone', status: COMPANY_STATUS_DELETED },
    ])

    const wrapper = mountView()

    await flushPromises()
    await wrapper.find('#import-scope select').setValue('company')

    expect(wrapper.find('#import-company option[value="1"]').exists()).toBe(true)
    expect(wrapper.find('#import-company option[value="3"]').exists()).toBe(false)
  })
})
