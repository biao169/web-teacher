# tests/unit/public-compatibility.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-compatibility.spec.ts`
- **功能定位**：验证弹窗和剪贴板缺失回退、基础取消信号、200条顺序分批、跨批编号冲突和引文兼容。
- **规模**：51 行，3895 字节
- **内容校验**：SHA-256 `daebeda4c73299482598ab533e8c8641057baca0f283ffe4ec62afe5e58c5b04`

## 使用与维护

验证弹窗和剪贴板缺失回退、基础取消信号、200条顺序分批、跨批编号冲突和引文兼容。

## 直接依赖

- `vitest`
- `../../app/utils/public-dialog`
- `../../app/utils/public-clipboard`
- `../../shared/utils/public-selection`
- `../../shared/utils/public-citation`

本步说明见 `docs/29_前台双语性能与兼容验收.md`；第9步已完成双语、性能及能力回退自动化验证；第10步综合验收与交付。Word专项已取消。
