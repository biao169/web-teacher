declare const process: { env: Record<string, string | undefined> }

declare module 'h3' {
  export interface H3EventContext extends Record<string, unknown> {
    requestId: string
    authRuntime?: any
    authSessionPromise?: Promise<any>
    authSession?: any
    mediaRuntime?: {
      config: import('../../server/media/config').MediaRuntimeConfig
      service: import('../../server/services/media/media-service').MediaService
    }
    cloudflare?: { env?: Record<string, unknown>; context?: { waitUntil?: (task: Promise<unknown>) => void } }
  }
  export interface H3Event {
    method: string
    path: string
    context: H3EventContext
    node: { req: { socket?: { remoteAddress?: string } } }
    waitUntil(task: Promise<unknown>): void
  }
  export type EventHandler<T = unknown> = (event: H3Event) => T | Promise<T>
  export function defineEventHandler<T>(handler: EventHandler<T>): EventHandler<T>
  export function getCookie(event: H3Event, name: string): string | undefined
  export function getHeader(event: H3Event, name: string): string | undefined
  export function getRequestURL(event: H3Event): URL
  export function getRequestWebStream(event: H3Event): ReadableStream<Uint8Array> | undefined
  export function setCookie(event: H3Event, name: string, value: string, options?: object): void
  export function deleteCookie(event: H3Event, name: string, options?: object): void
  export function setHeader(event: H3Event, name: string, value: string | number): void
  export function setResponseHeaders(event: H3Event, headers: Readonly<Record<string, string>>): void
  export function setResponseStatus(event: H3Event, status: number): void
}

declare module '#imports' {
  import type { H3Event } from 'h3'
  export function useRuntimeConfig(event?: H3Event): Record<string, unknown>
}

declare module '#database-platform' {
  export function getPlatformDatabase(event: unknown): any
}

declare module '#media-platform' {
  import type { H3Event } from 'h3'
  import type { MediaRuntimeConfig } from '../../server/media/config'
  import type { MediaStoreSet } from '../../server/services/media/media-service'
  export function getPlatformMediaStores(event: H3Event, config: MediaRuntimeConfig): MediaStoreSet
}

declare module 'zod' {
  export class ZodError extends Error {}
  export const z: any
  export namespace z { type infer<T> = T extends { _output: infer O } ? O : unknown }
}

declare function defineEventHandler<T>(handler: import('h3').EventHandler<T>): import('h3').EventHandler<T>
declare function useRuntimeConfig(event?: import('h3').H3Event): Record<string, unknown>
