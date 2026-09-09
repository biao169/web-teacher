import { randomBytes } from 'node:crypto'

function secret(bytes = 48) {
  return randomBytes(bytes).toString('base64url')
}

console.log(`# Copy these values into a secret manager or an untracked .env file.
NUXT_AUTH_SECRET=${secret()}
NUXT_AUTH_BOOTSTRAP_TOKEN=${secret()}`)
