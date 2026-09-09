# shared/utils/public-copy.ts

## 文件定位

- **源码路径**：`shared/utils/public-copy.ts`
- **功能定位**：前台各类内容复制序列化，项目金额与界面共用同一单位格式；保留直接复制与论文格式语义。
- **规模**：45 行，4084 字节
- **内容校验**：SHA-256 `b3d9298b711ffc727f3423d81abace75350e401f62a373a37b0a681fe3fd286b`

## 使用与维护

前台各类内容复制序列化，项目金额与界面共用同一单位格式；保留直接复制与论文格式语义。

命名函数：`serializePublicCopy`。

## 直接依赖

- `./project-amount`
- `../contracts/public-selection`
- `../contracts/public-site`
- `../contracts/public-citation`
- `./public-citation`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
