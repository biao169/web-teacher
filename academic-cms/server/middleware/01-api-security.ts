import { setResponseHeaders } from 'h3'
import { buildApiSecurityHeaders } from '../security/headers'

export default defineEventHandler((event) => {
  const path = event.path.split('?', 1)[0] ?? event.path
  if (!path.startsWith('/api/') && path !== '/health') return
  setResponseHeaders(event, buildApiSecurityHeaders(process.env.NODE_ENV === 'production'))
})
