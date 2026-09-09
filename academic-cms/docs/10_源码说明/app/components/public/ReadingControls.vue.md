# app / components / public / ReadingControls.vue

## 文件定位

- **源码路径**：`app/components/public/ReadingControls.vue`
- **功能定位**：无独立存储的三档字号按钮，支持中英文和当前状态。
- **规模**：15 行，746 字节
- **内容校验**：SHA-256 `a43c261201a65130ce59a12c6a0d810421cdb5ecc875cad5746cb5b7a4edc349`

## 方法与用法

接收 `modelValue: PublicReadingMode` 与 `locale: zh/en`，点击后发出 `update:modelValue`。父组件负责更新状态；本组件不另建 Cookie 或 localStorage。

`modes` 定义 standard/comfortable/large 顺序；`labels` 映射标准/舒适/大字和 Standard/Comfort/Large。三个原生 button 的 aria-pressed 反映当前值，外围 role=group 提供阅读字号标签。Header 接收事件后转发到 layout。

## 维护说明

当前实现对应前台第 3/10 步；专项说明见 docs/23_前台公共模板_导航与三档字体验收.md。修改代码时同步方法说明和内容校验。
