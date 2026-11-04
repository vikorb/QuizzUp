import type { ActionBanner } from '@/types/banner'
import { getGameErrorKey } from '@/utils/game/errors'

type GameTranslateFn = (key: string, params?: Record<string, string | number>) => string

export const GAME_BANNER_CREATED = 'created' as const
export const GAME_BANNER_ABORTED = 'aborted' as const

/**
 * Message d'un bandeau de l'écran Parties. Les textes vivent dans `games.banners` (succès)
 * et `games.errors` (erreurs) : le fichier de locale des parties ne redéfinit pas les
 * namespaces globaux `success` / `errors`, fusionnés à plat par le plugin i18n.
 */
export function getGameBannerMessage(
  banner: ActionBanner | null,
  t: GameTranslateFn
): string | null {
  if (!banner) {
    return null
  }

  if (banner.variant === 'error') {
    return t(getGameErrorKey(banner.code))
  }

  return t(`games.banners.${banner.code}`, banner.params)
}
