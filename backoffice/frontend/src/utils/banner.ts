import type { TranslateFn } from '@/types'
import type { ActionBanner, BannerVariant } from '@/types/banner'

export function createErrorBanner(code: string): ActionBanner {
  return {
    variant: 'error',
    code,
  }
}

export function createSuccessBanner(
  code: string,
  params?: Record<string, string | number>,
): ActionBanner {
  return {
    variant: 'success',
    code,
    params,
  }
}

export function getBannerVariant(banner: ActionBanner | null): BannerVariant {
  return banner?.variant ?? 'error'
}

export function getBannerMessage(banner: ActionBanner | null, t: TranslateFn): string | null {
  if (!banner) {
    return null
  }

  const namespace = banner.variant === 'success' ? 'success' : 'errors'
  const key = `${namespace}.${banner.code}`
  const translated = t(key)

  if (translated !== key) {
    return translated
  }

  const defaultKey = `${namespace}.default`
  const defaultTranslated = t(defaultKey)

  return defaultTranslated !== defaultKey ? defaultTranslated : banner.code
}
