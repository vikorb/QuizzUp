import { QUESTION_MEDIA_PROVIDER_SEARCH_MIN_LENGTH } from '@quizzup/shared'
import { z } from 'zod'

export const MEDIA_CATALOG_QUERY_MAX_LENGTH = 100
export const MEDIA_CATALOG_DEFAULT_LIMIT = 10
export const MEDIA_CATALOG_MAX_LIMIT = 25

/** Query de `GET /media-catalog/tracks`. */
export const mediaCatalogTracksQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(QUESTION_MEDIA_PROVIDER_SEARCH_MIN_LENGTH)
    .max(MEDIA_CATALOG_QUERY_MAX_LENGTH),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MEDIA_CATALOG_MAX_LIMIT)
    .default(MEDIA_CATALOG_DEFAULT_LIMIT),
})
