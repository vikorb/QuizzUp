import type { ActionBanner, BannerVariant } from '@/types/banner'

type TranslateFn = (key: string, params?: Record<string, string | number>) => string

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
  const translated = String(t(key, banner.params ?? {}))

  if (translated !== key) {
    return translated
  }

  const defaultKey = `${namespace}.default`
  const defaultTranslated = String(t(defaultKey, banner.params ?? {}))

  return defaultTranslated !== defaultKey ? defaultTranslated : banner.code
}
