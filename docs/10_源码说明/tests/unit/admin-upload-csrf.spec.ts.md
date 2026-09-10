# tests / unit / admin-upload-csrf.spec.ts

## 文件定位

- **源码路径**：`tests/unit/admin-upload-csrf.spec.ts`
- **文件类型**：测试模块
- **功能定位**：验证媒体上传等待共享安全令牌刷新，缺少令牌时不发送二进制请求。
- **规模**：24 行，1617 字节
- **内容校验**：SHA-256 `f3c223f369ab5afe2ae67b31079208233a69952fba2a3fdf1fc0f4df6938ed1e`

## 直接依赖

- `vitest`
- `../../app/composables/useAdminMediaUpload`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## 验证内容

- waits for the shared CSRF refresh before starting a binary upload
- does not send an upload if the shared refresh cannot supply a CSRF token

运行：`pnpm exec vitest run tests/unit/admin-upload-csrf.spec.ts`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
