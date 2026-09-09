import type { DatabaseAdapter, SqlCommand } from '../../../db/contracts'
import { DatabaseError } from '../../../db/errors'
import { read, write } from '../../../db/query'
import type { AuditEvent } from '../../audit/commands'
import { buildAuditCommand } from '../../audit/commands'
import { PublicInteractionError } from '../../interactions/errors'

export interface PersistContactMessageInput {
  newsUid?: string | null
  uid: string
  at: string
  authenticated: boolean
  name: string | null
  email: string | null
  messageType: string
  subject: string
  content: string
  audit: AuditEvent
}

export class ContactStore {
  constructor(private readonly adapter: DatabaseAdapter) {}

  async messageableNews(uid: string, at: string): Promise<{ uid: string; title: string; slug: string } | null> {
    const result = await this.adapter.execute(read(`SELECT uid, title, slug FROM news
      WHERE uid = ? AND visibility = 'public' AND allow_comments = 1
        AND published_at IS NOT NULL AND published_at <= ? LIMIT 1`, [uid, at]))
    const row = result.rows[0]
    return row ? { uid: String(row.uid), title: String(row.title), slug: String(row.slug) } : null
  }

  async create(input: PersistContactMessageInput): Promise<void> {
    const allowed = `(? = 1 OR COALESCE((
      SELECT allow_anonymous_messages FROM global_settings
      ORDER BY updated_at DESC, id DESC LIMIT 1
    ), 0) = 1) AND (? IS NULL OR EXISTS (
      SELECT 1 FROM news WHERE uid = ? AND visibility = 'public'
        AND allow_comments = 1 AND published_at IS NOT NULL AND published_at <= ?
    ))`
    const policyParams = [input.authenticated ? 1 : 0, input.newsUid ?? null, input.newsUid ?? null, input.at]
    const commands: SqlCommand[] = [
      // Use the same database-side policy predicate as the message insert. The
      // UID absence guard prevents an old colliding row from satisfying the
      // audit condition when anonymous messaging is disabled concurrently.
      buildAuditCommand({
        ...input.audit,
        condition: {
          sql: `${allowed} AND NOT EXISTS (SELECT 1 FROM messages WHERE uid = ?)`,
          params: [...policyParams, input.uid],
        },
      }),
      write(`INSERT INTO messages (
          uid, created_at, updated_at, name, email, message_type, subject,
          content, attachment_key, status, visibility
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'new', 'hidden'
        WHERE ${allowed}
        RETURNING uid`, [
        input.uid, input.at, input.at, input.name, input.email,
        input.messageType, input.subject, input.content,
        ...policyParams,
      ], true),
    ]
    try {
      const results = await this.adapter.batch(commands)
      if (results[1]?.rows.length !== 1) {
        throw new PublicInteractionError('INTERACTION_DISABLED', 'Messaging policy changed during submission')
      }
    }
    catch (error) {
      if (error instanceof PublicInteractionError) throw error
      if (error instanceof DatabaseError && (error.code === 'DB_UNIQUE' || error.code === 'DB_CONFLICT')) {
        throw new PublicInteractionError('INTERACTION_CONFLICT', 'Contact message identifier collision', { cause: error })
      }
      throw error
    }
  }
}

