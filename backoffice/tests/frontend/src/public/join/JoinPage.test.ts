import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import JoinPage from '@/public/join/JoinPage.vue'
import { joinMessages, NOTICE_PARAMS } from '@/public/join/messages'

const fr = joinMessages.fr
const TOKEN = 'a'.repeat(43)
const OTHER_TOKEN = 'b'.repeat(43)

const LINK = {
  companyName: 'Escape Néon',
  roomName: 'Salle 1',
  logoUrl: null,
  expiresAt: '2027-03-10T10:00:00.000Z',
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

async function openPage(hash: string | null = `#${TOKEN}`) {
  setHash(hash ?? '')
  wrapper = mount(JoinPage, { attachTo: document.body })
  await flushPromises()

  return wrapper
}

function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })

  return { promise, resolve }
}

const calls = (suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix))

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body)

async function typeInto(selector: string, value: string) {
  await wrapper!.get(selector).setValue(value)
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('/lookup') ? reply(200, LINK) : reply(201, { ok: true })
  )
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

async function submitWith(response: Response | Error) {
  const page = await openPage()

  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/lookup')) return reply(200, LINK)
    if (response instanceof Error) throw response

    return response
  })

  await typeInto('#name-0', 'Camille')
  await page.get('form').trigger('submit')
  await flushPromises()

  return page
}

// Un second QR code scanné dans le même onglet ne change que le fragment.
async function switchTo(hash: string) {
  setHash(hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  await flushPromises()
}

async function fillTwoPlayersThenRefuse(fieldErrors: Record<string, string[]> | undefined) {
  const page = await openPage()

  await typeInto('#name-0', 'Camille')
  await typeInto('#email-0', 'camille@example.test')
  await page.get('#consent-0').setValue(true)
  await page.get('#age-0').setValue(true)
  await page
    .findAll('button')
    .find((button) => button.text() === fr.addSecond)!
    .trigger('click')
  await typeInto('#name-1', 'Léa')

  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('/lookup')
      ? reply(200, LINK)
      : reply(400, { error: 'invalid_body', details: fieldErrors ? { fieldErrors } : {} })
  )
  await page.get('form').trigger('submit')
  await flushPromises()

  return page
}

describe('public/join/JoinPage — opening the link', () => {
  it('asks the server about the token of the fragment, then shows the form for that centre', async () => {
    const page = await openPage()

    expect(calls('/lookup')).toHaveLength(1)
    expect(bodyOf(calls('/lookup')[0]!)).toEqual({ token: TOKEN })
    expect(page.text()).toContain('Escape Néon · Salle 1')
    expect(page.find('form').exists()).toBe(true)
    expect(document.documentElement.lang).toBe('fr')
    expect(document.title).toBe(fr.pageTitle)
  })

  it('shows the loading state until the server answers', async () => {
    const pending = deferred()
    fetchMock.mockImplementation(() => pending.promise)

    setHash(TOKEN)
    wrapper = mount(JoinPage, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain(fr.loading)
    expect(wrapper.find('form').exists()).toBe(false)

    pending.resolve(reply(200, LINK))
    await flushPromises()

    expect(wrapper.find('form').exists()).toBe(true)
  })

  it('speaks English when the browser does', async () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB'])

    const page = await openPage()

    expect(page.text()).toContain(joinMessages.en.intro)
    expect(document.documentElement.lang).toBe('en')
  })

  it('shows "invalid link" without calling the server when the address has no token', async () => {
    const page = await openPage('')

    expect(page.text()).toContain(fr.invalidTitle)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an address with no token', null, fr.invalidTitle],
    ['an unknown token', reply(404, { error: 'join_link_invalid' }), fr.invalidTitle],
    ['a closed link', reply(410, { error: 'join_link_closed' }), fr.closedTitle],
    ['a failed connection', reply(500, { error: 'server_error' }), fr.lookupFailedTitle],
  ])(
    'moves the focus to the title of the screen for %s, so it is read aloud',
    async (_label, answer, title) => {
      if (answer) fetchMock.mockResolvedValue(answer)

      const page = await openPage(answer ? `#${TOKEN}` : '')
      const heading = page.get('#state-title')

      expect(heading.text()).toBe(title)
      expect(heading.element.tagName).toBe('H2')
      expect(document.activeElement).toBe(heading.element)
    }
  )

  it('moves the focus to the title when the link is closed while the form is being sent', async () => {
    const page = await submitWith(reply(410, { error: 'join_link_closed' }))

    expect(document.activeElement).toBe(page.get('#state-title').element)
    expect(page.get('#state-title').text()).toBe(fr.closedTitle)
  })

  it('shows "invalid link" for an unknown token', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: 'join_link_invalid' }))

    const page = await openPage()

    expect(page.text()).toContain(fr.invalidTitle)
    expect(page.find('form').exists()).toBe(false)
  })

  it('shows "registration closed" for a link that is closed or expired', async () => {
    fetchMock.mockResolvedValue(reply(410, { error: 'join_link_closed' }))

    const page = await openPage()

    expect(page.text()).toContain(fr.closedTitle)
    expect(page.find('form').exists()).toBe(false)
  })

  it('offers a retry after a network failure, then shows the form', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const page = await openPage()

    expect(page.text()).toContain(fr.lookupFailedTitle)

    await page.get('button').trigger('click')
    await flushPromises()

    expect(calls('/lookup')).toHaveLength(2)
    expect(page.find('form').exists()).toBe(true)
  })
})

