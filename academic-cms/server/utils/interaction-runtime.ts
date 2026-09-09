import type { H3Event } from 'h3'
import { AccountService } from '../services/auth/account-service'
import { RegistrationService } from '../services/auth/registration-service'
import { ContactService } from '../services/contact/contact-service'
import { ContactStore } from '../services/contact/contact-store'
import { PublicActionThrottleService } from '../services/interactions/action-throttle-service'
import { PublicActionThrottleStore } from '../services/interactions/action-throttle-store'
import { InteractionSettingsStore } from '../services/interactions/settings-store'
import { useAuthRuntime } from './auth-runtime'
import { useDatabase } from './database'

export interface InteractionRuntime {
  settings: InteractionSettingsStore
  registration: RegistrationService
  account: AccountService
  contact: ContactService
}

export function useInteractionRuntime(event: H3Event): InteractionRuntime {
  if (event.context.interactionRuntime) return event.context.interactionRuntime as InteractionRuntime
  const adapter = useDatabase(event).adapter
  const auth = useAuthRuntime(event)
  const settings = new InteractionSettingsStore(adapter)
  const throttleStore = new PublicActionThrottleStore(adapter)
  const registrationThrottle = new PublicActionThrottleService(throttleStore, auth.tokens, {
    windowSeconds: 3_600,
    blockSeconds: 3_600,
    identityLimit: 3,
    networkLimit: 10,
    retentionSeconds: 86_400,
  })
  const contactThrottle = new PublicActionThrottleService(throttleStore, auth.tokens, {
    windowSeconds: 900,
    blockSeconds: 900,
    identityLimit: 4,
    networkLimit: 12,
    retentionSeconds: 86_400,
  })
  const runtime: InteractionRuntime = {
    settings,
    registration: new RegistrationService(auth.store, settings, registrationThrottle, auth.passwords),
    account: new AccountService(auth.store, auth.passwords, auth.sessions),
    contact: new ContactService(new ContactStore(adapter), settings, contactThrottle),
  }
  event.context.interactionRuntime = runtime
  return runtime
}
