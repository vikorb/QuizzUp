import { type Locale, type Messages, messages } from './messages'

/** Route publique de l'API qui reçoit les demandes de démonstration (autre lot). */
export const DEMO_REQUESTS_PATH = '/public/v1/demo-requests'

/** Délai au-delà duquel l'envoi est considéré comme une erreur réseau. */
export const REQUEST_TIMEOUT_MS = 15_000

export const FIELD_NAMES = [
  'name',
  'company',
  'email',
  'phone',
  'rooms',
  'message',
  'consent',
] as const

export type FieldName = (typeof FIELD_NAMES)[number]
export type ErrorCode = 'required' | 'invalid' | 'tooLong'
export type FieldErrors = Partial<Record<FieldName, ErrorCode>>

export type FormValues = {
  name: string
  company: string
  email: string
  phone: string
  rooms: string
  message: string
  consent: boolean
  /** Champ piège : invisible pour une personne, rempli par un robot. */
  trap: string
}

export const LIMITS = { name: 120, company: 120, email: 254, phone: 20, message: 2000, rooms: 99 }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[\d\s().-]{6,}$/

export function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  const text = (field: 'name' | 'company' | 'message') => {
    const value = values[field].trim()
    if (value === '') {
      errors[field] = 'required'
    } else if (value.length > LIMITS[field]) {
      errors[field] = 'tooLong'
    }
  }
  text('name')
  text('company')
  text('message')

  const email = values.email.trim()
  if (email === '') {
    errors.email = 'required'
  } else if (email.length > LIMITS.email) {
    errors.email = 'tooLong'
  } else if (!EMAIL.test(email)) {
    errors.email = 'invalid'
  }

  const phone = values.phone.trim()
  if (phone.length > LIMITS.phone) {
    errors.phone = 'tooLong'
  } else if (phone !== '' && !PHONE.test(phone)) {
    errors.phone = 'invalid'
  }

  const rooms = values.rooms.trim()
  if (rooms === '') {
    errors.rooms = 'required'
  } else if (!/^\d+$/.test(rooms) || Number(rooms) < 1 || Number(rooms) > LIMITS.rooms) {
    errors.rooms = 'invalid'
  }

  if (!values.consent) {
    errors.consent = 'required'
  }
  return errors
}

export function isSpam(values: FormValues): boolean {
  return values.trap.trim() !== ''
}

export type SubmitResult = 'success' | 'invalid' | 'rateLimited' | 'error' | 'network'

/**
 * Poste la demande en JSON. Le résultat est un code, jamais le message brut du serveur :
 * 2xx envoyé, 400 ou 422 refusé par la validation du serveur, 429 limite de débit, autre
 * statut erreur du serveur, pas de réponse erreur réseau.
 */
export async function sendDemoRequest(
  apiUrl: string,
  values: FormValues,
  fetchFn: typeof fetch = (...args) => fetch(...args)
): Promise<SubmitResult> {
  const phone = values.phone.trim()
  const body = {
    name: values.name.trim(),
    company: values.company.trim(),
    email: values.email.trim(),
    ...(phone === '' ? {} : { phone }),
    rooms: Number(values.rooms),
    message: values.message.trim(),
    consent: true,
    // Clé attendue par la route. Le champ de la page s'appelle `trap` (un nom que les navigateurs
    // et gestionnaires de mots de passe ne remplissent pas) : un robot qui le remplit est écarté
    // ici, avant l'envoi.
    website: '',
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetchFn(`${apiUrl.replace(/\/$/, '')}${DEMO_REQUESTS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      signal: controller.signal,
    })
    if (response.ok) {
      return 'success'
    }
    if (response.status === 400 || response.status === 422) {
      return 'invalid'
    }
    return response.status === 429 ? 'rateLimited' : 'error'
  } catch {
    return 'network'
  } finally {
    clearTimeout(timer)
  }
}

export function readValues(form: HTMLFormElement): FormValues {
  const read = (name: string): string => {
    const field = form.elements.namedItem(name)
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field.value
      : ''
  }
  const consent = form.elements.namedItem('consent')
  return {
    name: read('name'),
    company: read('company'),
    email: read('email'),
    phone: read('phone'),
    rooms: read('rooms'),
    message: read('message'),
    consent: consent instanceof HTMLInputElement && consent.checked,
    trap: read('trap'),
  }
}

type InitOptions = { fetchFn?: typeof fetch; text?: Messages }

/**
 * Branche le formulaire : validation avant envoi (messages liés aux champs par
 * `aria-describedby`), état d'envoi, puis résultat annoncé dans la zone `aria-live`.
 */
export function initForm(form: HTMLFormElement, options: InitOptions = {}): void {
  const lang = document.documentElement.lang as Locale
  const text = options.text ?? messages[lang in messages ? lang : 'fr']
  const apiUrl = form.dataset.apiUrl ?? ''
  const contact = form.dataset.contact ?? ''
  const status = form.querySelector<HTMLElement>('#form-status')
  const submit = form.querySelector<HTMLButtonElement>('#form-submit')
  if (!status || !submit) {
    return
  }

  // Les messages sont les nôtres ; sans JavaScript, la validation du navigateur reste active.
  form.setAttribute('novalidate', '')
  let sending = false

  const setStatus = (state: string, message: string) => {
    status.dataset.state = state
    status.textContent = message
  }

  const fieldOf = (name: FieldName) => form.elements.namedItem(name) as HTMLElement | null

  const showErrors = (errors: FieldErrors) => {
    for (const name of FIELD_NAMES) {
      const code = errors[name]
      const error = form.querySelector<HTMLElement>(`#f-${name}-error`)
      if (error) {
        error.textContent = code ? (text.fieldErrors[`${name}.${code}`] ?? '') : ''
      }
      if (code) {
        fieldOf(name)?.setAttribute('aria-invalid', 'true')
      } else {
        fieldOf(name)?.removeAttribute('aria-invalid')
      }
    }
  }

  form.addEventListener('input', (event) => {
    const target = event.target as HTMLElement
    const name = (target as HTMLInputElement).name as FieldName
    if (FIELD_NAMES.includes(name) && target.getAttribute('aria-invalid')) {
      target.removeAttribute('aria-invalid')
      const error = form.querySelector<HTMLElement>(`#f-${name}-error`)
      if (error) {
        error.textContent = ''
      }
    }
  })

  const succeed = () => {
    form.reset()
    setStatus('success', text.success)
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (sending) {
      return
    }

    const values = readValues(form)
    const errors = validate(values)
    showErrors(errors)
    const first = FIELD_NAMES.find((name) => errors[name])
    if (first) {
      setStatus('', '')
      fieldOf(first)?.focus()
      return
    }

    // Un robot a rempli le champ piège : on répond comme si tout allait bien, sans rien envoyer.
    if (isSpam(values)) {
      succeed()
      return
    }

    sending = true
    submit.setAttribute('aria-disabled', 'true')
    submit.setAttribute('aria-busy', 'true')
    setStatus('sending', text.sending)

    const result = await sendDemoRequest(apiUrl, values, options.fetchFn)

    sending = false
    submit.removeAttribute('aria-disabled')
    submit.removeAttribute('aria-busy')
    switch (result) {
      case 'success': {
        succeed()
        break
      }
      case 'invalid': {
        setStatus('warning', text.invalid)
        break
      }
      case 'rateLimited': {
        setStatus('warning', text.rateLimited)
        break
      }
      case 'network': {
        setStatus('error', text.network(contact))
        break
      }
      default: {
        setStatus('error', text.error(contact))
      }
    }
  })
}
