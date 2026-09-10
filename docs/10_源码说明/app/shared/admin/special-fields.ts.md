# app / shared / admin / special-fields.ts

## 文件定位

- **源码路径**：`app/shared/admin/special-fields.ts`
- **文件类型**：程序/脚本
- **功能定位**：后台前端共享定义；集中维护功能清单、字段规则或建议值。
- **规模**：77 行，6412 字节
- **内容校验**：SHA-256 `612e99a44cb928b1cc8d730fb40b395544b33df30d15e1edafadb507d4d1b63d`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `getAdminSpecialField` | 函数，第 74 行 | 读取或定位 Admin Special Field，向调用方返回匹配结果 |

### 调用签名

- `getAdminSpecialField`：`export function getAdminSpecialField(module: string, field: string): AdminSpecialFieldSpec | null`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
