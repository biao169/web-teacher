declare const process: { env: Record<string, string | undefined>; version: string }

declare module 'node:crypto' {
  export function createHash(name: string): { update(value: Uint8Array | string): void; digest(encoding: 'hex'): string }
  export function randomUUID(): string
}
declare module 'node:fs' {
  export const constants: {
    O_RDONLY: number
    O_CREAT: number
    O_EXCL: number
    O_WRONLY: number
    O_NOFOLLOW?: number
  }
}
declare module 'node:fs/promises' {
  export const link: any
  export const lstat: any
  export const mkdir: any
  export const open: any
  export const realpath: any
  export const rename: any
  export const stat: any
  export const unlink: any
}
declare module 'node:path' {
  export const dirname: any
  export const parse: any
  export const relative: any
  export const resolve: any
  export const sep: string
}
