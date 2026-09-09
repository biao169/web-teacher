# tests/stage3/value-cache.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/value-cache.spec.mjs`
- **功能定位**：验证LRU容量、复制隔离、原过期时间、代次/语言/分页隔离、刷新合并、失效竞态、故障回退及实测基准。
- **规模**：89 行，6930 字节
- **内容校验**：SHA-256 `69c7e0bb074e01fbb7c8cde15cebe18077ba001ae0d62ddd3c853384086d24eb`

## 使用与维护

验证LRU容量、复制隔离、原过期时间、代次/语言/分页隔离、刷新合并、失效竞态、故障回退及实测基准。

命名函数：`fixture`。

## 直接依赖

- `node:assert/strict`
- `node:test`
- `../helpers/offline-stage3.mjs`

本步说明见 `docs/30_前台缓存与综合交付验收.md`；第10步已完成前台缓存与综合自动化验收、源码交付；实机验收边界见最终报告。Word专项已取消。
