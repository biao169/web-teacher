# tests / unit / admin-identity.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-identity.spec.ts`
- **文件类型**：测试模块
- **功能定位**：回归检查：UID 格式、资源查重规则与后台编辑路径。
- **规模**：40 行，1949 字节
- **内容校验**：SHA-256 `62d4c5c926093fd35e5478e0d80eac57c540185bb3dba863db694f9ec57d10a0`

## 直接依赖

- `vitest`
- `../../shared/admin/identity`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- generates a valid, resource-specific UID for every supported create flow
- rejects unsafe or non-portable identifiers
- marks database constraints as hard and editorial similarities as warnings
- builds direct new-tab editor locations without losing UID characters

运行：`pnpm exec vitest run tests/unit/admin-identity.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
