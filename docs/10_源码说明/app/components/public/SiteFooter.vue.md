# app/components/public/SiteFooter.vue

## 文件定位

- **源码路径**：`app/components/public/SiteFooter.vue`
- **功能定位**：页脚正文只使用网站设置配置的HTML或旧协议纯文本，移除自动拼接网站名称、版权、演示兜底和系统署名；保留后台配置的页脚导航。
- **规模**：25 行，1967 字节
- **内容校验**：SHA-256 `e4f5e9d2c65f2239536d6b8cff7cf4ea0892b4902e4f5d1684b7362ad15281c7`

## 使用与维护

页脚正文只使用网站设置配置的HTML或旧协议纯文本，移除自动拼接网站名称、版权、演示兜底和系统署名；保留后台配置的页脚导航。

## 直接依赖

- `./NavigationLink.vue`
- `./content/RichHtml.vue`
- `~~/shared/contracts/public-site`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
