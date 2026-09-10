# tests / complete-admin / translation-completion.test.mjs

## 文件定位

- **源码路径**：`tests/complete-admin/translation-completion.test.mjs`
- **文件类型**：测试模块
- **功能定位**：检查翻译任务、人工修订、共享离开保护、CSRF、来源指纹和服务端批量保护契约。
- **规模**：96 行，5058 字节
- **内容校验**：SHA-256 `048dac2f537b08132ab2eab25dbd74354bd29241b17cbe164ed64d4529ffe69f`

## 接入与状态约定

检查翻译任务、人工修订、共享离开保护、CSRF、来源指纹和服务端批量保护契约。

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:test`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| 测试声明 / 组件模板 | 文件主体 | 挂载或读取被测实现，按断言验证上述职责；无独立命名方法。 |

### 调用签名



## 行为覆盖

- translation workspace mounts the specialist UI and exposes guarded task actions
- manual translation editor has canonical deep-link, save, and return flows
- specialist admin writes recover a missing readable CSRF cookie before posting
- translation service shares canonical public references and fingerprints
- generic translation mutations cannot bypass specialist invariants
- translation write routes require edit permission and bounded JSON
- selected automatic translations can be rerun while manual and inactive records stay protected

运行：`node --test tests/complete-admin/translation-completion.test.mjs`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
