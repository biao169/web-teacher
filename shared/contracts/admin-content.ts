import type { AdminContentModule, AdminContentPermissions, AdminContentValue, AdminContentValues } from '../admin/content-modules'
import type { MediaViewModel } from './media'

export interface AdminFacetOption {
  readonly value: string
  readonly label: string
  readonly count: number | null
}

export interface AdminContentListItem {
  readonly uid: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly values: AdminContentValues
  /** Safely projected media keyed by the source column name. Raw storage details never appear here. */
  readonly media?: Readonly<Record<string, MediaViewModel>>
}

export interface AdminContentListView {
  readonly module: AdminContentModule
  readonly items: readonly AdminContentListItem[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly hasMore: boolean
  readonly facets: Readonly<Record<string, readonly AdminFacetOption[]>>
  readonly permissions: AdminContentPermissions
}

export interface AdminContentDetailView {
  readonly module: AdminContentModule
  readonly uid: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly values: AdminContentValues
  readonly permissions: AdminContentPermissions
}

export interface AdminContentMutationBody {
  readonly uid?: string
  readonly values: Readonly<Record<string, unknown>>
  readonly expectedUpdatedAt?: string
}

export interface AdminContentDeleteBody {
  readonly expectedUpdatedAt: string
}

export interface AdminContentBatchBody {
  readonly uids: readonly string[]
  readonly expectedUpdatedAtByUid: Readonly<Record<string, string>>
  readonly values: Readonly<Record<string, unknown>>
}

export interface AdminContentMutationView {
  readonly record: AdminContentDetailView
  readonly message: string
}

export interface AdminContentDeleteView {
  readonly uid: string
  readonly deleted: true
  readonly message: string
}

export interface AdminContentBatchView {
  readonly updated: number
  readonly message: string
}

export interface AdminFieldValidationErrors { readonly [field: string]: string }

export function isAdminContentValue(value: unknown): value is AdminContentValue {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}