describe('public/join/JoinPage — the form', () => {
  it('gives every field a label and every checkbox its own label', async () => {
    const page = await openPage()

    await typeInto('#email-0', 'camille@example.test')

    const controls = page.findAll('input')

    expect(controls).toHaveLength(5)

    for (const control of controls) {
      const label = page.find(`label[for="${control.attributes('id')}"]`)

      expect(label.exists(), control.attributes('id')).toBe(true)
    }
    expect(page.get('#name-0').attributes('maxlength')).toBe('30')
    expect(page.get('#email-0').attributes('type')).toBe('email')
  })

  it('shows the consent boxes, unticked, only once an e-mail is typed', async () => {
    const page = await openPage()

    expect(page.findAll('input[type="checkbox"]')).toHaveLength(0)

    await typeInto('#email-0', 'camille@example.test')

    const boxes = page.findAll('input[type="checkbox"]')

    expect(boxes).toHaveLength(3)
    expect(boxes.map((box) => (box.element as HTMLInputElement).checked)).toEqual([
      false,
      false,
      false,
    ])
  })

  it('refuses an empty name, announces the error and does not call the server', async () => {
    const page = await openPage()

    await page.get('form').trigger('submit')
    await flushPromises()

    const error = page.get('#name-error-0')

    expect(error.text()).toBe(fr.errorNameRequired)
    expect(error.attributes('role')).toBe('alert')
    expect(page.get('#name-0').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(page.get('#name-0').element)
    expect(calls('/registrations')).toHaveLength(0)
  })

  it.each([
    ['a zero-width space only', '\u200B'],
    ['a right-to-left override', '\u202Eabc'],
    ['a control character', '\u0000x'],
  ])('refuses a name with %s, like the server does', async (_label, name) => {
    const page = await openPage()

    await typeInto('#name-0', name)
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(page.get('#name-error-0').text()).toBe(fr.errorNameInvalid)
    expect(document.activeElement).toBe(page.get('#name-0').element)
    expect(calls('/registrations')).toHaveLength(0)
  })

  it('refuses an e-mail without the consent and the age boxes', async () => {
    const page = await openPage()

    await typeInto('#name-0', 'Camille')
    await typeInto('#email-0', 'camille@example.test')
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(page.get('#consent-error-0').text()).toBe(fr.errorEmailConsent)
    expect(page.get('#age-error-0').text()).toBe(fr.errorAge)
    expect(document.activeElement).toBe(page.get('#consent-0').element)
    expect(calls('/registrations')).toHaveLength(0)
  })

  it('refuses a badly written e-mail', async () => {
    const page = await openPage()

    await typeInto('#name-0', 'Camille')
    await typeInto('#email-0', 'pas-un-email')
    await page.get('#consent-0').setValue(true)
    await page.get('#age-0').setValue(true)
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(page.get('#email-error-0').text()).toBe(fr.errorEmailInvalid)
    expect(calls('/registrations')).toHaveLength(0)
  })

  it('sends only the first name when there is no e-mail, and shows the success', async () => {
    const page = await openPage()

    await typeInto('#name-0', '  Camille  ')
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(calls('/registrations')).toHaveLength(1)
    expect(bodyOf(calls('/registrations')[0]!)).toEqual({ token: TOKEN, displayName: 'Camille' })
    expect(page.text()).toContain(fr.successTitle)
    expect(page.text()).toContain(fr.successText)
    expect(page.find('form').exists()).toBe(false)
  })

  it('sends the e-mail with its three answers, and the second player on his own', async () => {
    const page = await openPage()

    await typeInto('#name-0', 'Camille')
    await typeInto('#email-0', 'camille@example.test')
    await page.get('#consent-0').setValue(true)
    await page.get('#marketing-0').setValue(true)
    await page.get('#age-0').setValue(true)

    const toggle = page.findAll('button').find((button) => button.text() === fr.addSecond)!

    await toggle.trigger('click')
    await typeInto('#name-1', 'Léa')
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(bodyOf(calls('/registrations')[0]!)).toEqual({
      token: TOKEN,
      displayName: 'Camille',
      email: 'camille@example.test',
      emailConsent: true,
      marketingConsent: true,
      ageConfirmed: true,
      secondPlayer: { displayName: 'Léa' },
    })
  })

  it('opens and closes the block of the second player', async () => {
    const page = await openPage()
    const button = () =>
      page
        .findAll('button')
        .find((candidate) => [fr.addSecond, fr.removeSecond].includes(candidate.text()))!

    await button().trigger('click')

    expect(page.findAll('fieldset')).toHaveLength(2)
    expect(page.text()).toContain('Joueur 2')
    expect(button().text()).toBe(fr.removeSecond)

    await button().trigger('click')

    expect(page.findAll('fieldset')).toHaveLength(1)
  })

  it('never puts the token, a name or an e-mail in an address', async () => {
    const page = await openPage()

    await typeInto('#name-0', 'Camille')
    await typeInto('#email-0', 'camille@example.test')
    await page.get('#consent-0').setValue(true)
    await page.get('#age-0').setValue(true)
    await page.get('form').trigger('submit')
    await flushPromises()

    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toMatch(new RegExp(`${TOKEN}|Camille|camille|@`))
    }
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe(`#${TOKEN}`)
  })

  it('lets the same phone sign up another desk', async () => {
    const page = await openPage()

    await typeInto('#name-0', 'Camille')
    await page.get('form').trigger('submit')
    await flushPromises()
    await page
      .findAll('button')
      .find((button) => button.text() === fr.another)!
      .trigger('click')

    expect(page.find('form').exists()).toBe(true)
    expect((page.get('#name-0').element as HTMLInputElement).value).toBe('')
    expect(page.findAll('fieldset')).toHaveLength(1)
  })

  it('has a data notice that opens on demand', async () => {
    const page = await openPage()

    expect(page.get('details summary').text()).toBe(fr.noticeTitle)
    // Le texte entier, durées comprises : les mêmes constantes que la purge du serveur.
    expect(page.get('details p').text()).toBe(
      fr.noticeText
        .replace('{years}', String(NOTICE_PARAMS.years))
        .replace('{hours}', String(NOTICE_PARAMS.hours))
    )
    expect(page.get('details p').text()).not.toContain('{')
  })
})

