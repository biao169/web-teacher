# shared/utils/public-citation.ts

## 文件定位

- **源码路径**：`shared/utils/public-citation.ts`
- **功能定位**：按12条批次读取当前格式完整引文，核验版本与成员；使用基础AbortSignal取消检查。
- **规模**：51 行，3724 字节
- **内容校验**：SHA-256 `295aaa4f1cc998590e94900ddf3bca589eabefc60c8bf73848ef97f6921b2016`

## 使用与维护

按12条批次读取当前格式完整引文，核验版本与成员；使用基础AbortSignal取消检查。

命名函数：`publicCitationSegments`、`validPublicCitation`、`readPublicCitationPage`。

## 直接依赖

- `../contracts/public-selection`
- `../contracts/public-citation`
- `../contracts/public-site`
- `./text-highlight`

本步说明见 `docs/29_前台双语性能与兼容验收.md`；第9步已完成双语、性能及能力回退自动化验证；第10步综合验收与交付。Word专项已取消。
