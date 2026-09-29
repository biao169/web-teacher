# 第一步：新闻详情封面（v0.15.115）

详情标题、发布日期和链接之后，正文之前显示配置的封面。未配置或已回收封面不保留空白区域；加载失败显示简短提示。正文中原有图片保持不变，PDF 水印与下载设置沿用原实现。

共用 news-media.html 组件增加 detail、lang 参数；列表保留紧凑占位，详情图片首屏加载、完整居中，最大高度为 60vh / 520px 的较小值。允许 JPEG/PNG/GIF/WebP 图片以及 MP4/WebM 视频。视频有控制栏且不自动播放；列表 preload=none，详情 preload=metadata，不主动读取整段视频。实际视频能否解码仍取决于浏览器支持的编码。

媒体 MIME 信息复用 public_media_map 已有批量查询，不增加逐条查询。头像和正文图片类型规则不变，封面不能使用 PDF。共用 public-controls.js 同时处理图片和视频加载失败，滚动追加内容也适用。

主要修改：backend/app/native/media_policy.py、field_help.py、public_data.py；frontend/public/templates/news-media.html、content-detail.html、content-card.html、home-card.html、layout.html；frontend/public/static/css/academic.css；frontend/shared/static/js/public-controls.js。更新原新闻回归测试并新增封面测试。

SQL 初始化文件、数据库字段和依赖锁定文件不变；没有数据迁移或重置。下一步实现私密新闻留言：复用 allow_comments、messages、contact 表单和提交服务，以 message_type=news:<UID> 标记新闻来源，不新增数据库字段。本版尚未实现后续的留言、时区和排序快速编辑。
