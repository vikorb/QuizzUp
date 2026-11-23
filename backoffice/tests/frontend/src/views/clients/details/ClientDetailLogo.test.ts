import {
  deleteCompanyLogoServiceMock,
  LOGO_URL,
  uploadCompanyLogoServiceMock,
} from '@frontend-tests/_helpers/companyLogoServiceMock'
import { mountWithFrontendMocks } from '@frontend-tests/_helpers/mount'
import { resetFrontendMocksBeforeEach } from '@frontend-tests/_helpers/resetFrontendMocks'
import { COMPANY_LOGO_MAX_BYTES } from '@quizzup/shared'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ClientDetailLogo from '@/views/clients/details/ClientDetailLogo.vue'

resetFrontendMocksBeforeEach()

type Props = {
  companyId: number
  companyName: string
  logoUrl: string | null
  canManage: boolean
}

function mountLogo(overrides: Partial<Props> = {}) {
  return mountWithFrontendMocks(ClientDetailLogo, {
    props: {
      companyId: 7,
      companyName: 'Acme Corp',
      logoUrl: null,
      canManage: true,
      ...overrides,
    },
  })
}

type Wrapper = ReturnType<typeof mountLogo>

function chooseButton(wrapper: Wrapper) {
  return wrapper.find('.company-logo__button:not([data-variant="danger"])')
}

function removeButton(wrapper: Wrapper) {
  return wrapper.find('.company-logo__button[data-variant="danger"]')
}

function errorText(wrapper: Wrapper): string | null {
  const error = wrapper.find('[data-test="form-result-error"]')

  return error.exists() ? error.text() : null
}