describe('public/join/JoinPage — when the address fragment changes', () => {
  const OTHER_LINK = { ...LINK, companyName: 'Laser Arena' }

  const lookupOf = (token: string) => (token === OTHER_TOKEN ? OTHER_LINK : LINK)

  beforeEach(() => {
    fetchMock.mockImplementation(async (url: string, init: { body: string }) =>
      url.endsWith('/lookup')
        ? reply(200, lookupOf(JSON.parse(init.body).token))
        : reply(201, { ok: true })
    )
  })

  it('looks the new token up again and shows the other centre', async () => {
    const page = await openPage()

    expect(page.text()).toContain('Escape Néon')

    await typeInto('#name-0', 'Camille')
    await switchTo(`#${OTHER_TOKEN}`)

    expect(bodyOf(calls('/lookup').at(-1)!)).toEqual({ token: OTHER_TOKEN })
    expect(page.text()).toContain('Laser Arena')
    expect(page.text()).not.toContain('Escape Néon')
    // Rien de ce qui était tapé pour le premier lien n'est gardé.
    expect((page.get('#name-0').element as HTMLInputElement).value).toBe('')

    await typeInto('#name-0', 'Léa')
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(bodyOf(calls('/registrations')[0]!)).toMatchObject({ token: OTHER_TOKEN })
  })

  it('shows "invalid link" when the fragment is emptied', async () => {
    const page = await openPage()

    await switchTo('')

    expect(page.text()).toContain(fr.invalidTitle)
    expect(page.find('form').exists()).toBe(false)
  })

  it('ignores the answer of the previous link when it arrives late', async () => {
    const slow = deferred()

    fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
      JSON.parse(init.body).token === TOKEN ? slow.promise : reply(200, OTHER_LINK)
    )

    setHash(TOKEN)
    wrapper = mount(JoinPage, { attachTo: document.body })
    await flushPromises()
    await switchTo(`#${OTHER_TOKEN}`)

    slow.resolve(reply(200, LINK))
    await flushPromises()

    expect(wrapper.text()).toContain('Laser Arena')
    expect(wrapper.text()).not.toContain('Escape Néon')
  })

  it('stops listening once the page is unmounted', async () => {
    const page = await openPage()
    const before = fetchMock.mock.calls.length

    page.unmount()
    wrapper = undefined
    await switchTo(`#${OTHER_TOKEN}`)

    expect(fetchMock.mock.calls).toHaveLength(before)
  })
})

