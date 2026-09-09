declare module 'h3' {
  export interface H3Error extends Error { statusCode: number; statusMessage?: string }
  export function createError(input: { statusCode: number; statusMessage?: string; message?: string }): H3Error
}
