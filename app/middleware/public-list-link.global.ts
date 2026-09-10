import { publicListDefinition, publicListRedirect } from '~~/shared/utils/public-list-link'

export default defineNuxtRouteMiddleware(to => {
  if (!/^\/(?:zh|en)\//u.test(to.path) || !publicListDefinition(to.path)) return
  try {
    const canonical = publicListRedirect(to.fullPath)
    if (canonical) return navigateTo(canonical, { replace: true, redirectCode: 302 })
  } catch {
    // Leave invalid parameters for the API's normal 400 response; never silently drop them.
  }
})
