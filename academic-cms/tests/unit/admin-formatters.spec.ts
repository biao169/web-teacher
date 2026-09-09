import { describe, expect, it } from 'vitest'
import { adminStatusTagType, formatAdminBoolean, formatAdminDate, formatAdminDateTime, formatAdminListValue } from '../../app/admin/formatters'
import { adminActionColumnLayout, adminActionColumnWidth, adminActionGridColumns, adminBooleanValue, adminColumnDefaultWidth, adminColumnOptionLabel, adminColumnOptionTone, adminOptionTone, adminOptionsWithTones } from '../../app/admin/unified-list'
import { adminAvatarInitials } from '../../app/admin/list-avatar'

describe('admin shared formatters', () => {
  it('formats dates and datetimes through one stable entry point', () => {
    expect(formatAdminDate('2026-09-04')).toBe('2026/9/4')
    expect(formatAdminDateTime('2026-09-04T01:02:03.000Z')).toBe('2026年9月4日 01:02')
    expect(formatAdminDateTime('invalid')).toBe('—')
  })

  it('normalizes booleans, list values and status colors', () => {
    expect(formatAdminBoolean(1)).toBe('是')
    expect(formatAdminBoolean('false')).toBe('否')
    expect(formatAdminListValue(null)).toBe('—')
    expect(adminStatusTagType('active')).toBe('success')
    expect(adminStatusTagType('locked')).toBe('danger')
  })

  it('assigns centralized tones and labels to boolean and enum options', () => {
    expect(adminBooleanValue('true')).toBe(true)
    expect(adminBooleanValue(0)).toBe(false)
    expect(adminBooleanValue('unknown')).toBeNull()
    expect(adminOptionTone(false, 'boolean')).toBe('danger')
    expect(adminOptionTone('staff', 'visibility')).toBe('primary')
    expect(adminOptionTone('pending', 'status')).toBe('warning')
    expect(adminOptionTone('unexpected', 'status')).toBe('info')
    expect(adminOptionTone('unexpected', 'text')).toBeUndefined()

    const options = adminOptionsWithTones([{ value: 'public', label: '公开' }, { value: 'hidden', label: '隐藏' }], 'visibility')
    const column = { kind: 'visibility' as const, options }
    expect(adminColumnOptionLabel(column, 'public')).toBe('公开')
    expect(adminColumnOptionTone(column, 'public')).toBe('success')
    expect(adminColumnOptionTone({ kind: 'boolean', options: [{ value: 0, label: '正常', tone: 'success' }] }, 0)).toBe('success')
  })

  it('sizes table columns from their content kind and visible labels', () => {
    const narrow = adminColumnDefaultWidth({ key: 'status', label: '状态', kind: 'status' })
    const wider = adminColumnDefaultWidth({ key: 'description', label: '功能介绍说明', kind: 'long-text', twoLine: true })
    expect(narrow).toBe(108)
    expect(wider).toBeGreaterThan(narrow)
    expect(wider).toBeLessThanOrEqual(250)
  })

  it('keeps standard actions on one row and wraps only a content-wide action set', () => {
    expect(adminActionGridColumns(1)).toBe(1)
    expect(adminActionGridColumns(2)).toBe(2)
    expect(adminActionGridColumns(3)).toBe(3)
    expect(adminActionGridColumns(5)).toBe(3)
    expect(adminActionColumnWidth(['编辑'])).toBe(72)
    expect(adminActionColumnLayout(['编辑', '删除'])).toMatchObject({ columns: 2, rows: 1 })
    expect(adminActionColumnLayout(['编辑', '会话', '重置密码'])).toMatchObject({ columns: 3, rows: 1 })
    expect(adminActionColumnLayout(['编辑', '查看', '复制', '重试'])).toMatchObject({ columns: 4, rows: 1 })
    expect(adminActionColumnLayout(['预览', '编辑信息', '使用位置', '校验', '更多'])).toMatchObject({ columns: 3, rows: 2 })
    expect(adminActionColumnWidth(['预览', '编辑信息', '使用位置', '校验', '更多'])).toBeGreaterThan(200)
    expect(adminActionColumnWidth(['预览', '编辑信息', '使用位置', '校验', '更多'])).toBeLessThanOrEqual(280)
  })

  it('creates stable avatar initials for Chinese and spaced names', () => {
    expect(adminAvatarInitials('林知远')).toBe('林知')
    expect(adminAvatarInitials('Demo Student')).toBe('DS')
    expect(adminAvatarInitials('  Ada   Lovelace  ')).toBe('AL')
    expect(adminAvatarInitials(null)).toBe('?')
  })
})
