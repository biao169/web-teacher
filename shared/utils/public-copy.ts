import { formatProjectAmount } from './project-amount'
import type { PublicSelectableModule, PublicSelectionItem } from '../contracts/public-selection'
import type { PublicSiteLocale } from '../contracts/public-site'
import type { PublicCitationStyle } from '../contracts/public-citation'
import { publicCitationSegments, validPublicCitation } from './public-citation'

export type PublicCopyPayload = { text: string; html: string }
const escape = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/'/gu, '&#39;').replace(/\r?\n/gu, '<br>')
type Field = [key: string, zh?: string, en?: string]
const fields: Record<Exclude<PublicSelectableModule, 'publications'>, Field[]> = {
  projects: [['source'], ['fundName'], ['name'], ['projectNumber', '项目编号', 'Project number'], ['principal', '负责人', 'Principal'], ['role', '承担角色', 'Role'], ['periodLabel', '起止时间', 'Period'], ['status', '状态', 'Status'], ['amount', '经费', 'Funding']],
  patents: [['name'], ['country', '国家/地区', 'Country/region'], ['patentType', '类型', 'Type'], ['inventors', '发明人', 'Inventors'], ['applicationNumber', '申请号', 'Application number'], ['grantNumber', '授权号', 'Grant number'], ['applicationDate', '申请日期', 'Application date'], ['grantDate', '授权日期', 'Grant date'], ['legalStatus', '法律状态', 'Legal status']],
  students: [['name'], ['degree', '学位', 'Degree'], ['category', '类别', 'Category'], ['grade', '年级', 'Grade'], ['direction', '方向', 'Research area'], ['status', '状态', 'Status'], ['biography']],
  research: [['name'], ['description']],
  courses: [['name'], ['semester', '学期', 'Semester'], ['audience', '授课对象', 'Audience'], ['summary']],
}
export function serializePublicCopy(module: PublicSelectableModule, locale: PublicSiteLocale, items: readonly PublicSelectionItem[], includeNumbers = false, style?: PublicCitationStyle): PublicCopyPayload {
  if (!items.length || items.length > 200) throw new Error('selection')
  const paragraphs = [...items].sort((a, b) => b.displayNumber - a.displayNumber).map(item => {
    let text: string, html: string
    if (module === 'publications') {
      if (!style || !('citation' in item) || !validPublicCitation(item.citation, style) || item.citation?.status === 'missing') throw new Error('citation')
      const segments = publicCitationSegments(item.citation!)
      text = segments.map(segment => segment.text).join('')
      html = segments.map(segment => segment.highlighted ? `<span style="text-decoration: underline; font-weight: 600;">${escape(segment.text)}</span>` : escape(segment.text)).join('')
    } else {
      const values = item as unknown as Record<string, unknown>
      const parts = fields[module].flatMap(([key, zh, en]) => {
        let value = values[key]
        if (module === 'projects' && key === 'amount') value = formatProjectAmount(typeof value === 'string' ? value : null, locale)
        if (module === 'projects' && key === 'periodLabel' && !value) value = [values.startDate, values.endDate].filter(Boolean).join('—')
        if (typeof value !== 'string' || !value.trim()) return []
        return [{ value: (zh ? `${locale === 'zh' ? zh : en}${locale === 'zh' ? '：' : ': '}` : '') + value, strong: module === 'projects' && (key === 'source' || key === 'fundName') }]
      })
      const separator = locale === 'zh' ? '；' : '; '
      text = parts.map(part => part.value).join(separator)
      html = parts.map(part => part.strong ? `<strong>${escape(part.value)}</strong>` : escape(part.value)).join(separator)
    }
    if (includeNumbers) { text = `${item.displayNumber}. ${text}`; html = `${item.displayNumber}. ${html}` }
    return { text, html: `<p>${html}</p>` }
  })
  const payload = { text: paragraphs.map(item => item.text).join('\n\n'), html: paragraphs.map(item => item.html).join('\n') }
  if (new TextEncoder().encode(payload.text + payload.html).byteLength > 16_000_000) throw new Error('size')
  return payload
}
