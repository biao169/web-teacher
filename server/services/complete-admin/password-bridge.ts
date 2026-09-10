import { PasswordService } from '../../security/password'
import { isSecurityError } from '../../security/errors'
import { validateNewPassword } from '../../security/password-policy'

export async function hashAdminPassword(password: string, context: { username: string; displayName?: string; email?: string }): Promise<string> {
  try {
    const validated = await validateNewPassword(password, {
      username: context.username,
      additionalBlockedTerms: [context.displayName, context.email].filter((value): value is string => Boolean(value)),
    })
    return await new PasswordService().hash(validated.normalized)
  } catch (error) {
    if (isSecurityError(error)) throw new Error('PASSWORD_POLICY_REJECTED')
    throw error
  }
}
