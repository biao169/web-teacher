import { CONTACT_MESSAGE_TYPES, type ContactAvailabilityView, type ContactMessageType, type ContactReceiptView } from '../../../shared/contracts/interactions'
import { hasUnpairedSurrogate } from '../../../shared/utils/unicode'
import { PublicInteractionError } from '../../interactions/errors'
import { canonicalNow } from '../../security/identity'
import type { ActiveSession } from '../auth/session-service'
import type { PublicActionThrottleService } from '../interactions/action-throttle-service'
import type { InteractionSettingsStore } from '../interactions/settings-store'
import type { ContactStore } from './contact-store'

const LIMITS = Object.freeze({ name: 120, email: 320, subject: 200, content: 10_000 })
const encoder = new TextEncoder()

export interface ContactSubmissionInput {
  newsUid?: string | null
  name?: string | null
  email?: string | null
  messageType: ContactMessageType
  subject: string
  content: string
  website?: string | null
  network: string | null
  requestId: string
  session: ActiveSession | null
}

export interface ContactServiceOptions {
  clock?: () => Date
  crypto?: Crypto
  idFactory?: () => string
}

function text(value: unknown, name: string, minimum: number, maximum: number, maximumBytes: number, preserveLines = false): string {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) throw new PublicInteractionError('INTERACTION_INPUT', `${name} is invalid`)
  const canonical = value.normalize('NFC').replace(/\r\n?/gu, '\n')
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(canonical)) {
    throw new PublicInteractionError('INTERACTION_INPUT', `${name} contains control characters`)
  }
  const normalized = preserveLines
    ? canonical.split('\n').map(line => line.replace(/[\t ]+/gu, ' ').trimEnd()).join('\n').trim()
    : canonical.replace(/\s+/gu, ' ').trim()
  const points = [...normalized].length
  if (points < minimum || points > maximum || encoder.encode(normalized).byteLength > maximumBytes) {
    throw new PublicInteractionError('INTERACTION_INPUT', `${name} is outside its size budget`)
  }
  return normalized
}

function optionalText(value: unknown, name: string, maximum: number, maximumBytes: number): string | null {
  if (value === null || value === undefined || value === '') return null
  return text(value, name, 1, maximum, maximumBytes)
}

function email(value: unknown): string | null {
  const normalized = optionalText(value, 'email', LIMITS.email, 512)?.toLowerCase() ?? null
  if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new PublicInteractionError('INTERACTION_INPUT', 'Email address is invalid')
  }
  return normalized
}

export class ContactService {
  private readonly clock: () => Date
  private readonly crypto: Crypto
  private readonly idFactory: () => string

  constructor(
    private readonly store: ContactStore,
    private readonly settings: InteractionSettingsStore,
    private readonly throttle: PublicActionThrottleService,
    options: ContactServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.crypto = options.crypto ?? globalThis.crypto
    this.idFactory = options.idFactory ?? (() => `message:${this.crypto.randomUUID()}`)
  }

  async availability(session: ActiveSession | null): Promise<ContactAvailabilityView> {
    const settings = await this.settings.current()
    return Object.freeze({
      enabled: Boolean(session) || settings.allowAnonymousMessages,
      authenticated: Boolean(session),
      anonymousAllowed: settings.allowAnonymousMessages,
      attachmentsEnabled: false,
      messageTypes: CONTACT_MESSAGE_TYPES,
      limits: LIMITS,
    })
  }

  async submit(input: ContactSubmissionInput): Promise<ContactReceiptView> {
    const settings = await this.settings.current()
    if (!input.session && !settings.allowAnonymousMessages) {
      throw new PublicInteractionError('INTERACTION_AUTH_REQUIRED', 'Anonymous messages are disabled')
    }
    if (!CONTACT_MESSAGE_TYPES.includes(input.messageType)) {
      throw new PublicInteractionError('INTERACTION_INPUT', 'Message type is invalid')
    }
    const name = optionalText(input.name, 'name', LIMITS.name, 480)
      ?? input.session?.principal.displayName
      ?? input.session?.principal.username
      ?? null
    const normalizedEmail = email(input.email) ?? input.session?.principal.email ?? null
    if (!input.session && (!name || !normalizedEmail)) {
      throw new PublicInteractionError('INTERACTION_INPUT', 'Anonymous messages require a name and email address', {
        publicMessage: '匿名留言必须填写姓名和邮箱。',
      })
    }
    const subject = text(input.subject, 'subject', 3, LIMITS.subject, 800)
    const content = text(input.content, 'content', 20, LIMITS.content, 40_000, true)
    const honeypot = optionalText(input.website, 'website', 500, 2_000)
    const uid = this.idFactory()
    if (!/^message:[A-Za-z0-9_-]{8,128}$/u.test(uid)) {
      throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Message identifier factory returned an invalid value')
    }
    // Filled honeypots receive the same success shape without storage or throttle mutation.
    // This prevents automated decoys from exhausting a shared NAT/proxy budget for real visitors.
    if (honeypot) return Object.freeze({ accepted: true, reference: uid })

    const identity = input.session ? `user:${input.session.principal.userUid}` : `email:${normalizedEmail}`
    await this.throttle.consume({ action: 'contact', identity, network: input.network })

    const now = this.clock()
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new PublicInteractionError('INTERACTION_PROTOCOL', 'Contact clock is invalid')
    }
    const at = canonicalNow(now)
    const newsUid = optionalText(input.newsUid, 'newsUid', 128, 512)
    const news = newsUid ? await this.store.messageableNews(newsUid, at) : null
    if (newsUid && !news) throw new PublicInteractionError('INTERACTION_DISABLED', 'News is unavailable or messages are closed')
    // Keep the submitted body intact. The origin is resolved by the server,
    // stored alongside it and included as structured audit metadata.
    const storedContent = news
      ? `新闻来源 / News source: ${news.title.replace(/\s+/gu, ' ')}\n新闻链接 / News URL: /zh/news/${encodeURIComponent(news.slug)}\n新闻编号 / News UID: ${news.uid}\n\n${content}`
      : content
    await this.store.create({
      newsUid,
      uid,
      at,
      authenticated: Boolean(input.session),
      name,
      email: normalizedEmail,
      messageType: input.messageType,
      subject,
      content: storedContent,
      audit: {
        uid: `audit:${this.crypto.randomUUID()}`,
        at,
        actor: input.session
          ? { uid: input.session.principal.userUid, name: input.session.principal.displayName ?? input.session.principal.username }
          : { uid: null, name },
        action: 'message_submit',
        module: 'messages',
        targetUid: uid,
        summary: 'Contact message submitted',
        detail: {
          request_id: input.requestId || 'unavailable',
          authenticated: Boolean(input.session),
          message_type: input.messageType,
          notification_configured: Boolean(settings.notifyEmail),
          attachment_included: false,
          ...(news ? { news_uid: news.uid, news_title: news.title, news_slug: news.slug } : {}),
        },
        status: 'success',
      },
    })
    return Object.freeze({ accepted: true, reference: uid })
  }
}
