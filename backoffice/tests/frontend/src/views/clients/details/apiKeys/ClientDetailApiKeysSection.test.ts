import {
  API_KEY_SECRET_FIXTURE,
  createApiKeyFixture,
  createApiKeyServiceMock,
  createDeferred,
  createRevokedApiKeyFixture,
  listApiKeysServiceMock,
  listApiLogsServiceMock,
  mockApiKeyFailure,
  revokeApiKeyServiceMock,
} from '@frontend-tests/_helpers/apiKeysServiceMock'
import { confirmMock, setConfirmResult } from '@frontend-tests/_helpers/confirmMock'
import { mountWithFrontendMocks, tWithParamsMock } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { pushMock } from '@frontend-tests/_helpers/routerMock'
import { API_KEY_NAME_MAX_LENGTH } from '@quizzup/shared'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import type { ApiKeyApiResult, ApiKeysResponse, CreateApiKeyResponse } from '@/types/apiKey'
import ClientDetailApiKeysSection from '@/views/clients/details/apiKeys/ClientDetailApiKeysSection.vue'

resetFrontendMocksBeforeEach()

type SectionVm = { secret: string | null }

const writeTextMock = vi.fn(async (_text: string) => undefined)

async function mountSection(canShow = true): Promise<VueWrapper> {
  const wrapper = mountWithFrontendMocks(ClientDetailApiKeysSection, {
    props: { companyId: 7, canShowApiKeysSection: canShow },
  })

  await flushPromises()

  return wrapper
}

function card(wrapper: VueWrapper) {
  return wrapper.get('[data-test="api-keys-card"]')
}

async function openForm(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-test="api-key-create"]').trigger('click')
}

async function submitName(wrapper: VueWrapper, name: string): Promise<void> {
  await openForm(wrapper)
  await wrapper.get('[data-test="api-key-form"] input').setValue(name)
  await wrapper.get('[data-test="api-key-form"]').trigger('submit')
  await flushPromises()
}

async function createKey(wrapper: VueWrapper, name = 'Site de réservation'): Promise<void> {
  await submitName(wrapper, name)
}

const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
  vi.spyOn(console, method).mockImplementation(() => undefined)
)

