# app / admin / complete-resource.ts

## 文件定位

- **源码路径**：`app/admin/complete-resource.ts`
- **文件类型**：程序/脚本
- **功能定位**：后台前端基础模块；提供 API、格式化、权限反馈或统一列表等通用能力。
- **规模**：190 行，8780 字节
- **内容校验**：SHA-256 `2bf64816e30621b5fbc5bc337c95707d32317d31bf2a230f9fed6a90d3472f65`

## 直接依赖

- `./unified-list`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `completeResourceFieldPlaceholder` | 函数，第 67 行 | 封装 Resource Field Placeholder 相关逻辑，供本文件或上层模块按其参数调用 |
| `completeResourceFieldHelp` | 函数，第 80 行 | 封装 Resource Field Help 相关逻辑，供本文件或上层模块按其参数调用 |
| `columnLayout` | 函数，第 125 行 | 封装 Layout 相关逻辑，供本文件或上层模块按其参数调用 |
| `completeResourceField` | 函数，第 137 行 | 封装 Resource Field 相关逻辑，供本文件或上层模块按其参数调用 |
| `completeResourceLabel` | 函数，第 141 行 | 返回 Resource Label 对应的界面显示文本 |
| `completeBooleanOptions` | 函数，第 145 行 | 封装 Boolean Options 相关逻辑，供本文件或上层模块按其参数调用 |
| `completeResourceColumns` | 函数，第 152 行 | 封装 Resource Columns 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `completeResourceFieldPlaceholder`：`export function completeResourceFieldPlaceholder(field: Pick<CompleteResourceField, 'label' | 'type' | 'placeholder'>): string`
- `completeResourceFieldHelp`：`export function completeResourceFieldHelp(field: Pick<CompleteResourceField, 'label' | 'type' | 'required' | 'readonly' | 'help' | 'maxLength' | 'min' | 'max'>): string`
- `columnLayout`：`function columnLayout(resourceKey: string, key: string, kind: AdminUnifiedColumnKind, twoLine: boolean): Pick<AdminUnifiedColumn, 'width' | 'minWidth'>`
- `completeResourceField`：`export function completeResourceField(schema: CompleteResourceSchema, key: string): CompleteResourceField | undefined`
- `completeResourceLabel`：`export function completeResourceLabel(schema: CompleteResourceSchema, key: string): string`
- `completeBooleanOptions`：`function completeBooleanOptions(key: string): readonly CompleteResourceOption[]`
- `completeResourceColumns`：`export function completeResourceColumns(schema: CompleteResourceSchema, resourceKey: string): AdminUnifiedColumn[]`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
