import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { voucherMessages } from '@/public/voucher/messages'
import VoucherPage from '@/public/voucher/VoucherPage.vue'

const fr = voucherMessages.fr
const en = voucherMessages.en
const CODE = 'ABCD-1234'
const OTHER_CODE = 'WXYZ-5678'

const VOUCHER = {
  label: 'Une boisson offerte',
  companyName: 'Escape Néon',
  logoUrl: null,
  expiresAt: '2027-03-10T10:00:00.000Z',
  state: 'valid',
}

const fetchMock = vi.fn()
let wrapper: VueWrapper | undefined

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

// `replaceState` change le fragment sans déclencher `hashchange` : seuls les tests qui simulent un
// second scan envoient l'événement, à la main.
const setHash = (hash: string) =>
  window.history.replaceState(null, '', `#${hash.replace(/^#/, '')}`)

async function openPage(hash = `#${CODE}`) {
  setHash(hash)
  wrapper = mount(VoucherPage, { attachTo: document.body })
  await flushPromises()

  return wrapper
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body)

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => reply(200, VOUCHER))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'fr'])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  setHash('')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('public/voucher/VoucherPage — states', () => {
  it('shows a valid voucher: label, centre, code and end of validity', async () => {
    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.validTitle)
    expect(page.text()).toContain('Une boisson offerte')
    expect(page.text()).toContain('Escape Néon')
    expect(page.text()).toContain(CODE)
    expect(page.text()).toContain('10 mars 2027')
    expect(page.text()).toContain(fr.validText)
    expect(document.documentElement.lang).toBe('fr')
    expect(document.title).toBe(fr.pageTitle)
    expect(document.activeElement?.id).toBe('state-title')
  })

  it('shows the loading state until the server answers', async () => {
    let resolve!: (response: Response) => void

    fetchMock.mockImplementation(() => new Promise<Response>((done) => (resolve = done)))
    setHash(CODE)
    wrapper = mount(VoucherPage, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('[role="status"]').text()).toBe(fr.loading)

    resolve(reply(200, VOUCHER))
    await flushPromises()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(fr.validTitle)
  })

  it('shows a used voucher without its code', async () => {
    fetchMock.mockImplementation(async () => reply(200, { ...VOUCHER, state: 'redeemed' }))

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.redeemedTitle)
    expect(page.text()).not.toContain(CODE)
  })

  it('shows an expired voucher with its end date', async () => {
    fetchMock.mockImplementation(async () => reply(200, { ...VOUCHER, state: 'expired' }))

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.expiredTitle)
    expect(page.text()).toContain('10 mars 2027')
    expect(page.text()).not.toContain(CODE)
  })

  it('shows a cancelled voucher', async () => {
    fetchMock.mockImplementation(async () => reply(200, { ...VOUCHER, state: 'cancelled' }))

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.cancelledTitle)
    expect(page.text()).not.toContain(CODE)
  })

  it('shows "not found" when the server does not know the code', async () => {
    fetchMock.mockImplementation(async () => reply(404, { error: 'voucher_not_found' }))

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.notFoundTitle)
    expect(page.find('button').exists()).toBe(false)
    expect(document.activeElement?.id).toBe('state-title')
  })

  it.each(['', '#!!nope', '#ABCD'])(
    'shows "not found" without any request when the fragment is %j',
    async (hash) => {
      const page = await openPage(hash)

      expect(page.get('h2').text()).toBe(fr.notFoundTitle)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('offers a retry on a network error, and reads the voucher on the second try', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.lookupFailedTitle)

    await page.get('button').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(page.get('h2').text()).toBe(fr.validTitle)
  })

  it('shows the wait time when the server limits the requests', async () => {
    fetchMock.mockImplementation(async () =>
      reply(429, { error: 'too_many_requests' }, { 'Retry-After': '30' })
    )

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.tooManyTitle)
    expect(page.text()).toContain('30 secondes')
    expect(page.get('button').text()).toBe(fr.retry)
  })

  it('shows the connection screen on a server error', async () => {
    fetchMock.mockImplementation(async () => reply(500, { error: 'server_error' }))

    const page = await openPage()

    expect(page.get('h2').text()).toBe(fr.lookupFailedTitle)
  })

  it('speaks English when the browser does', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB'])

    const page = await openPage()

    expect(page.get('h2').text()).toBe(en.validTitle)
    expect(page.text()).toContain('March 10, 2027')
    expect(document.documentElement.lang).toBe('en')
  })

  it('shows the centre logo from the API, as a decorative image', async () => {
    fetchMock.mockImplementation(async () =>
      reply(200, { ...VOUCHER, logoUrl: '/public/v1/logos/x.png' })
    )

    const page = await openPage()

    expect(page.get('img').attributes('src')).toBe('http://api.test/public/v1/logos/x.png')
    expect(page.get('img').attributes('alt')).toBe('')
  })
})

describe('public/voucher/VoucherPage — the code stays out of the address', () => {
  it('sends the normalised code in the body only, to the one public route', async () => {
    await openPage('#abcd-1234')

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const call = fetchMock.mock.calls[0]!

    expect(call[0]).toBe('http://api.test/public/v1/vouchers/lookup')
    expect(String(call[0])).not.toMatch(/abcd|1234|\?/i)
    expect(bodyOf(call)).toEqual({ code: CODE })
  })

  it('never puts the code in the page path, query or title', async () => {
    await openPage()

    expect(window.location.pathname + window.location.search).not.toContain(CODE)
    expect(document.title).not.toContain(CODE)
  })

  it('reads another voucher when a second QR code only changes the fragment', async () => {
    const page = await openPage()

    fetchMock.mockImplementation(async () => reply(200, { ...VOUCHER, label: 'Autre bon' }))
    setHash(OTHER_CODE)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await flushPromises()

    expect(bodyOf(fetchMock.mock.calls[1]!)).toEqual({ code: OTHER_CODE })
    expect(page.text()).toContain('Autre bon')
    expect(page.text()).toContain(OTHER_CODE)
    expect(page.text()).not.toContain(CODE)
  })

  it('ignores a late answer about the previous fragment', async () => {
    const resolvers: ((response: Response) => void)[] = []

    fetchMock.mockImplementation(() => new Promise<Response>((done) => resolvers.push(done)))
    setHash(CODE)
    wrapper = mount(VoucherPage, { attachTo: document.body })
    await flushPromises()

    setHash(OTHER_CODE)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await flushPromises()

    resolvers[1]!(reply(200, { ...VOUCHER, label: 'Second' }))
    await flushPromises()
    resolvers[0]!(reply(200, { ...VOUCHER, label: 'Premier' }))
    await flushPromises()

    expect(wrapper.text()).toContain('Second')
    expect(wrapper.text()).not.toContain('Premier')
  })
})
