# tests / backend / admin-identity-controls.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-identity-controls.test.mjs`
- **文件类型**：测试模块
- **功能定位**：检查自定义 UID 经共享上传、内容和资源服务进入数据库约束，且查重遵循权限白名单。
- **规模**：59 行，2868 字节
- **内容校验**：SHA-256 `cb66bd0ca9d3e673d36ae749a51dc050375a37419a42458b299fe3cb26e298db`

## 接入与状态约定

检查自定义 UID 经共享上传、内容和资源服务进入数据库约束，且查重遵循权限白名单。

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| 测试声明 / 组件模板 | 文件主体 | 挂载或读取被测实现，按断言验证上述职责；无独立命名方法。 |

### 调用签名



## 行为覆盖

- 统一 UID 与查重实现覆盖所有对象创建入口
- 服务端把自定义 UID 送入最终数据库唯一约束且禁止更新 UID
- 查重接口只允许白名单资源字段并先执行查看权限校验

运行：`node --test tests/backend/admin-identity-controls.test.mjs`。

## 维护要求

- 本步行为及验收边界见 [20_后台编辑生命周期统一与验收.md](../../../20_后台编辑生命周期统一与验收.md)。
- 共用编辑壳必须显式导入；业务 API、expectedUpdatedAt、权限和媒体引用规则由既有服务承担。
- docs/01–04 为受保护需求基线，不随本次实现更新。
