# shared/utils/public-selection.ts

## 文件定位

- **源码路径**：`shared/utils/public-selection.ts`
- **功能定位**：200条以内分批核验当前公开数据；验证跨批版本与编号唯一性，兼容基础AbortSignal。
- **规模**：39 行，3345 字节
- **内容校验**：SHA-256 `d7b3b656cb53ad809b9caf9e7434d6439f11f4bf7776ce560ce40dd950621e85`

## 使用与维护

200条以内分批核验当前公开数据；验证跨批版本与编号唯一性，兼容基础AbortSignal。

命名函数：`readPublicSelectedItems`。

## 直接依赖

- `../contracts/public-selection`
- `./public-citation`

本步说明见 `docs/29_前台双语性能与兼容验收.md`；第9步已完成双语、性能及能力回退自动化验证；第10步综合验收与交付。Word专项已取消。
