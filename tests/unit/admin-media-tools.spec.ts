import { describe, expect, it } from 'vitest'
import { adminCropFocusAtPoint, adminCropRect } from '../../app/admin/media-crop'
import { adminMediaFieldFallback, mediaCategoryFallback, mediaSurnameFallback } from '../../app/utils/media-fallback'

describe('admin media crop geometry', () => {
  it('fits common ratios inside the source and clamps the selected focus', () => {
    expect(adminCropRect(1000, 2000, 1, 1, { x: .5, y: .5 })).toEqual({ x: 0, y: 500, width: 1000, height: 1000 })
    expect(adminCropRect(1000, 2000, 1, 1, { x: .9, y: .9 })).toEqual({ x: 0, y: 1000, width: 1000, height: 1000 })
  })

  it('keeps the same source anchor while zoom changes the crop size', () => {
    const normal = adminCropRect(2000, 1200, 1, 1, { x: .6, y: .5 })
    const zoomed = adminCropRect(2000, 1200, 1, 2, { x: .6, y: .5 })
    expect(normal.x + normal.width / 2).toBe(1200)
    expect(zoomed.x + zoomed.width / 2).toBe(1200)
    expect(zoomed.width).toBe(normal.width / 2)
  })

  it('maps a click in the preview back to a stable source focus', () => {
    const crop = adminCropRect(1600, 1200, 4 / 3, 1, { x: .5, y: .5 })
    expect(adminCropFocusAtPoint(crop, 1600, 1200, 600, 300, 800, 600)).toEqual({ x: .75, y: .5 })
  })
})

describe('media text fallbacks', () => {
  it('uses Chinese compound surnames and English family names', () => {
    expect(mediaSurnameFallback('欧阳修')).toBe('欧阳')
    expect(mediaSurnameFallback('Ada Lovelace')).toBe('Lovelace')
  })

  it('uses a bounded first category and editor-aware labels', () => {
    expect(mediaCategoryFallback('科研进展通知；其他')).toBe('科研进展')
    expect(mediaCategoryFallback('Lab updates; Other')).toBe('Lab updates')
    expect(adminMediaFieldFallback('news', 'cover_key', { category: '团队活动；会议' })).toBe('团队活动')
    expect(adminMediaFieldFallback('students', 'avatar_key', { name_en: 'Grace Hopper' })).toBe('Hopper')
  })
})
