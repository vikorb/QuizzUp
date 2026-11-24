import type { PublicMessages } from '@/public/i18n'

const fr = {
  pageTitle: 'Votre bon',
  loading: 'Chargement du bon…',
  validTitle: 'Bon valable',
  validText: 'Usage unique : présentez ce bon à l’accueil.',
  redeemedTitle: 'Bon déjà utilisé',
  redeemedText: 'Ce bon a déjà été utilisé : il n’est plus valable.',
  expiredTitle: 'Bon expiré',
  expiredText: 'La validité de ce bon est terminée le {date}.',
  cancelledTitle: 'Bon annulé',
  cancelledText: 'Ce bon a été annulé par le centre. Adressez-vous à l’accueil.',
  notFoundTitle: 'Bon introuvable',
  notFoundText: 'Ce code ne correspond à aucun bon. Scannez de nouveau le QR code de votre bon.',
  lookupFailedTitle: 'Connexion impossible',
  lookupFailedText: 'Vérifiez votre connexion, puis réessayez.',
  tooManyTitle: 'Trop de demandes',
  tooManyText: 'Réessayez dans {seconds} secondes.',
  retry: 'Réessayer',
  codeLabel: 'Code du bon',
  validUntil: 'Valable jusqu’au {date}',
}

const en: Record<keyof typeof fr, string> = {
  pageTitle: 'Your voucher',
  loading: 'Loading your voucher…',
  validTitle: 'Valid voucher',
  validText: 'Single use: show this voucher at the front desk.',
  redeemedTitle: 'Voucher already used',
  redeemedText: 'This voucher has already been used: it is no longer valid.',
  expiredTitle: 'Voucher expired',
  expiredText: 'This voucher expired on {date}.',
  cancelledTitle: 'Voucher cancelled',
  cancelledText: 'This voucher was cancelled by the venue. Ask at the front desk.',
  notFoundTitle: 'Voucher not found',
  notFoundText: 'This code does not match any voucher. Scan the QR code of your voucher again.',
  lookupFailedTitle: 'Connection failed',
  lookupFailedText: 'Check your connection, then try again.',
  tooManyTitle: 'Too many requests',
  tooManyText: 'Try again in {seconds} seconds.',
  retry: 'Try again',
  codeLabel: 'Voucher code',
  validUntil: 'Valid until {date}',
}

export const voucherMessages: PublicMessages<typeof fr> = { fr, en }
