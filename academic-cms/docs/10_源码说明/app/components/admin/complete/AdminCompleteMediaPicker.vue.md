# app/components/admin/complete/AdminCompleteMediaPicker.vue

## 文件定位

- **源码路径**：`app/components/admin/complete/AdminCompleteMediaPicker.vue`
- **功能定位**：后台媒体选择、预览和上传；缩小卡片间距与预览高度，底部信息区排列两行标题、类型大小及操作，保留原选择与上传流程。
- **规模**：194 行，14726 字节
- **内容校验**：SHA-256 `6160f040d0cf626b7b8a981bf5247a301eccb3ddb03707ff042f125a7b87a9f4`

## 使用与维护

后台媒体选择、预览和上传；缩小卡片间距与预览高度，底部信息区排列两行标题、类型大小及操作，保留原选择与上传流程。

命名函数：`accepted`、`load`、`choose`、`triggerUpload`、`close`、`resolveUploadedPreview`、`uploadFile`、`selectUpload`、`useCropResult`、`useOriginal`、`editCopy`。

## 直接依赖

- `element-plus`
- `~/admin/media-upload`
- `~/admin/media`
- `~/admin/errors`
- `~/composables/useLatestRequest`
- `~~/shared/admin/registry`
- `~~/shared/admin/identity`
- `../shared/AdminCheckedFormItem.vue`
- `../shared/AdminMediaPreview.vue`
- `./AdminCompleteImageCropper.client.vue`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