beforeEach(() => {
  for (const spy of consoleSpies) {
    spy.mockClear()
  }

  writeTextMock.mockClear()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  })
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('views/clients/details/apiKeys/ClientDetailApiKeysSection.vue', () => {
  describe('display and permissions', () => {
    it('shows nothing and asks nothing when the role may not manage the keys', async () => {
      const wrapper = await mountSection(false)

      expect(wrapper.find('#api-keys').exists()).toBe(false)
      expect(listApiKeysServiceMock).not.toHaveBeenCalled()
      expect(listApiLogsServiceMock).not.toHaveBeenCalled()
    })

    it('reads the keys and the log of the company', async () => {
      await mountSection()

      expect(listApiKeysServiceMock).toHaveBeenCalledWith(7)
      expect(listApiLogsServiceMock).toHaveBeenCalledWith(7, expect.any(Object))
    })

    it('shows the loading state, then the empty state', async () => {
      const pending = createDeferred<ApiKeyApiResult<ApiKeysResponse>>()
      listApiKeysServiceMock.mockImplementationOnce(() => pending.promise)
      const wrapper = mountWithFrontendMocks(ClientDetailApiKeysSection, {
        props: { companyId: 7, canShowApiKeysSection: true },
      })

      await nextTick()

      expect(card(wrapper).attributes('data-loading')).toBe('true')

      pending.resolve({ ok: true, status: 200, data: { apiKeys: [] } })
      await flushPromises()

      expect(card(wrapper).attributes('data-loading')).toBe('false')

      expect(card(wrapper).attributes('data-empty')).toBe('true')
    })

    it('shows the error state with a retry that reads the keys again', async () => {
      mockApiKeyFailure(listApiKeysServiceMock, 'server_error', 500)
      const wrapper = await mountSection()

      expect(wrapper.get('[data-test="api-keys-error"]').text()).toBe('apiKeys.errors.serverError')
      expect(wrapper.find('[data-test="api-key-create"]').exists()).toBe(false)

      listApiKeysServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { apiKeys: [createApiKeyFixture()] },
      })
      await card(wrapper).get('[data-test="base-card-actions"] button').trigger('click')
      await flushPromises()

      expect(listApiKeysServiceMock).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[data-test="api-keys-error"]').exists()).toBe(false)
      expect(wrapper.findAll('[data-test="base-table-row"]').length).toBeGreaterThan(0)
    })

    it('lists the keys with their prefix, status and a revoke button for the active ones only', async () => {
      listApiKeysServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          apiKeys: [
            createApiKeyFixture({ id: 2, name: 'Site A', lastUsedAt: '2026-11-05T10:00:00.000Z' }),
            createRevokedApiKeyFixture({ id: 1, name: 'Ancien site', keyPrefix: 'qzk_aaaaaaaa' }),
          ],
        },
      })
      const wrapper = await mountSection()
      const rows = card(wrapper).findAll('[data-test="base-table-row"]')

      expect(rows).toHaveLength(2)
      expect(rows[0]!.text()).toContain('Site A')
      expect(rows[0]!.text()).toContain('qzk_3f9a1c07')
      expect(rows[0]!.text()).toContain('apiKeys.status.active')
      expect(rows[0]!.find('[data-test="api-key-revoke"]').exists()).toBe(true)
      expect(rows[1]!.text()).toContain('apiKeys.status.revoked')
      expect(rows[1]!.find('[data-test="api-key-revoke"]').exists()).toBe(false)
      expect(rows[0]!.get('[data-test="base-table-cell-lastUsedAt"]').text()).not.toContain(
        'apiKeys.neverUsed'
      )
      expect(rows[1]!.get('[data-test="base-table-cell-lastUsedAt"]').text()).toContain(
        'apiKeys.neverUsed'
      )
    })

    // Le bouton principal de la fiche est « Enregistrer » (ClientDetailForm) : le bloc n'en ajoute pas.
    it('has no primary button, with the form closed and with the secret shown', async () => {
      const wrapper = await mountSection()

      expect(wrapper.get('[data-test="api-key-create"]').attributes('data-variant')).toBe('default')
      expect(wrapper.findAll('[data-variant="primary"]')).toHaveLength(0)

      await createKey(wrapper)

      expect(wrapper.find('[data-test="api-key-secret-panel"]').exists()).toBe(true)
      expect(wrapper.findAll('[data-variant="primary"]')).toHaveLength(0)
    })

    it('names the key on each revoke button', async () => {
      listApiKeysServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { apiKeys: [createApiKeyFixture({ name: 'Site A' })] },
      })
      const wrapper = mountWithFrontendMocks(ClientDetailApiKeysSection, {
        props: { companyId: 7, canShowApiKeysSection: true },
        global: { mocks: { $t: tWithParamsMock } },
      })

      await flushPromises()

      expect(wrapper.get('[data-test="api-key-revoke"]').attributes('aria-label')).toBe(
        'apiKeys.revoke.ariaLabel:{"name":"Site A"}'
      )
    })
  })

  describe('creation', () => {
    it('opens a form, and the cancel closes it without asking the server', async () => {
      const wrapper = await mountSection()

      await openForm(wrapper)

      expect(wrapper.find('[data-test="api-key-form"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="api-key-create"]').exists()).toBe(false)

      await wrapper.get('[data-test="form-actions-cancel"]').trigger('click')

      expect(wrapper.find('[data-test="api-key-form"]').exists()).toBe(false)
      expect(createApiKeyServiceMock).not.toHaveBeenCalled()
    })

    it('creates the key with the trimmed name and lists it first', async () => {
      listApiKeysServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { apiKeys: [createApiKeyFixture({ id: 1, name: 'Ancien' })] },
      })
      const wrapper = await mountSection()

      await submitName(wrapper, '  Site web  ')

      expect(createApiKeyServiceMock).toHaveBeenCalledWith(7, 'Site web')

      const rows = card(wrapper).findAll('[data-test="base-table-row"]')

      expect(rows).toHaveLength(2)
      expect(rows[0]!.text()).toContain('Site web')
      expect(wrapper.find('[data-test="api-key-form"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="base-banner"]').text()).toContain('apiKeys.create.done')
    })

    it('refuses an empty name and a name that is too long, without asking the server', async () => {
      const wrapper = await mountSection()

      await submitName(wrapper, '   ')

      expect(wrapper.get('[data-test="form-field-error"]').text()).toBe(
        'apiKeys.create.nameRequired'
      )

      await wrapper
        .get('[data-test="api-key-form"] input')
        .setValue('x'.repeat(API_KEY_NAME_MAX_LENGTH + 1))
      await wrapper.get('[data-test="api-key-form"]').trigger('submit')
      await flushPromises()

      expect(wrapper.get('[data-test="form-field-error"]').text()).toBe(
        'apiKeys.create.nameTooLong'
      )
      expect(createApiKeyServiceMock).not.toHaveBeenCalled()
    })

    it.each([
      ['api_key_limit_reached', 'apiKeys.errors.apiKeyLimitReached'],
      ['company_inactive', 'apiKeys.errors.companyInactive'],
      ['company_deleted', 'apiKeys.errors.companyDeleted'],
      ['forbidden', 'apiKeys.errors.forbidden'],
    ])('shows the translated error %s and keeps the form, with no secret', async (code, key) => {
      mockApiKeyFailure(createApiKeyServiceMock, code)
      const wrapper = await mountSection()

      await createKey(wrapper)

      expect(wrapper.get('[data-test="base-banner"]').text()).toContain(key)
      expect(wrapper.get('[data-test="base-banner"]').text().replace(key, '')).not.toContain(code)
      expect(wrapper.find('[data-test="api-key-form"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="api-key-secret-panel"]').exists()).toBe(false)
      expect((wrapper.vm as unknown as SectionVm).secret).toBeNull()
    })
  })

  describe('secret of a new key', () => {
    it('shows the secret once, with the warning, after the creation', async () => {
      const wrapper = await mountSection()

      await createKey(wrapper)

      expect(wrapper.get('[data-test="api-key-secret"]').text()).toBe(API_KEY_SECRET_FIXTURE)
      expect(wrapper.get('[data-test="api-key-secret-panel"]').text()).toContain(
        'apiKeys.secret.warning'
      )
    })

    it('copies the secret to the clipboard and says so', async () => {
      const wrapper = await mountSection()

      await createKey(wrapper)
      await wrapper.get('[data-test="api-key-copy"]').trigger('click')
      await flushPromises()

      expect(writeTextMock).toHaveBeenCalledWith(API_KEY_SECRET_FIXTURE)
      expect(wrapper.get('[data-test="api-key-copy"]').text()).toBe('apiKeys.secret.copied')
      expect(wrapper.find('[data-test="api-key-copy-failed"]').exists()).toBe(false)
    })

    it('keeps the secret on screen and says the copy failed when the clipboard refuses', async () => {
      writeTextMock.mockRejectedValueOnce(new Error('denied'))
      const wrapper = await mountSection()

      await createKey(wrapper)
      await wrapper.get('[data-test="api-key-copy"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="api-key-copy-failed"]').text()).toBe(
        'apiKeys.secret.copyFailed'
      )
      expect(wrapper.get('[data-test="api-key-secret"]').text()).toBe(API_KEY_SECRET_FIXTURE)
    })

    it('says the copy failed when the page has no clipboard at all', async () => {
      Reflect.deleteProperty(navigator, 'clipboard')
      const wrapper = await mountSection()

      await createKey(wrapper)
      await wrapper.get('[data-test="api-key-copy"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-test="api-key-copy-failed"]').exists()).toBe(true)
    })

    it('erases the secret from the state and the page when the panel is closed', async () => {
      const wrapper = await mountSection()

      await createKey(wrapper)

      expect((wrapper.vm as unknown as SectionVm).secret).toBe(API_KEY_SECRET_FIXTURE)

      await wrapper.get('[data-test="api-key-secret-close"]').trigger('click')

      expect((wrapper.vm as unknown as SectionVm).secret).toBeNull()
      expect(wrapper.find('[data-test="api-key-secret-panel"]').exists()).toBe(false)
      expect(wrapper.html()).not.toContain(API_KEY_SECRET_FIXTURE)
    })

    it('erases the secret when the section is left or the company changes', async () => {
      const wrapper = await mountSection()

      await createKey(wrapper)
      await wrapper.setProps({ companyId: 8 })
      await flushPromises()

      expect((wrapper.vm as unknown as SectionVm).secret).toBeNull()
      expect(wrapper.html()).not.toContain(API_KEY_SECRET_FIXTURE)

      await createKey(wrapper)

      const vm = wrapper.vm as unknown as SectionVm

      expect(vm.secret).toBe(API_KEY_SECRET_FIXTURE)

      wrapper.unmount()

      expect(vm.secret).toBeNull()
    })

    it('does not bring the secret back when the answer arrives after the company changed', async () => {
      const pending = createDeferred<ApiKeyApiResult<CreateApiKeyResponse>>()
      createApiKeyServiceMock.mockImplementationOnce(() => pending.promise)
      const wrapper = await mountSection()

      await openForm(wrapper)
      await wrapper.get('[data-test="api-key-form"] input').setValue('Site')
      await wrapper.get('[data-test="api-key-form"]').trigger('submit')
      await wrapper.setProps({ companyId: 8 })
      await flushPromises()

      pending.resolve({
        ok: true,
        status: 201,
        data: { apiKey: createApiKeyFixture({ id: 9 }), secret: API_KEY_SECRET_FIXTURE },
      })
      await flushPromises()

      expect((wrapper.vm as unknown as SectionVm).secret).toBeNull()
      expect(wrapper.html()).not.toContain(API_KEY_SECRET_FIXTURE)
      expect(wrapper.find('[data-test="base-table-row"]').exists()).toBe(false)
    })

    it('erases the secret when the role loses the right to see the section', async () => {
      const wrapper = await mountSection()

      await createKey(wrapper)
      await wrapper.setProps({ canShowApiKeysSection: false })

      expect((wrapper.vm as unknown as SectionVm).secret).toBeNull()
      expect(wrapper.html()).not.toContain(API_KEY_SECRET_FIXTURE)
    })

    it('never writes the secret to the storage, the console, the address or the router', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      const locationBefore = window.location.href
      const wrapper = await mountSection()

      await createKey(wrapper)
      await wrapper.get('[data-test="api-key-copy"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-test="api-key-secret-close"]').trigger('click')

      expect(setItem.mock.calls.flat().join(' ')).not.toContain(API_KEY_SECRET_FIXTURE)
      expect(window.location.href).toBe(locationBefore)
      expect(JSON.stringify(pushMock.mock.calls)).not.toContain(API_KEY_SECRET_FIXTURE)

      for (const spy of consoleSpies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(API_KEY_SECRET_FIXTURE)
      }

      // Aucun appel au serveur ne repart avec le secret, ni la liste ni le journal.
      for (const mock of [
        listApiKeysServiceMock,
        listApiLogsServiceMock,
        revokeApiKeyServiceMock,
      ]) {
        expect(JSON.stringify(mock.mock.calls)).not.toContain(API_KEY_SECRET_FIXTURE)
      }

      setItem.mockRestore()
    })

    it('keeps the secret out of the banner and out of the table', async () => {
      const wrapper = await mountSection()

      await createKey(wrapper)

      expect(wrapper.get('[data-test="base-banner"]').text()).not.toContain(API_KEY_SECRET_FIXTURE)
      expect(card(wrapper).get('[data-test="api-keys-table"]').text()).not.toContain(
        API_KEY_SECRET_FIXTURE
      )
    })
  })

  describe('revocation', () => {
    beforeEach(() => {
      listApiKeysServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { apiKeys: [createApiKeyFixture({ id: 5, name: 'Site A' })] },
      })
    })

    it('asks for a confirmation, then revokes the key and shows it revoked', async () => {
      const wrapper = await mountSection()

      await wrapper.get('[data-test="api-key-revoke"]').trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }))
      expect(revokeApiKeyServiceMock).toHaveBeenCalledWith(7, 5)
      expect(wrapper.get('[data-test="api-key-status"]').text()).toContain('apiKeys.status.revoked')
      expect(wrapper.find('[data-test="api-key-revoke"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="base-banner"]').text()).toContain('apiKeys.revoke.done')
    })

    it('does nothing when the confirmation is refused', async () => {
      setConfirmResult(false)
      const wrapper = await mountSection()

      await wrapper.get('[data-test="api-key-revoke"]').trigger('click')
      await flushPromises()

      expect(confirmMock).toHaveBeenCalledTimes(1)
      expect(revokeApiKeyServiceMock).not.toHaveBeenCalled()
      expect(wrapper.get('[data-test="api-key-status"]').text()).toContain('apiKeys.status.active')
      expect(wrapper.find('[data-test="api-key-revoke"]').exists()).toBe(true)
    })

    it('shows the translated error when the revocation is refused, and keeps the key active', async () => {
      mockApiKeyFailure(revokeApiKeyServiceMock, 'forbidden', 403)
      const wrapper = await mountSection()

      await wrapper.get('[data-test="api-key-revoke"]').trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-test="base-banner"]').text()).toContain('apiKeys.errors.forbidden')
      expect(wrapper.get('[data-test="api-key-status"]').text()).toContain('apiKeys.status.active')
      expect(listApiKeysServiceMock).toHaveBeenCalledTimes(1)
    })

    it('reads the keys again when the key is not found, as it changed in another tab', async () => {
      mockApiKeyFailure(revokeApiKeyServiceMock, 'not_found', 404)
      const wrapper = await mountSection()

      listApiKeysServiceMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { apiKeys: [createRevokedApiKeyFixture({ id: 5, name: 'Site A' })] },
      })
      await wrapper.get('[data-test="api-key-revoke"]').trigger('click')
      await flushPromises()

      expect(listApiKeysServiceMock).toHaveBeenCalledTimes(2)
      expect(wrapper.get('[data-test="api-key-status"]').text()).toContain('apiKeys.status.revoked')
      expect(wrapper.get('[data-test="base-banner"]').text()).toContain('apiKeys.errors.notFound')
    })
  })
})
