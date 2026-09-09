import { z } from 'zod'
import { codePointLength, hasUnpairedSurrogate, utf8ByteLength } from '../utils/unicode'

function boundedText(minimumCodePoints: number, maximumCodePoints: number, maximumBytes: number) {
  return z.string()
    .refine((value: string) => !hasUnpairedSurrogate(value), 'Text contains an invalid surrogate')
    .refine((value: string) => codePointLength(value) >= minimumCodePoints, `Text must contain at least ${minimumCodePoints} character(s)`)
    .refine((value: string) => codePointLength(value) <= maximumCodePoints, `Text must contain no more than ${maximumCodePoints} characters`)
    .refine((value: string) => utf8ByteLength(value) <= maximumBytes, `Text must contain no more than ${maximumBytes} UTF-8 bytes`)
}

const username = boundedText(1, 150, 512)
const password = boundedText(1, 256, 1024)
const bootstrapUsername = boundedText(3, 64, 64)
  .refine((value: string) => /^[A-Za-z][A-Za-z0-9._-]{2,63}$/u.test(value), 'Username format is invalid')
const displayName = boundedText(1, 128, 512)
const email = boundedText(3, 320, 512)
  .refine((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value), 'Email format is invalid')

export const loginRequestSchema = z.object({ username, password }).strict()

export const bootstrapRequestSchema = z.object({
  username: bootstrapUsername,
  password: boundedText(6, 256, 1024),
  displayName: displayName.nullable().optional(),
  email: email.nullable().optional(),
}).strict()

export type LoginRequest = z.infer<typeof loginRequestSchema>
export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>
