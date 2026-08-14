# 从 Django 站点迁移到 web02 的建议流程

## 本地阶段

当前阶段先不强制接 Cloudflare R2/D1：

- 数据库结构使用 `migrations/0001_initial.sql`，兼容 D1，也可用于本地 SQLite。
- 本地媒体先放在 `public/media/` 目录，数据库中的 `*_key` 和 `media_assets.object_key` 记录相对路径，例如 `profile/avatar.jpg`。
- `media/` 目录保留为从旧 Django 项目拷贝文件的暂存区；确认路径后再移动到 `public/media/` 或上传 R2。
- 前台 `mediaUrl()` 默认生成 `/media/<key>`。本地由 Workers Static Assets 读取 `public/media/`；部署后该路径由 Worker/R2 接管，或通过 `PUBLIC_MEDIA_BASE_URL` 指向 R2 公开域名。

## Cloudflare 部署阶段

- D1：执行 `wrangler d1 migrations apply teacher_site --remote`。
- R2：创建 `teacher-site-media`，上传 `public/media/` 内容到同名 key。
- 环境变量：
  - `ADMIN_EMAILS`：允许访问后台的 Cloudflare Access 邮箱，逗号分隔。
  - `PUBLIC_MEDIA_BASE_URL`：如 R2 使用自定义公开域名，可填该域名；否则 `/media/*` 由 Worker 代理。
  - `LOCAL_ADMIN_TOKEN`：仅本地调试使用，生产环境留空。

## 已覆盖的原站功能

- 公开页面：首页、团队、论文、项目、专利、学生、课程、新闻、留言。
- 内容模型：站点设置、全局设置、导航、教师、研究方向、论文、项目、专利、学生、新闻、课程、留言、媒体、翻译缓存、自动补全日志。
- 后台：通用列表、新增、编辑、媒体上传入口。
- 辅助功能：字段历史值提示、论文引用复制、留言蜜罐、R2 媒体接口。

## 后续仍需细化的功能

- 完整富文本新闻编辑器：当前 Cloudflare 版为安全文本渲染，PDF 链接会转换为受控 PDF 区块；没有直接执行原始 HTML。
- 图片裁剪和压缩：Cloudflare Worker 可接收文件并写入 R2，但浏览器端裁剪 UI 尚未完整复刻。
- Crossref/OpenAlex 一键补全：当前只生成外部查询 URL 和手动应用表单，避免默认外传站点数据。
- Excel 导入导出：当前先提供 CSV 导入导出；如需 `.xlsx`，建议在本地迁移工具侧生成，Workers 中保持轻量。
- 评论审核后台批量操作：当前可在通用后台编辑 `news_comments`，批量审核按钮可继续补。
- 翻译缓存：当前支持扫描和手动写入；自动翻译需明确授权外部服务后再启用。
