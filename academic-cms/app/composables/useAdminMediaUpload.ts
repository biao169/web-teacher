import type { AdminUploadedMedia } from '~/admin/media-upload'

interface AdminMediaUploadOptions {
  uid: string
  title?: string
  category?: string
}

export function useAdminMediaUpload() {
  const { csrfTokenForWrite } = useCompleteAdminApi()

  async function uploadAdminMedia(file: File, options: AdminMediaUploadOptions): Promise<AdminUploadedMedia> {
    const csrf = await csrfTokenForWrite()
    if (!csrf) throw new Error('安全令牌缺失，请刷新页面')
    const title = options.title?.trim() || file.name
    const query = new URLSearchParams({
      uid: options.uid,
      filename: file.name,
      title,
      category: options.category?.trim() || 'admin',
    })
    const response = await fetch(`/api/v1/admin/complete/media/upload?${query.toString()}`, {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': file.type || 'application/octet-stream', 'x-csrf-token': csrf },
      body: file,
    })
    const payload = await response.json() as { media?: AdminUploadedMedia; data?: { error?: { message?: string } }; error?: { message?: string } }
    if (!response.ok || !payload.media?.objectKey) throw new Error(payload.data?.error?.message ?? payload.error?.message ?? '上传失败')
    return payload.media
  }

  return { uploadAdminMedia }
}
