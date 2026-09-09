import { describe, expect, it } from 'vitest'
import {
  completedAdminSuggestionTokens,
  currentAdminSuggestionToken,
  normalizeAdminSuggestionKey,
  replaceCurrentAdminSuggestionToken,
  splitAdminSuggestionValue,
} from '../../shared/admin/suggestion-tools'

describe('admin historical-value suggestion tools', () => {
  it('splits multiple values only on Chinese or English semicolons and line breaks', () => {
    expect(splitAdminSuggestionValue('期刊；会议; 预印本\n书籍章节', true)).toEqual(['期刊', '会议', '预印本', '书籍章节'])
    expect(splitAdminSuggestionValue('Doe, Jane; Zhang, San', true)).toEqual(['Doe, Jane', 'Zhang, San'])
  })

  it('preserves commas in single-value journal and organization names', () => {
    expect(splitAdminSuggestionValue('Journal of Tests, Part A', false)).toEqual(['Journal of Tests, Part A'])
  })

  it('filters by the current token and replaces only that token', () => {
    expect(currentAdminSuggestionToken('期刊；会', true)).toBe('会')
    expect(completedAdminSuggestionTokens('期刊；会', true)).toEqual(['期刊'])
    expect(replaceCurrentAdminSuggestionToken('期刊；会', '会议', true)).toBe('期刊；会议')
    expect(replaceCurrentAdminSuggestionToken('旧期刊', '新期刊', false)).toBe('新期刊')
  })

  it('deduplicates keys across case and full-width variants', () => {
    expect(normalizeAdminSuggestionKey(' ＩＥＥＥ ')).toBe(normalizeAdminSuggestionKey('ieee'))
  })
})
