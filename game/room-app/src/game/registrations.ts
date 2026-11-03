import type { EngineParticipant } from '@quizzup/game-engine'

import type { DeskNumber } from '@/hardware/buzzers'

/**
 * Inscription d'un joueur à un pupitre, dans le lobby. L'email est facultatif ;
 * s'il est saisi, le consentement RGPD explicite est obligatoire et horodaté.
 */
export type Registration = {
  desk: DeskNumber
  displayName: string
  email: string
  consent: boolean
  /** ISO 8601, renseigné au moment où la case est cochée. */
  consentAt: string | null
}

export type RegistrationErrors = {
  displayName?: 'required' | 'too_long'
  email?: 'invalid' | 'consent_required'
}

export const DISPLAY_NAME_MAX_LENGTH = 24
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function createEmptyRegistration(desk: DeskNumber): Registration {
  return { desk, displayName: '', email: '', consent: false, consentAt: null }
}

/** Un pupitre est « inscrit » dès qu'un nom ou un email y est saisi. */
export function isRegistrationFilled(registration: Registration): boolean {
  return registration.displayName.trim() !== '' || registration.email.trim() !== ''
}

export function validateRegistration(registration: Registration): RegistrationErrors {
  const errors: RegistrationErrors = {}
  const name = registration.displayName.trim()
  const email = registration.email.trim()

  if (name === '') {
    errors.displayName = 'required'
  } else if (name.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = 'too_long'
  }

  if (email !== '') {
    if (!EMAIL_PATTERN.test(email)) {
      errors.email = 'invalid'
    } else if (!registration.consent || !registration.consentAt) {
      errors.email = 'consent_required'
    }
  }

  return errors
}

export function hasErrors(errors: RegistrationErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Coche / décoche le consentement en l'horodatant (jamais pré-coché). */
export function setConsent(registration: Registration, consent: boolean, now = new Date()) {
  return { ...registration, consent, consentAt: consent ? now.toISOString() : null }
}

/**
 * Inscriptions retenues pour la partie : pupitres remplis, nettoyés. Un email
 * sans consentement n'est jamais conservé.
 */
export function finalizeRegistrations(registrations: Registration[]): Registration[] {
  return registrations.filter(isRegistrationFilled).map((registration) => {
    const email = registration.email.trim()
    const keepEmail = email !== '' && registration.consent && registration.consentAt !== null

    return {
      desk: registration.desk,
      displayName: registration.displayName.trim(),
      email: keepEmail ? email : '',
      consent: keepEmail,
      consentAt: keepEmail ? registration.consentAt : null,
    }
  })
}

/** Participants du moteur : l'identifiant local d'un joueur est son numéro de pupitre. */
export function toEngineParticipants(registrations: Registration[]): EngineParticipant[] {
  return registrations.map((registration) => ({
    id: registration.desk,
    podium: registration.desk,
    displayName: registration.displayName,
  }))
}
