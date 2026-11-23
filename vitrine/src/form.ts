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
export type ErrorCode = 'required' | 'invalid' | 'tooLong' | 'rejected'
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

/**
 * Bornes de `POST /public/v1/demo-requests` (`CreateDemoRequestRequest` de l'OpenAPI). Recopiées :
 * le paquet reste autonome à l'installation. `tests/form.test.ts` compare chaque borne et le motif
 * du téléphone à `@quizzup/shared`.
 */
export const LIMITS = { name: 120, company: 160, email: 254, phone: 32, message: 2000, rooms: 50 }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Même motif que le serveur ; la longueur trop grande est signalée avant, comme `tooLong`.
export const PHONE = /^[+0-9 ().-]{6,32}$/

export function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {}
  const text = (field: 'name' | 'company' | 'message', optional = false) => {
    const value = values[field].trim()
    if (value === '' && !optional) {
      errors[field] = 'required'
    } else if (value.length > LIMITS[field]) {
      errors[field] = 'tooLong'
    }
  }
  text('name')
  text('company')
  text('message', true)

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

/** `fields` : champs que le serveur dit refusés (400 `invalid_body`), toujours renseignés pour `invalid`. */
export type SubmitOutcome = { result: SubmitResult; fields: FieldName[] }

/** Noms des champs du corps de la route, ramenés à ceux de la page. */
const SERVER_FIELDS: Record<string, FieldName> = {
  name: 'name',
  centerName: 'company',
  email: 'email',
  phone: 'phone',
  roomsCount: 'rooms',
  message: 'message',
  consent: 'consent',
}

/** Lit `details.fieldErrors` d'un 400 : seules les clés servent, jamais le texte du serveur. */
async function rejectedFields(response: Response): Promise<FieldName[]> {
  try {
    const body = (await response.json()) as { details?: { fieldErrors?: object } }
    const keys = Object.keys(body.details?.fieldErrors ?? {})
    return FIELD_NAMES.filter((name) => keys.some((key) => SERVER_FIELDS[key] === name))
  } catch {
    return []
  }
}

/**
 * Poste la demande en JSON. Le résultat est un code, jamais le message brut du serveur :
 * 2xx envoyé, 400 ou 422 refusé avec au moins un champ nommé, 429 limite de débit, autre
 * statut (dont un 400 ou 422 sans champ exploitable) erreur du serveur, pas de réponse erreur
 * réseau. `locale` : langue de la page, envoyée seulement si elle est connue.
 */
export async function sendDemoRequest(
  apiUrl: string,
  values: FormValues,
  fetchFn: typeof fetch = (...args) => fetch(...args),
  locale?: Locale
): Promise<SubmitOutcome> {
  const phone = values.phone.trim()
  const message = values.message.trim()
  const body = {
    name: values.name.trim(),
    centerName: values.company.trim(),
    email: values.email.trim(),
    ...(phone === '' ? {} : { phone }),
    roomsCount: Number(values.rooms),
    ...(message === '' ? {} : { message }),
    consent: true,
    // Clé attendue par la route. Le champ de la page s'appelle `trap` (un nom que les navigateurs
    // et gestionnaires de mots de passe ne remplissent pas) : un robot qui le remplit est écarté
    // ici, avant l'envoi.
    website: '',
    ...(locale ? { locale } : {}),
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
      return { result: 'success', fields: [] }
    }
    if (response.status === 400 || response.status === 422) {
      const fields = await rejectedFields(response)
      if (fields.length > 0) {
        return { result: 'invalid', fields }
      }
    }
    return { result: response.status === 429 ? 'rateLimited' : 'error', fields: [] }
  } catch {
    return { result: 'network', fields: [] }
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
  const locale = lang in messages ? lang : undefined
  const text = options.text ?? messages[locale ?? 'fr']
  const apiUrl = form.dataset.apiUrl ?? ''
  const contact = form.dataset.contact ?? ''
  const status = form.querySelector<HTMLElement>('#form-status')
  const submit = form.querySelector<HTMLButtonElement>('#form-submit')
  // Sans adresse d'API, la page garde son repli : le formulaire ouvre la messagerie (`mailto:`).
  if (!status || !submit || apiUrl === '') {
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
        error.textContent = code ? (text.fieldErrors[`${name}.${code}`] ?? text.fieldRejected) : ''
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

    const { result, fields } = await sendDemoRequest(apiUrl, values, options.fetchFn, locale)

    sending = false
    submit.removeAttribute('aria-disabled')
    submit.removeAttribute('aria-busy')
    switch (result) {
      case 'success': {
        succeed()
        break
      }
      case 'invalid': {
        const rejected: FieldErrors = {}
        for (const name of fields) {
          // Pour l'e-mail, le texte « adresse non valide » dit déjà quoi corriger.
          rejected[name] = name === 'email' ? 'invalid' : 'rejected'
        }
        showErrors(rejected)
        setStatus('warning', text.invalid)
        const firstRejected = FIELD_NAMES.find((name) => rejected[name])
        if (firstRejected) {
          fieldOf(firstRejected)?.focus()
        }
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
