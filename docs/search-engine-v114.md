# 搜索引擎入口（v0.15.114）

- `/sitemap.xml` 是地图索引；`/sitemap-home.xml` 是中英文首页；`/sitemap-模块-分块号.xml` 是模块地图。每块最多 2,000 个中英文 URL，数据库只读取当前块的标识，不读取正文或媒体文件。
- 全部公开列表按现有每页 10 条的默认分页进入地图，不受首页展示数量限制。列表 HTML 已包含下一页链接，不依赖 JavaScript 滚动才能发现后续内容。论文、项目、学生、专利等保留列表设计，不额外建立详情页。
- 教师、课程、新闻另列公开详情 URL。权限条件复用 `Content.scope(public=True)`；管理员登录访问地图也不会扩大范围。未发布或未来新闻、隐藏和停用条目不会进入地图。地图不列私有附件、账号、留言和快传记录。
- 页面提供 canonical 和中英文 hreflang；默认排序参数合并到同一规范地址，分页地址保留。地图仅提供抓取线索，最终收录和更新时间由搜索引擎决定。

## 域名和部署

`install.sh --domain example.org` 通过原部署管理器写入 `TEACHER_ORIGIN=https://example.org`。robots 和地图动态读取同一配置，没有硬编码域名或额外 robots 物理文件，也无需部署后手工替换文本。使用 `sudo tweb paths` 查看 website、sitemap、robots 地址。原有 Nginx/Caddy 兜底代理会将这些请求转发给应用。

本地开发自动使用已配置的本地 origin。变更生产域名时，应同步部署域名配置、TEACHER_ORIGIN、反向代理域名和证书，并重启服务；仅更改浏览器 Host 或转发头不会改变地图地址。现有部署更新后重启服务即可，不需要重置或更新数据库。

## 保护边界

robots 对后台、认证、API、健康检查、快传和服务器内部目录声明不抓取；相关动态管理入口另有 `X-Robots-Tag: noindex, nofollow`。公开 `/assets/public/` 和 `/assets/shared/` 的样式、脚本允许访问，以免影响渲染与检索。

robots 不是权限机制，不能阻止恶意访问，也不能隐藏必须发送到浏览器的前端脚本。当前应用及生成的代理配置仅静态开放前端资源目录，不静态开放项目根目录；源码、配置、数据库和部署脚本 URL 返回 404。私有媒体继续由已有媒体权限逻辑验证。不要自行将 Nginx/Caddy 的静态根目录设置为整个项目目录。

## 修改文件

`backend/app/native/public_seo.py`、`backend/app/native/web.py`、`frontend/public/templates/native.html`、`deploy/linux/tweb.py`、`deploy/vps/release.py`、`install.sh`；新增测试 `tests/test_public_seo_v114.py`，更新版本、README 和本说明。SQL 初始化文件和依赖不变。
