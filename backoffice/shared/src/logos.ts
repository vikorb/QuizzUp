/** Logo d'un centre (compagnie) : formats acceptés et taille maximale, lus par le back et le front. */
export const COMPANY_LOGO_MIME_TYPE_PNG = 'image/png' as const
export const COMPANY_LOGO_MIME_TYPE_JPEG = 'image/jpeg' as const
export const COMPANY_LOGO_MIME_TYPE_WEBP = 'image/webp' as const

// Pas de SVG : il peut porter un script.
export const COMPANY_LOGO_MIME_TYPES = [
  COMPANY_LOGO_MIME_TYPE_PNG,
  COMPANY_LOGO_MIME_TYPE_JPEG,
  COMPANY_LOGO_MIME_TYPE_WEBP,
] as const

export type CompanyLogoMimeType = (typeof COMPANY_LOGO_MIME_TYPES)[number]

export const COMPANY_LOGO_EXTENSIONS: Readonly<Record<CompanyLogoMimeType, string>> = {
  [COMPANY_LOGO_MIME_TYPE_PNG]: 'png',
  [COMPANY_LOGO_MIME_TYPE_JPEG]: 'jpg',
  [COMPANY_LOGO_MIME_TYPE_WEBP]: 'webp',
}

/** 512 Ko : un logo, pas une photo. */
export const COMPANY_LOGO_MAX_BYTES = 512 * 1024
