# server/services/public/public-shell-service.ts

## 文件定位

- **源码路径**：`server/services/public/public-shell-service.ts`
- **功能定位**：内页外壳输出网站设置的安全footerHtml，外壳缓存版本4，与首页使用同一净化规则。
- **规模**：118 行，7151 字节
- **内容校验**：SHA-256 `887bf73607cd5899bc63cc641d9774eca02f26488cdbe16b05f61b9a1b5be554`

## 使用与维护

内页外壳输出网站设置的安全footerHtml，外壳缓存版本4，与首页使用同一净化规则。

## 直接依赖

- `./public-content-blocks`
- `../../../shared/utils/public-list-link`
- `../../../db/contracts`
- `../../../shared/contracts/i18n`
- `../../../shared/contracts/media`
- `../../../shared/contracts/public-site`
- `../../../shared/contracts/view-model`
- `../../../shared/utils/public-path`
- `../../cache/public-cache`
- `../i18n/translation-reader`
- `../media/media-service`
- `./public-values`
- `./public-localization`
- `./public-result`
- `./public-shell-store`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
