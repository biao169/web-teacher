import type { H3Event } from 'h3'
import type { AdminContentModuleDefinition, AdminContentValue, AdminListColumn } from '../../../shared/admin/content-modules'
import type { AdminContentListItem, AdminContentListView } from '../../../shared/contracts/admin-content'
import type { MediaProjectionRequest, MediaViewModel } from '../../../shared/contracts/media'
import { isVisibilityScope, type VisibilityScope } from '../../../shared/enums/auth'
import type { AuthenticatedPrincipal } from '../../security/permissions'
import { useMediaRuntime } from '../../utils/media-runtime'
import { AdminContentError } from './content-errors'

function mediaColumns(definition: AdminContentModuleDefinition): readonly AdminListColumn[] {
  return definition.columns.filter(column => column.kind === 'image' && column.media)
}

function nullableText(value: AdminContentValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function visibility(item: AdminContentListItem): VisibilityScope {
  const value = item.values.visibility
  return isVisibilityScope(value) ? value : 'hidden'
}

function requestFor(definition: AdminContentModuleDefinition, item: AdminContentListItem, column: AdminListColumn): MediaProjectionRequest {
  const media = column.media
  if (!media) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', `Image column is missing media metadata: ${column.field}`)
  return {
    objectKey: nullableText(item.values[column.field]),
    module: definition.module,
    recordUid: item.uid,
    visibility: visibility(item),
    purpose: media.purpose,
    referenceRevision: item.updatedAt,
    alt: nullableText(item.values[media.altField]),
    width: media.width,
    height: media.height,
    disposition: 'inline',
    allowDownload: false,
    fallback: media.fallback,
  }
}

/**
 * Adds signed, permission-aware media views to one content page in a single
 * catalog projection. The caller has already authorized the parent records.
 */
export async function projectAdminContentListMedia(
  event: H3Event,
  definition: AdminContentModuleDefinition,
  view: AdminContentListView,
  principal: AuthenticatedPrincipal,
): Promise<AdminContentListView> {
  const columns = mediaColumns(definition)
  if (!columns.length || !view.items.length) return view
  const requests = view.items.flatMap(item => columns.map(column => requestFor(definition, item, column)))
  const projected = await useMediaRuntime(event).service.project(requests, principal)
  if (projected.length !== requests.length) throw new AdminContentError('ADMIN_CONTENT_PROTOCOL', 'Admin list media projection is incomplete')

  const items = view.items.map((item, itemIndex): AdminContentListItem => {
    const media: Record<string, MediaViewModel> = Object.create(null) as Record<string, MediaViewModel>
    columns.forEach((column, columnIndex) => {
      media[column.field] = projected[(itemIndex * columns.length) + columnIndex]!
    })
    return Object.freeze({ ...item, media: Object.freeze(media) })
  })
  return Object.freeze({ ...view, items: Object.freeze(items) })
}
