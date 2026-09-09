# server/services/public/public-profile-links.ts

## 文件定位

- **源码路径**：`server/services/public/public-profile-links.ts`
- **功能定位**：教师六类平台URL安全投影、ORCID规范化、可选整数数值以及个人主页标签本地化。
- **规模**：30 行，1522 字节
- **内容校验**：SHA-256 `5034c3e56770aa39c297053d0e8a35062e060d85e045bd1e99099782e95c83e3`

## 使用与维护

教师六类平台URL安全投影、ORCID规范化、可选整数数值以及个人主页标签本地化。

命名函数：`readPublicProfileLinks`、`localizedProfileLinks`。

## 直接依赖

- `../../../db/contracts`
- `../../../shared/contracts/public-content`
- `./public-row`
- `./public-values`
- `../../../db/public-content-rules`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
