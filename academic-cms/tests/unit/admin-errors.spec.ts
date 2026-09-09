import { describe, expect, it } from 'vitest'
import { adminErrorDetails, adminErrorMessage } from '../../app/admin/errors'

describe('admin error details', () => {
  it('unwraps an H3 permission error without treating it as a generic server failure', () => {
    const detail = adminErrorDetails({
      statusCode: 403,
      data: {
        error: true,
        statusCode: 403,
        data: { error: { code: 'PERMISSION_DENIED', message: '没有执行此操作的权限', requestId: 'request-403' } },
      },
    })
    expect(detail).toEqual({ status: 403, code: 'PERMISSION_DENIED', message: '没有执行此操作的权限', requestId: 'request-403', fieldErrors: {} })
  })

  it('keeps a genuine server fault as a server fault', () => {
    const detail = adminErrorDetails({ statusCode: 500, data: { error: { code: 'AUTH_CONFIG', message: '服务器安全配置无效。' } } })
    expect(detail.status).toBe(500)
    expect(detail.code).toBe('AUTH_CONFIG')
  })

  it('preserves local upload explanations and prioritizes structured API messages', () => {
    expect(adminErrorMessage(new Error('文件类型不符合当前字段要求'), '上传失败')).toBe('文件类型不符合当前字段要求')
    expect(adminErrorMessage({ message: 'arbitrary object', data: { error: { message: '媒体仍被引用' } } }, '操作失败')).toBe('媒体仍被引用')
    expect(adminErrorMessage(null, '操作失败')).toBe('操作失败')
  })
})