async function pickFile(wrapper: Wrapper, file: File): Promise<void> {
  const input = wrapper.find('[data-test="company-logo-input"]')

  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

const png = new File(['png'], 'logo.png', { type: 'image/png' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

describe('views/clients/details/ClientDetailLogo.vue', () => {
  it('shows an empty preview and a choose button when the company has no logo', () => {
    const wrapper = mountLogo()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.company-logo__empty').text()).toBe('clients.details.form.logo.empty')
    expect(chooseButton(wrapper).text()).toBe('clients.details.form.logo.choose')
    expect(removeButton(wrapper).exists()).toBe(false)
    expect(errorText(wrapper)).toBeNull()
  })

  it('shows the logo from the API origin with replace and remove buttons', () => {
    const wrapper = mountLogo({ logoUrl: LOGO_URL })

    expect(wrapper.find('img').attributes('src')).toBe(`http://api.test${LOGO_URL}`)
    expect(wrapper.find('.company-logo__empty').exists()).toBe(false)
    expect(chooseButton(wrapper).text()).toBe('clients.details.form.logo.replace')
    expect(removeButton(wrapper).text()).toBe('clients.details.form.logo.remove')
  })

  it('falls back to the empty preview when the image cannot be loaded', async () => {
    const wrapper = mountLogo({ logoUrl: LOGO_URL })

    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.company-logo__empty').exists()).toBe(true)

    await wrapper.setProps({ logoUrl: LOGO_URL.replace('1111', '2222') })

    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('is read-only without the manage right: no button, disabled input, no help', () => {
    const wrapper = mountLogo({ logoUrl: LOGO_URL, canManage: false })

    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.find('.company-logo__button').exists()).toBe(false)
    expect(wrapper.find('[data-test="company-logo-input"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.company-logo__help').exists()).toBe(false)
  })

  it('accepts only the shared image types in the file picker', () => {
    const wrapper = mountLogo()

    expect(wrapper.find('[data-test="company-logo-input"]').attributes('accept')).toBe(
      'image/png,image/jpeg,image/webp'
    )
  })

  it('uploads the chosen file and tells the form the new logo URL', async () => {
    const wrapper = mountLogo()

    await pickFile(wrapper, png)

    expect(uploadCompanyLogoServiceMock).toHaveBeenCalledWith(7, png)
    expect(wrapper.emitted('changed')).toEqual([[LOGO_URL]])
    expect(errorText(wrapper)).toBeNull()
  })

  it('shows a loading state and blocks the buttons while uploading', async () => {
    const pending = deferred<{ ok: true; data: { logoUrl: string } }>()

    uploadCompanyLogoServiceMock.mockImplementation(() => pending.promise)

    const wrapper = mountLogo({ logoUrl: LOGO_URL })
    const picking = pickFile(wrapper, png)

    await wrapper.vm.$nextTick()

    expect(wrapper.find('section').attributes('aria-busy')).toBe('true')
    expect(chooseButton(wrapper).text()).toBe('clients.details.form.logo.uploading')
    expect(chooseButton(wrapper).attributes('disabled')).toBeDefined()
    expect(removeButton(wrapper).attributes('disabled')).toBeDefined()

    pending.resolve({ ok: true, data: { logoUrl: LOGO_URL } })
    await picking

    expect(wrapper.find('section').attributes('aria-busy')).toBe('false')
    expect(chooseButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('refuses a non-image file before calling the API', async () => {
    const wrapper = mountLogo()

    await pickFile(wrapper, new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))

    expect(uploadCompanyLogoServiceMock).not.toHaveBeenCalled()
    expect(errorText(wrapper)).toBe('clients.details.form.logo.errors.logo_type_invalid')
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('refuses a file over the size limit before calling the API', async () => {
    const wrapper = mountLogo()
    const big = new File([new Uint8Array(COMPANY_LOGO_MAX_BYTES + 1)], 'big.png', {
      type: 'image/png',
    })

    await pickFile(wrapper, big)

    expect(uploadCompanyLogoServiceMock).not.toHaveBeenCalled()
    expect(errorText(wrapper)).toBe('clients.details.form.logo.errors.logo_too_large')
  })

  it.each([
    'logo_type_invalid',
    'logo_too_large',
    'forbidden',
    'not_found',
    'unauthorized',
    'api_unreachable',
    'server_error',
  ] as const)('translates the API error code %s on upload', async (code) => {
    uploadCompanyLogoServiceMock.mockResolvedValue({ ok: false, error: code })

    const wrapper = mountLogo()

    await pickFile(wrapper, png)

    expect(errorText(wrapper)).toBe(`clients.details.form.logo.errors.${code}`)
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(chooseButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('clears the previous error when a new upload succeeds', async () => {
    uploadCompanyLogoServiceMock.mockResolvedValueOnce({ ok: false, error: 'server_error' })

    const wrapper = mountLogo()

    await pickFile(wrapper, png)
    expect(errorText(wrapper)).not.toBeNull()

    await pickFile(wrapper, png)

    expect(errorText(wrapper)).toBeNull()
    expect(wrapper.emitted('changed')).toEqual([[LOGO_URL]])
  })

  it('removes the logo and tells the form', async () => {
    const wrapper = mountLogo({ logoUrl: LOGO_URL })

    await removeButton(wrapper).trigger('click')
    await flushPromises()

    expect(deleteCompanyLogoServiceMock).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('changed')).toEqual([[null]])
  })

  it('keeps the logo and shows a translated error when the removal fails', async () => {
    deleteCompanyLogoServiceMock.mockResolvedValue({ ok: false, error: 'forbidden' })

    const wrapper = mountLogo({ logoUrl: LOGO_URL })

    await removeButton(wrapper).trigger('click')
    await flushPromises()

    expect(errorText(wrapper)).toBe('clients.details.form.logo.errors.forbidden')
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('shows a loading state while removing', async () => {
    const pending = deferred<{ ok: true; data: null }>()

    deleteCompanyLogoServiceMock.mockImplementation(() => pending.promise)

    const wrapper = mountLogo({ logoUrl: LOGO_URL })

    await removeButton(wrapper).trigger('click')

    expect(removeButton(wrapper).text()).toBe('clients.details.form.logo.removing')
    expect(removeButton(wrapper).attributes('disabled')).toBeDefined()
    expect(chooseButton(wrapper).attributes('disabled')).toBeDefined()

    pending.resolve({ ok: true, data: null })
    await flushPromises()

    expect(removeButton(wrapper).text()).toBe('clients.details.form.logo.remove')
  })

  it('ignores a file chosen without the manage right', async () => {
    const wrapper = mountLogo({ canManage: false })

    await pickFile(wrapper, png)

    expect(uploadCompanyLogoServiceMock).not.toHaveBeenCalled()
  })
})
