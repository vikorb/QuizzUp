export type BannerVariant = 'error' | 'success'

export type ActionBanner = {
  variant: BannerVariant
  code: string
  params?: Record<string, string | number>
}
