import { z } from 'zod'
import { CONTACT_MESSAGE_TYPES } from '../contracts/interactions'
import { codePointLength, hasUnpairedSurrogate, utf8ByteLength } from '../utils/unicode'

function boundedText(minimumCodePoints: number, maximumCodePoints: number, maximumBytes: number) {
  return z.string()
    .refine((value: string) => !hasUnpairedSurrogate(value), 'Text contains an invalid surrogate')
    .refine((value: string) => codePointLength(value) >= minimumCodePoints, `Text must contain at least ${minimumCodePoints} character(s)`)
    .refine((value: string) => codePointLength(value) <= maximumCodePoints, `Text must contain no more than ${maximumCodePoints} characters`)
    .refine((value: string) => utf8ByteLength(value) <= maximumBytes, `Text must contain no more than ${maximumBytes} UTF-8 bytes`)
}

const optionalDisplayName = boundedText(1, 128, 512).nullable().optional()
const optionalEmail = boundedText(3, 320, 512)
  .refine((value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value), 'Email format is invalid')
  .nullable()
  .optional()

export const registrationRequestSchema = z.object({
  username: boundedText(3, 64, 64)
    .refine((value: string) => /^[A-Za-z][A-Za-z0-9._-]{2,63}$/u.test(value), 'Username format is invalid'),
  password: boundedText(6, 256, 1024),
  displayName: optionalDisplayName,
  email: optionalEmail,
}).strict()

export const passwordChangeRequestSchema = z.object({
  currentPassword: boundedText(1, 256, 1024),
  newPassword: boundedText(6, 256, 1024),
}).strict()

export const emptyObjectSchema = z.object({}).strict()

export const contactMessageRequestSchema = z.object({
  newsUid: boundedText(1, 128, 512).nullable().optional(),
  name: boundedText(1, 120, 480).nullable().optional(),
  email: optionalEmail,
  messageType: z.enum(CONTACT_MESSAGE_TYPES),
  subject: boundedText(3, 200, 800),
  content: boundedText(20, 10_000, 40_000),
  website: boundedText(0, 500, 2_000).nullable().optional(),
}).strict()
