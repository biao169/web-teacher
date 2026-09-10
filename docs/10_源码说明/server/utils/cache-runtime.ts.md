# server/utils/cache-runtime.ts

## 文件定位

- **源码路径**：`server/utils/cache-runtime.ts`
- **功能定位**：按实际缓存适配器共享模型快取，每个Node进程或Worker实例默认最多64项、4MiB JSON载荷；应用配置可进一步收紧。
- **规模**：59 行，2360 字节
- **内容校验**：SHA-256 `b686d6585c078e1c5c170c7f6c2dff92a45c7ccc068f4a8ab2379441d739fe29`

## 使用与维护

按实际缓存适配器共享模型快取，每个Node进程或Worker实例默认最多64项、4MiB JSON载荷；应用配置可进一步收紧。

命名函数：`coordinatorFor`、`useCacheRuntime`。

## 直接依赖

- `../cache/value-cache`
- `#imports`
- `#cache-platform`
- `h3`
- `../cache/config`
- `../cache/generation-store`
- `../cache/invalidation-map`
- `../cache/public-cache`
- `../cache/contracts`
- `./database`

本步说明见 `docs/30_前台缓存与综合交付验收.md`；第10步已完成前台缓存与综合自动化验收、源码交付；实机验收边界见最终报告。Word专项已取消。
