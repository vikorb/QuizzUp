import { JOIN_REGISTRATION_MAX_AGE_HOURS, PLAYER_EMAIL_RETENTION_YEARS } from '@quizzup/shared'

import type { PublicMessages } from '@/public/i18n'

/** Durées citées dans la notice : les mêmes constantes que la purge du serveur. */
export const NOTICE_PARAMS = {
  years: PLAYER_EMAIL_RETENTION_YEARS,
  hours: JOIN_REGISTRATION_MAX_AGE_HOURS,
}

const fr = {
  pageTitle: 'Rejoindre la partie',
  loading: 'Chargement du lien…',
  invalidTitle: 'Lien invalide',
  invalidText: 'Ce lien n’est pas valide. Scannez de nouveau le QR code affiché dans la salle.',
  closedTitle: 'Inscriptions closes',
  closedText:
    'Les inscriptions pour cette partie sont terminées. Demandez au personnel un nouveau QR code.',
  lookupFailedTitle: 'Connexion impossible',
  lookupFailedText: 'Vérifiez votre connexion, puis réessayez.',
  retry: 'Réessayer',
  intro: 'Inscrivez-vous : le personnel vous placera à un pupitre.',
  playerTitle: 'Joueur {n}',
  displayName: 'Prénom',
  displayNameHint: 'Il sera affiché sur l’écran de la salle.',
  email: 'E-mail (facultatif)',
  emailConsent:
    'J’accepte que le centre conserve mon e-mail pour m’envoyer les résultats de la partie.',
  marketingConsent: 'Je souhaite recevoir les offres du centre (facultatif).',
  ageConfirmed: 'J’ai 15 ans ou plus.',
  addSecond: 'Ajouter un 2e joueur',
  removeSecond: 'Retirer le 2e joueur',
  submit: 'Envoyer ma demande',
  sending: 'Envoi en cours…',
  noticeTitle: 'Comment vos données sont utilisées',
  noticeText:
    'Votre prénom sert à vous placer à un pupitre. Votre e-mail, s’il est saisi, est conservé {years} ans au plus. Une demande non validée est supprimée au bout de {hours} h. Aucune adresse IP n’est conservée. Pour retirer votre accord ou effacer vos données, demandez-le au centre.',
  noticeTextKids:
    'Votre prénom sert à vous placer à un pupitre. Aucun e-mail n’est demandé. Une demande non validée est supprimée au bout de {hours} h. Aucune adresse IP n’est conservée. Pour effacer vos données, demandez-le au centre.',
  successTitle: 'C’est noté.',
  successText: 'Le personnel va vous placer à un pupitre.',
  another: 'Inscrire un autre pupitre',
  errorNameRequired: 'Saisissez un prénom.',
  errorNameInvalid: 'Ce prénom contient un caractère non autorisé. Utilisez des lettres.',
  errorEmailInvalid: 'Saisissez une adresse e-mail valide.',
  errorEmailConsent: 'Cochez cette case, ou retirez l’e-mail.',
  errorAge: 'L’e-mail est réservé aux 15 ans et plus : cochez cette case, ou retirez l’e-mail.',
  errorNetwork: 'Impossible d’envoyer votre demande. Vérifiez votre connexion.',
  errorFull:
    'Les inscriptions sont complètes pour le moment. Prévenez le personnel, puis réessayez.',
  errorTooMany: 'Trop de demandes. Réessayez dans {seconds} secondes.',
  errorInvalidBody: 'Certaines informations sont refusées. Vérifiez le formulaire.',
  errorServer: 'Une erreur est survenue. Réessayez dans un instant.',
}

const en: Record<keyof typeof fr, string> = {
  pageTitle: 'Join the game',
  loading: 'Loading the link…',
  invalidTitle: 'Invalid link',
  invalidText: 'This link is not valid. Scan the QR code shown in the room again.',
  closedTitle: 'Registration closed',
  closedText: 'Registration for this game is over. Ask the staff for a new QR code.',
  lookupFailedTitle: 'Connection failed',
  lookupFailedText: 'Check your connection, then try again.',
  retry: 'Try again',
  intro: 'Sign up: the staff will place you at a desk.',
  playerTitle: 'Player {n}',
  displayName: 'First name',
  displayNameHint: 'It will be shown on the room screen.',
  email: 'E-mail (optional)',
  emailConsent: 'I agree that the venue keeps my e-mail to send me the results of the game.',
  marketingConsent: 'I would like to receive the venue’s offers (optional).',
  ageConfirmed: 'I am 15 or older.',
  addSecond: 'Add a 2nd player',
  removeSecond: 'Remove the 2nd player',
  submit: 'Send my request',
  sending: 'Sending…',
  noticeTitle: 'How your data is used',
  noticeText:
    'Your first name is used to place you at a desk. Your e-mail, if you enter one, is kept for {years} years at most. A request that is not approved is deleted after {hours} h. No IP address is kept. To withdraw your consent or erase your data, ask the venue.',
  noticeTextKids:
    'Your first name is used to place you at a desk. No e-mail is asked. A request that is not approved is deleted after {hours} h. No IP address is kept. To erase your data, ask the venue.',
  successTitle: 'Got it.',
  successText: 'The staff will place you at a desk.',
  another: 'Sign up another desk',
  errorNameRequired: 'Enter a first name.',
  errorNameInvalid: 'This first name contains a character that is not allowed. Use letters.',
  errorEmailInvalid: 'Enter a valid e-mail address.',
  errorEmailConsent: 'Tick this box, or remove the e-mail.',
  errorAge: 'E-mail is for players aged 15 or older: tick this box, or remove the e-mail.',
  errorNetwork: 'Your request could not be sent. Check your connection.',
  errorFull: 'Registration is full for now. Tell the staff, then try again.',
  errorTooMany: 'Too many requests. Try again in {seconds} seconds.',
  errorInvalidBody: 'Some information was refused. Check the form.',
  errorServer: 'Something went wrong. Try again in a moment.',
}

export const joinMessages: PublicMessages<typeof fr> = { fr, en }
