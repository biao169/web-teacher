# tests / complete-admin / structure.test.mjs

## 文件定位

- **源码路径**：`tests/complete-admin/structure.test.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：54 行，2894 字节
- **内容校验**：SHA-256 `f9e432e1d49173b7174715ba0e96dcae63b4b50cceb5b97efe55716f6bcd0a8c`

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:fs/promises`
- `node:path`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- all complete backend entry points exist
- admin Vue code never uses v-html
- backup preview does not return a decrypted envelope
- binary upload opts into the binary request boundary
- the consolidated project documentation set exists without legacy duplicates
- heavy editor dependencies stay in the admin component tree

运行：`node --test tests/complete-admin/structure.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
