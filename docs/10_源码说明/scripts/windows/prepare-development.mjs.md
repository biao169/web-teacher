# scripts/windows/prepare-development.mjs

## 文件定位

- **源码路径**：`scripts/windows/prepare-development.mjs`
- **功能定位**：开发启动准备：验证项目标识及必要源码，只删除两处 Nuxt 生成缓存；失败时返回非零退出码。
- **规模**：25 行，1118 字节
- **内容校验**：SHA-256 `69127efa79c81d52ec723de49d5383cf558b1cf550b82077787d42760ba4b3fd`

## 使用与维护

开发启动准备：验证项目标识及必要源码，只删除两处 Nuxt 生成缓存；失败时返回非零退出码。

命名函数：`prepareDevelopment`。

## 直接依赖

- `node:fs/promises`
- `node:path`
- `node:url`

本轮说明见 `docs/32_Windows启动缓存与共享引用修复.md`。
