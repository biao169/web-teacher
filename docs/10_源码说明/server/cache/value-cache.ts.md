# server/cache/value-cache.ts

## 文件定位

- **源码路径**：`server/cache/value-cache.ts`
- **功能定位**：已验证公开页面模型的有界内存LRU；保留序列化对象原型、返回防御性副本，按原过期时间淘汰并限制容量。
- **规模**：51 行，2843 字节
- **内容校验**：SHA-256 `a4a6231e58a4756eaeaf928b404a39447cbc98b664e55e89e4d5baad1508b2d0`

## 使用与维护

已验证公开页面模型的有界内存LRU；保留序列化对象原型、返回防御性副本，按原过期时间淘汰并限制容量。

命名函数：`cloneValue`。

## 直接依赖

- `../../shared/contracts/view-model`
- `./contracts`
- `./errors`

本步说明见 `docs/30_前台缓存与综合交付验收.md`；第10步已完成前台缓存与综合自动化验收、源码交付；实机验收边界见最终报告。Word专项已取消。
