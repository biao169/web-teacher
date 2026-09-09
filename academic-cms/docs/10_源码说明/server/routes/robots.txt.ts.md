# server / routes / robots.txt.ts

## 文件定位

- **源码路径**：`server/routes/robots.txt.ts`
- **功能定位**：无数据库依赖的 GET/HEAD /robots.txt。
- **规模**：9 行，507 字节
- **内容校验**：SHA-256 `fd2c68076cb26c2c9fe5ef3e3a7cb6c91a24b391835422f199aaa49400017be9`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `默认事件处理函数` | 复用 configuredPublicOrigin 与 publicRobots，输出 UTF-8 纯文本；无域名时仍返回 200，但不写错误 Sitemap 地址。 |

## 配合关系与维护要求

没有新增运行时依赖、数据库表或数据库字段。完整规则见 `docs/19_站点地图与双语SEO验收.md`。