describe('public/join/JoinPage — when the registration is refused', () => {
  it('puts the error the server names on the e-mail of the first player', async () => {
    const page = await fillTwoPlayersThenRefuse({ email: ['Invalid email address'] })

    expect(page.get('#email-error-0').text()).toBe(fr.errorEmailInvalid)
    expect(page.get('#email-0').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(page.get('#email-0').element)
    expect(page.find('#name-error-0').exists()).toBe(false)
    expect(page.text()).not.toContain(fr.errorInvalidBody)
  })

  it('puts the error the server names on the field of the second player', async () => {
    const page = await fillTwoPlayersThenRefuse({
      'secondPlayer.displayName': ['display_name_invalid'],
    })

    expect(page.get('#name-error-1').text()).toBe(fr.errorNameInvalid)
    expect(document.activeElement).toBe(page.get('#name-1').element)
    expect(page.find('#name-error-0').exists()).toBe(false)
    expect(page.find('#email-error-0').exists()).toBe(false)
  })

  it('falls back to the general message when the server names no field of the page', async () => {
    const page = await fillTwoPlayersThenRefuse(undefined)

    expect(page.text()).toContain(fr.errorInvalidBody)
    expect(page.find('.join__error[role="alert"]').exists()).toBe(false)
  })

  it('says the room is full and keeps what was typed', async () => {
    const page = await submitWith(reply(409, { error: 'join_full' }))

    expect(page.get('[aria-live="polite"]').text()).toBe(fr.errorFull)
    expect((page.get('#name-0').element as HTMLInputElement).value).toBe('Camille')
  })

  it('gives the waiting time of "too many requests"', async () => {
    const page = await submitWith(
      reply(429, { error: 'too_many_requests' }, { 'Retry-After': '37' })
    )

    expect(page.get('[aria-live="polite"]').text()).toBe(fr.errorTooMany.replace('{seconds}', '37'))
  })

  it('offers "try again" after a network failure and sends again', async () => {
    const page = await submitWith(new TypeError('Failed to fetch'))

    expect(page.get('[aria-live="polite"]').text()).toBe(fr.errorNetwork)

    const submit = page.get('button[type="submit"]')

    expect(submit.text()).toBe(fr.retry)

    fetchMock.mockImplementation(async () => reply(201, { ok: true }))
    await page.get('form').trigger('submit')
    await flushPromises()

    expect(page.text()).toContain(fr.successTitle)
  })

  it('shows a server error without the raw message', async () => {
    const page = await submitWith(reply(500, { error: 'server_error', stack: 'boom' }))

    expect(page.get('[aria-live="polite"]').text()).toBe(fr.errorServer)
    expect(page.text()).not.toContain('boom')
  })

  it('switches to "registration closed" when the link was closed while typing', async () => {
    const page = await submitWith(reply(410, { error: 'join_link_closed' }))

    expect(page.text()).toContain(fr.closedTitle)
    expect(page.find('form').exists()).toBe(false)
  })

  it('switches to "invalid link" when the link was regenerated while typing', async () => {
    const page = await submitWith(reply(404, { error: 'join_link_invalid' }))

    expect(page.text()).toContain(fr.invalidTitle)
  })

  it('disables the button while sending, so a double tap sends once', async () => {
    const page = await openPage()
    const pending = deferred()

    fetchMock.mockImplementation(() => pending.promise)
    await typeInto('#name-0', 'Camille')
    await page.get('form').trigger('submit')
    await page.get('form').trigger('submit')

    const submit = page.get('button[type="submit"]')

    expect(submit.attributes('disabled')).toBeDefined()
    expect(submit.text()).toBe(fr.sending)
    expect(calls('/registrations')).toHaveLength(1)

    pending.resolve(reply(201, { ok: true }))
    await flushPromises()
  })
})
