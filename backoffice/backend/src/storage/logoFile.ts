import {
  COMPANY_LOGO_MIME_TYPE_JPEG,
  COMPANY_LOGO_MIME_TYPE_PNG,
  COMPANY_LOGO_MIME_TYPE_WEBP,
  type CompanyLogoMimeType,
} from '@quizzup/shared'

function startsWithBytes(content: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => content[offset + index] === byte)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

/**
 * Type réel du fichier, lu sur ses premiers octets : ni l'en-tête `Content-Type` ni l'extension
 * ne comptent, pour ne pas stocker un SVG ou un script renommé en `.png`. `null` si ce n'est ni
 * un PNG, ni un JPEG, ni un WebP.
 */
export function detectLogoMimeType(content: Buffer): CompanyLogoMimeType | null {
  if (startsWithBytes(content, PNG_SIGNATURE)) {
    return COMPANY_LOGO_MIME_TYPE_PNG
  }

  if (startsWithBytes(content, JPEG_SIGNATURE)) {
    return COMPANY_LOGO_MIME_TYPE_JPEG
  }

  if (startsWithBytes(content, RIFF) && startsWithBytes(content, WEBP, 8)) {
    return COMPANY_LOGO_MIME_TYPE_WEBP
  }

  return null
}
