# app / assets / admin / typography.css

## 文件定位

- **源码路径**：`app/assets/admin/typography.css`
- **文件类型**：界面资源
- **功能定位**：后台字体和字号的唯一配置入口；定义基准、表格、字段标签、输入控件、帮助和注释字号。
- **规模**：13 行，538 字节
- **内容校验**：SHA-256 `601cdec1441473ae9a03ca712c6626b0d26e2b809048e29e086bbd212595e0cb`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 样式入口

自定义属性：`--admin-font-family`、`--admin-font-size-base`、`--admin-font-size-control`、`--admin-font-size-table`、`--admin-font-size-label`、`--admin-font-size-help`、`--admin-font-size-caption`。

通过 `--admin-font-size-table`、`--admin-font-size-label` 和 `--admin-font-size-control` 分别调整列表、字段标题和控件字号；默认 .875rem。例如改成 1rem，可得到通常为 16px 的文字。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
