# server/api/v1/admin/complete/news/rich-text-preview.post.ts

## 文件定位

- **源码路径**：`server/api/v1/admin/complete/news/rich-text-preview.post.ts`
- **功能定位**：鉴权并校验CSRF后通过白名单渲染正文，按当前媒体权限投影图片和PDF预览引用，不返回任意嵌入HTML。
- **规模**：27 行，1822 字节
- **内容校验**：SHA-256 `e4f3b2c2b492308d4ba042110766a77d766a8ed3d30267d9a5a4133a9f383c5b`

## 使用与维护

鉴权并校验CSRF后通过白名单渲染正文，按当前媒体权限投影图片和PDF预览引用，不返回任意嵌入HTML。

## 直接依赖

- `~~/server/utils/complete-admin/auth`
- `~~/server/utils/complete-admin/api`
- `~~/shared/complete-admin/core.mjs`
- `~~/server/services/complete-admin/media-service`
- `~~/server/services/public/public-content-blocks`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
