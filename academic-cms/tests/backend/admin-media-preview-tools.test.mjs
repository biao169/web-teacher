import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const read = path => readFile(resolve(root, path), 'utf8')

test('所有统一媒体字段均在选择器旁复用透明 contain 预览', async () => {
  const [renderer, preview, avatar, workspace, publicCss] = await Promise.all([
    read('app/components/admin/shared/AdminFieldRenderer.vue'),
    read('app/components/admin/shared/AdminMediaPreview.vue'),
    read('app/components/admin/shared/AdminListAvatar.vue'),
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    read('app/assets/public/base.css'),
  ])
  assert.match(renderer, /<AdminMediaPreview/u)
  assert.match(renderer, /mediaFallback/u)
  assert.match(preview, /object-fit:contain/u)
  assert.match(preview, /background:transparent/u)
  assert.match(preview, /preview-by-key/u)
  assert.match(preview, /object-position:center/u)
  assert.match(preview, /重新载入/u)
  assert.match(preview, /@loadedmetadata="mediaLoaded"/u)
  assert.match(avatar, /object-fit: contain/u)
  assert.match(avatar, /object-position: center/u)
  assert.doesNotMatch(avatar, /border-radius:\s*50%/u)
  assert.match(workspace, /previewFallback/u)
  assert.match(workspace, /refreshPreview/u)
  assert.match(workspace, /:expected="isPreviewable/u)
  assert.match(publicCss, /\.public-media img[^}]*object-fit: contain/u)
  assert.match(publicCss, /\.public-media img[^}]*object-position: center/u)
  assert.match(publicCss, /\.public-media[^}]*background: transparent/u)
  assert.doesNotMatch(publicCss, /\.public-news-card:hover \.public-news-card__media \.public-media[^}]*transform:\s*scale/u)
  assert.match(publicCss, /\.public-article-cover[^}]*background:\s*transparent/u)
})

test('媒体库为图片、视频和 PDF 生成内联预览授权', async () => {
  const service = await read('server/services/complete-admin/media-service.ts')
  const previewMethod = service.slice(service.indexOf('async previews('), service.indexOf('async previewsByObjectKeys('))
  assert.match(previewMethod, /startsWith\('image\/'\)/u)
  assert.match(previewMethod, /startsWith\('video\/'\)/u)
  assert.match(previewMethod, /application\/pdf/u)
  assert.match(previewMethod, /'inline'/u)
})

test('回收站使用仅管理员可访问的原对象预览且不再清空 src', async () => {
  const [workspace, route, mediaService] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    read('server/api/v1/admin/complete/media/[uid]/preview.get.ts'),
    read('server/services/media/media-service.ts'),
  ])
  assert.match(workspace, /adminPreviewUrl/u)
  assert.doesNotMatch(workspace, /row\.status === 'active' \? \(previewUrls\[row\.uid\]/u)
  assert.match(route, /requireAdmin/u)
  assert.match(route, /getHeader\(event, 'range'\)/u)
  assert.match(mediaService, /readForAdministration/u)
  assert.match(mediaService, /private, no-store/u)
  assert.match(mediaService, /content-range/u)
})

test('媒体库在界面与服务端两层阻止回收被引用媒体', async () => {
  const [workspace, service, endpoint] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    read('server/services/complete-admin/media-service.ts'),
    read('server/api/v1/admin/complete/media/usage-summary.get.ts'),
  ])
  assert.match(workspace, /usage-summary/u)
  assert.match(workspace, /:disabled="!canTrash/u)
  assert.match(workspace, /已被引用/u)
  assert.match(service, /async usageSummary/u)
  assert.match(service, /MEDIA_STILL_REFERENCED/u)
  assert.match(endpoint, /\.usageSummary/u)
})

test('媒体选择器支持本地上传、已有图片裁剪副本和锚点缩放', async () => {
  const [picker, cropper, geometry] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteMediaPicker.vue'),
    read('app/components/admin/complete/AdminCompleteImageCropper.client.vue'),
    read('app/admin/media-crop.ts'),
  ])
  assert.match(picker, /裁剪副本/u)
  assert.match(picker, /AdminCompleteImageCropper/u)
  assert.match(picker, /immediatePreviewFiles/u)
  assert.match(picker, /resolveUploadedPreview/u)
  assert.match(picker, /刚刚上传 · 已选中/u)
  assert.match(picker, /重新上传/u)
  assert.match(cropper, /@wheel\.prevent="wheel"/u)
  assert.match(cropper, /@pointerdown="pointerDown"/u)
  assert.match(cropper, /ADMIN_CROP_PRESETS/u)
  assert.match(geometry, /focus\.x/u)
})

test('媒体库与字段选择器复用同一上传服务和上传结果模型', async () => {
  const [workspace, picker, upload, result] = await Promise.all([
    read('app/components/admin/complete/AdminCompleteMediaWorkspace.vue'),
    read('app/components/admin/complete/AdminCompleteMediaPicker.vue'),
    read('app/composables/useAdminMediaUpload.ts'),
    read('app/admin/media-upload.ts'),
  ])
  assert.match(workspace, /useAdminMediaUpload/u)
  assert.match(workspace, /adminUploadedMediaRow/u)
  assert.match(workspace, /immediatePreviewFiles/u)
  assert.doesNotMatch(workspace, /readCsrfCookie/u)
  assert.match(picker, /useAdminMediaUpload/u)
  assert.match(upload, /AdminUploadedMedia/u)
  assert.match(result, /object_key: media\.objectKey/u)
})

test('新闻列表为已发布记录提供新标签前台查阅', async () => {
  const source = await read('app/components/admin/complete/AdminCompleteResourceWorkspace.vue')
  assert.match(source, /前台查阅/u)
  assert.match(source, /\/zh\/news\//u)
  assert.match(source, /window\.open\(path, '_blank', 'noopener,noreferrer'\)/u)
})
