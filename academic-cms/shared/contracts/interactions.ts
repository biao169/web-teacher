import type { SessionView } from './auth'

export const CONTACT_MESSAGE_TYPES = [
  'admissions',
  'collaboration',
  'publication',
  'project',
  'course',
  'other',
] as const

export type ContactMessageType = (typeof CONTACT_MESSAGE_TYPES)[number]

export interface RegistrationAvailabilityView {
  enabled: boolean
  authenticated: boolean
  minimumPasswordLength: number
}

export interface RegistrationRequestBody {
  username: string
  password: string
  displayName?: string | null
  email?: string | null
}

export interface RegistrationReceiptView {
  registered: true
  username: string
}

export interface PasswordChangeRequestBody {
  currentPassword: string
  newPassword: string
}

export interface PasswordChangeResultView {
  changed: true
  session: SessionView
}

export interface RevokeAllSessionsResultView {
  authenticated: false
  revokedSessions: number
}

export interface ContactAvailabilityView {
  enabled: boolean
  authenticated: boolean
  anonymousAllowed: boolean
  attachmentsEnabled: false
  messageTypes: readonly ContactMessageType[]
  limits: Readonly<{
    name: number
    email: number
    subject: number
    content: number
  }>
}

export interface ContactMessageRequestBody {
  /** Optional public news origin, resolved and verified by the server. */
  newsUid?: string | null
  name?: string | null
  email?: string | null
  messageType: ContactMessageType
  subject: string
  content: string
  /** Hidden honeypot. Legitimate clients leave this empty. */
  website?: string | null
}

export interface ContactReceiptView {
  accepted: true
  reference: string
}

export interface PublicInteractionErrorView {
  error: {
    code: string
    message: string
    requestId: string
  }
}
