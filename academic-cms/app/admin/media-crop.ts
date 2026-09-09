export interface AdminCropRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface AdminCropFocus {
  readonly x: number
  readonly y: number
}

export interface AdminCropPreset {
  readonly key: string
  readonly label: string
  readonly ratio: number | null
  readonly width: number
  readonly height: number
}

export const ADMIN_CROP_PRESETS: readonly AdminCropPreset[] = Object.freeze([
  { key: 'original', label: '原比例', ratio: null, width: 1600, height: 1200 },
  { key: 'square', label: '1:1', ratio: 1, width: 1200, height: 1200 },
  { key: 'landscape-4-3', label: '4:3', ratio: 4 / 3, width: 1600, height: 1200 },
  { key: 'portrait-3-4', label: '3:4', ratio: 3 / 4, width: 1200, height: 1600 },
  { key: 'wide-16-9', label: '16:9', ratio: 16 / 9, width: 1920, height: 1080 },
  { key: 'vertical-9-16', label: '9:16', ratio: 9 / 16, width: 1080, height: 1920 },
])

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function adminCropRect(
  imageWidth: number,
  imageHeight: number,
  targetRatio: number,
  zoom: number,
  focus: AdminCropFocus,
): AdminCropRect {
  if (![imageWidth, imageHeight, targetRatio, zoom].every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0 || targetRatio <= 0 || zoom < 1) {
    throw new Error('INVALID_CROP_GEOMETRY')
  }
  let width = imageWidth
  let height = imageHeight
  if (imageWidth / imageHeight > targetRatio) width = imageHeight * targetRatio
  else height = imageWidth / targetRatio
  width /= zoom
  height /= zoom
  const centerX = bounded(bounded(focus.x, 0, 1) * imageWidth, width / 2, imageWidth - width / 2)
  const centerY = bounded(bounded(focus.y, 0, 1) * imageHeight, height / 2, imageHeight - height / 2)
  return { x: centerX - width / 2, y: centerY - height / 2, width, height }
}

export function adminCropFocusAtPoint(
  rect: AdminCropRect,
  imageWidth: number,
  imageHeight: number,
  canvasX: number,
  canvasY: number,
  canvasWidth: number,
  canvasHeight: number,
): AdminCropFocus {
  if (canvasWidth <= 0 || canvasHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return { x: .5, y: .5 }
  const sourceX = rect.x + bounded(canvasX / canvasWidth, 0, 1) * rect.width
  const sourceY = rect.y + bounded(canvasY / canvasHeight, 0, 1) * rect.height
  return { x: bounded(sourceX / imageWidth, 0, 1), y: bounded(sourceY / imageHeight, 0, 1) }
}
