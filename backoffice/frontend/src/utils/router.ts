import type { RouteLocationNormalizedLoaded } from 'vue-router'

export function getRedirect(route: RouteLocationNormalizedLoaded, fallback = '/'): string {
  const router = route.query.redirect
  return typeof router === 'string' && router.trim().length > 0 ? router : fallback
}
