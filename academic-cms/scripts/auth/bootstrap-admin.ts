import { openNodeDatabase } from '../../db/runtime/node'
import { AuthStore } from '../../server/services/auth/auth-store'
import { BootstrapService } from '../../server/services/auth/bootstrap-service'
import { parseAuthConfig } from '../../server/security/config'
import { PasswordService } from '../../server/security/password'
import { AuthTokenService } from '../../server/security/tokens'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

const config = parseAuthConfig({
  authSecret: process.env.NUXT_AUTH_SECRET,
  bootstrapToken: process.env.NUXT_AUTH_BOOTSTRAP_TOKEN,
  trustedOrigins: process.env.NUXT_AUTH_TRUSTED_ORIGINS,
  secureCookies: process.env.NUXT_AUTH_SECURE_COOKIES,
})
if (!config.bootstrapToken) throw new Error('NUXT_AUTH_BOOTSTRAP_TOKEN is required')
const database = openNodeDatabase(process.env.CMS_DATABASE_PATH ?? 'data/site.sqlite3')
try {
  const tokens = new AuthTokenService(config.authSecret)
  const service = new BootstrapService(new AuthStore(database.adapter), new PasswordService(), tokens)
  const result = await service.createInitialAdministrator({
    username: required('CMS_BOOTSTRAP_USERNAME'),
    password: required('CMS_BOOTSTRAP_PASSWORD'),
    displayName: process.env.CMS_BOOTSTRAP_DISPLAY_NAME || null,
    email: process.env.CMS_BOOTSTRAP_EMAIL || null,
    presentedToken: config.bootstrapToken,
    expectedToken: config.bootstrapToken,
    requestId: globalThis.crypto.randomUUID(),
  })
  console.log(JSON.stringify({
    status: 'created',
    user: { uid: result.userUid, username: result.username, displayName: result.displayName, email: result.email },
    next: 'Remove NUXT_AUTH_BOOTSTRAP_TOKEN and CMS_BOOTSTRAP_PASSWORD from the runtime environment.',
  }, null, 2))
}
finally { database.close() }
