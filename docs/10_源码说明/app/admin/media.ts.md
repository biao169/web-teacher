# app / admin / media.ts

## 文件定位

- **源码路径**：`app/admin/media.ts`
- **文件类型**：程序/脚本
- **功能定位**：媒体库、回收站与字段选择器共用的前端响应类型：媒体行、分页结果、授权预览和统计；不含运行逻辑。
- **规模**：28 行，873 字节
- **内容校验**：SHA-256 `1115446f0bd10226f304b9aa9d86ced7ccb998b4127e08733b25a25d91aafee9`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 类型用途

| 类型 | 使用方式 |
| --- | --- |
| `AdminMediaRow` | 列表与选择器共用；uid、object_key、title、mime_type、status、updated_at 等采用数据库行命名，status 允许 active/trash。 |
| `AdminMediaList` | 分页接口返回 rows 与 total。 |
| `AdminMediaPreviews` | 按 UID 对应的授权 view；available 为真且有 url 才可使用。 |
| `AdminMediaStats` | 汇总数量/字节、分类候选和上传/回收策略；由媒体统计 API 填入。 |

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
