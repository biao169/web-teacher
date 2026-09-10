# server/cache/public-cache.ts

## 文件定位

- **源码路径**：`server/cache/public-cache.ts`
- **功能定位**：公开数据缓存新增可选模型快取层；每次仍校验代次，复用原并发合并、后台刷新与失效竞态保护。
- **规模**：256 行，14078 字节
- **内容校验**：SHA-256 `eb645567eb634b323b6c9f59c583125c6e4bc9ec4f90a46f4f5203b29d8894b3`

## 使用与维护

公开数据缓存新增可选模型快取层；每次仍校验代次，复用原并发合并、后台刷新与失效竞态保护。

命名函数：`createPublicCacheCoordinator`、`validDate`、`selectedPolicy`。

## 直接依赖

- `./value-cache`
- `../../shared/contracts/view-model`
- `../view-model/serializer`
- `./contracts`
- `./config`
- `./errors`
- `./generation-store`
- `./keys`

本步说明见 `docs/30_前台缓存与综合交付验收.md`；第10步已完成前台缓存与综合自动化验收、源码交付；实机验收边界见最终报告。Word专项已取消。
