/**
 * Textes affichés par le script du formulaire, par langue. Le site est en français dans ce lot ;
 * une version anglaise ajoute une entrée ici et ses propres pages HTML (`lang="en"`).
 */
export const messages = {
  fr: {
    fieldErrors: {
      'name.required': 'Indiquez votre nom.',
      'name.tooLong': 'Ce nom est trop long (120 caractères au plus).',
      'company.required': 'Indiquez le nom de votre centre.',
      'company.tooLong': 'Ce nom est trop long (120 caractères au plus).',
      'email.required': 'Indiquez votre adresse e-mail.',
      'email.invalid': 'Cette adresse e-mail ne semble pas valide.',
      'email.tooLong': 'Cette adresse e-mail est trop longue.',
      'phone.invalid': 'Ce numéro de téléphone ne semble pas valide.',
      'phone.tooLong': 'Ce numéro de téléphone est trop long.',
      'rooms.required': 'Indiquez le nombre de salles.',
      'rooms.invalid': 'Indiquez un nombre entier de salles, entre 1 et 99.',
      'message.required': 'Écrivez-nous quelques lignes.',
      'message.tooLong': 'Ce message est trop long (2 000 caractères au plus).',
      'consent.required': 'Cochez la case pour que nous puissions traiter votre demande.',
    } as Record<string, string>,
    submit: 'Envoyer la demande',
    sending: 'Envoi en cours…',
    success: 'Merci, votre demande est envoyée. Nous vous répondons par e-mail.',
    invalid:
      'Votre demande n’a pas été acceptée : vérifiez les informations saisies, puis réessayez.',
    rateLimited: 'Trop de demandes en peu de temps. Réessayez dans quelques minutes.',
    network: (contact: string) =>
      `Impossible de joindre le serveur. Vérifiez votre connexion et réessayez, ou écrivez-nous à ${contact}.`,
    error: (contact: string) =>
      `Le serveur a rencontré un problème et la demande n’est pas partie. Réessayez plus tard, ou écrivez-nous à ${contact}.`,
  },
}

export type Locale = keyof typeof messages
export type Messages = (typeof messages)[Locale]
