import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { mapAdminError, readBoundedJson } from '~~/server/utils/complete-admin/api'
import { renderRichTextDocument, richTextMediaReferences } from '~~/shared/complete-admin/core.mjs'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { publicContentBlocks } from '~~/server/services/public/public-content-blocks'

export default defineEventHandler(async event => {
  try {
    const principal = await requireAdmin(event, ['news'], 'view', { write: true })
    const body = await readBoundedJson(event, 2 * 1024 * 1024) as Record<string, unknown>
    const source: string = renderRichTextDocument(body.document)
    const refs: Array<{ objectKey: string; kind: 'image' | 'pdf' }> = richTextMediaReferences(body.document)
    const keys = [...new Set(refs.map(ref => ref.objectKey))]
    const images = new Map<string, string>(), pdfs = new Map<string, string>()
    const media = new CompleteAdminMediaService(event, principal)
    for (let index = 0; index < keys.length; index += 25) {
      const result = await media.previewsByObjectKeys(keys.slice(index, index + 25)) as { items: Array<{ objectKey: string; uid: string; view: { available: boolean; kind?: string; url?: string } }> }
      for (const item of result.items) {
        if (!item.view.available || !item.view.url) continue
        if (item.view.kind === 'image') images.set(item.objectKey, item.view.url)
        if (item.view.kind === 'pdf') pdfs.set(item.objectKey, `/api/v1/admin/complete/media/${encodeURIComponent(item.uid)}/preview`)
      }
    }
    const block = publicContentBlocks(source, 'html', images, pdfs)[0]
    return { html: block?.type === 'rich' ? block.html : '' }
  } catch (error) { mapAdminError(event, error) }
})
