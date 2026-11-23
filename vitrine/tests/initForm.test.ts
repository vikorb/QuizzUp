// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initForm } from '../src/form'
import { messages } from '../src/messages'

const text = messages.fr
const CONTACT = 'contact@example.org'

const FIELDS = ['name', 'company', 'email', 'phone', 'rooms', 'message'] as const

function buildForm(): HTMLFormElement {
  document.documentElement.lang = 'fr'
  document.body.innerHTML = `
    <form id="demo-form" data-api-url="https://api.example.org" data-contact="${CONTACT}">
      ${FIELDS.map(
        (name) =>
          `<input id="f-${name}" name="${name}" aria-describedby="f-${name}-error" />
           <p id="f-${name}-error"></p>`
      ).join('')}
      <input id="f-consent" name="consent" type="checkbox" />
      <p id="f-consent-error"></p>
      <input id="f-website" name="website" />
      <p id="form-status" role="status" aria-live="polite" tabindex="-1"></p>
      <button type="submit" id="form-submit">Envoyer</button>
    </form>`
  return document.querySelector<HTMLFormElement>('#demo-form') as HTMLFormElement
}

const field = (name: string) => document.querySelector<HTMLInputElement>(`#f-${name}`)!
const status = () => document.querySelector<HTMLElement>('#form-status')!

function fillValid(): void {
  field('name').value = 'Camille Martin'
  field('company').value = 'Escape du Port'
  field('email').value = 'camille@example.org'
  field('rooms').value = '3'
  field('message').value = 'Bonjour'
  field('consent').checked = true
}

async function submit(form: HTMLFormElement): Promise<void> {
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
  // Laisse la promesse d'envoi et la mise à jour de l'état se terminer.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('initForm', () => {
  let form: HTMLFormElement

  beforeEach(() => {
    form = buildForm()
  })

  it('désactive la validation native pour afficher nos messages', () => {
    initForm(form, { fetchFn: vi.fn<typeof fetch>() })
    expect(form.noValidate).toBe(true)
  })

  it('affiche les erreurs, relie les champs et place le focus sur le premier invalide', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    initForm(form, { fetchFn })
    await submit(form)

    expect(fetchFn).not.toHaveBeenCalled()
    expect(document.querySelector('#f-name-error')?.textContent).toBe(
      text.fieldErrors['name.required']
    )
    expect(document.querySelector('#f-consent-error')?.textContent).toBe(
      text.fieldErrors['consent.required']
    )
    expect(field('name').getAttribute('aria-invalid')).toBe('true')
    expect(field('name').getAttribute('aria-describedby')).toBe('f-name-error')
    expect(document.activeElement).toBe(field('name'))
  })

  it("efface l'erreur d'un champ dès qu'on le corrige", async () => {
    initForm(form, { fetchFn: vi.fn<typeof fetch>() })
    await submit(form)

    field('name').value = 'C'
    field('name').dispatchEvent(new Event('input', { bubbles: true }))
    expect(field('name').hasAttribute('aria-invalid')).toBe(false)
    expect(document.querySelector('#f-name-error')?.textContent).toBe('')
  })

  it('envoie la demande, annonce le succès et vide le formulaire', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 201 }))
    initForm(form, { fetchFn })
    fillValid()
    await submit(form)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(status().dataset.state).toBe('success')
    expect(status().textContent).toBe(text.success)
    expect(field('name').value).toBe('')
    expect(document.querySelector<HTMLButtonElement>('#form-submit')?.disabled).toBe(false)
  })

  it("montre l'état d'envoi et bloque le bouton pendant la requête", async () => {
    let release: (response: Response) => void = () => {}
    const fetchFn = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        })
    )
    initForm(form, { fetchFn })
    fillValid()
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

    const button = document.querySelector<HTMLButtonElement>('#form-submit')!
    expect(status().dataset.state).toBe('sending')
    expect(status().textContent).toBe(text.sending)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')

    // Un second envoi pendant le premier est ignoré.
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    expect(fetchFn).toHaveBeenCalledTimes(1)

    release(new Response(null, { status: 201 }))
    await vi.waitFor(() => expect(status().dataset.state).toBe('success'))
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-busy')).toBe(false)
  })

  it.each([
    [400, 'warning', text.invalid],
    [429, 'warning', text.rateLimited],
    [500, 'error', text.error(CONTACT)],
  ])('statut %i : état %s', async (code, state, message) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: code }))
    initForm(form, { fetchFn })
    fillValid()
    await submit(form)

    expect(status().dataset.state).toBe(state)
    expect(status().textContent).toBe(message)
    // La saisie est conservée pour réessayer.
    expect(field('name').value).toBe('Camille Martin')
  })

  it("propose l'adresse de contact quand le serveur est injoignable", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))
    initForm(form, { fetchFn })
    fillValid()
    await submit(form)

    expect(status().dataset.state).toBe('error')
    expect(status().textContent).toBe(text.network(CONTACT))
    expect(status().textContent).toContain(CONTACT)
  })

  it('répond « envoyé » sans rien envoyer quand le champ piège est rempli', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    initForm(form, { fetchFn })
    fillValid()
    field('website').value = 'http://spam.example'
    await submit(form)

    expect(fetchFn).not.toHaveBeenCalled()
    expect(status().dataset.state).toBe('success')
  })

  it('valide aussi quand le champ piège est rempli : pas de succès sur une demande vide', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    initForm(form, { fetchFn })
    field('website').value = 'http://spam.example'
    await submit(form)

    expect(status().dataset.state).not.toBe('success')
  })
})
