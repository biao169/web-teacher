const COMPOUND_SURNAMES = [
  '欧阳', '太史', '端木', '上官', '司马', '东方', '独孤', '南宫', '万俟', '闻人',
  '夏侯', '诸葛', '尉迟', '公羊', '赫连', '澹台', '皇甫', '宗政', '濮阳', '公冶',
] as const

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : ''
}

function clipped(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('')
}

/** Returns a compact, language-aware surname for media fallbacks. */
export function mediaSurnameFallback(value: unknown): string {
  const name = text(value)
  if (!name) return ''
  if (/\p{Script=Han}/u.test(name)) {
    const compact = name.replace(/\s+/gu, '')
    return COMPOUND_SURNAMES.find(surname => compact.startsWith(surname)) ?? clipped(compact, 1)
  }
  const words = name.split(' ').filter(Boolean)
  return clipped(words.at(-1) ?? name, 8)
}

/** First category token, kept deliberately short for an empty cover placeholder. */
export function mediaCategoryFallback(value: unknown): string {
  const category = text(value).split(/[;；,，]/u)[0]?.trim() ?? ''
  if (!category) return ''
  if (/\p{Script=Han}/u.test(category)) return clipped(category, 4)
  return category.split(/\s+/u).slice(0, 2).join(' ')
}

export function adminMediaFieldFallback(
  module: string,
  field: string,
  record: Readonly<Record<string, unknown>>,
): string {
  if (field === 'avatar_key' && (module === 'profiles' || module === 'students')) {
    return mediaSurnameFallback(record.name) || mediaSurnameFallback(record.name_en) || (module === 'profiles' ? '教师' : '学生')
  }
  if (field === 'cover_key' && module === 'news') return mediaCategoryFallback(record.category) || '动态'
  if (field === 'logo_key') return '标识'
  if (field === 'favicon_key') return '图标'
  if (field === 'og_image_key') return '分享图'
  if (field === 'pdf_key') return 'PDF'
  if (field === 'certificate_key') return '证书'
  if (field === 'syllabus_key') return '大纲'
  if (field === 'material_key') return '资料'
  return '暂无媒体'
}
