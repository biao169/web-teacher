# app / composables / usePublicReadingMode.ts

## 文件定位

- **源码路径**：`app/composables/usePublicReadingMode.ts`
- **功能定位**：前台阅读偏好：校验三档值并通过一份 Cookie 响应式读写。
- **规模**：20 行，809 字节
- **内容校验**：SHA-256 `cf0af2f0cd0fe0ba81de43a1638a2ccee98611b35de8c7e0f055759041045939`

## 方法与用法

| 名称 | 用途与调用方式 |
| --- | --- |
| `PublicReadingMode` | 类型联合：standard、comfortable、large；组件仅接受这三个值。 |
| `PUBLIC_READING_COOKIE` | 唯一 Cookie 名 academic-cms-reading，路径 /，保存一年。 |
| `normalizePublicReadingMode(value)` | 接受未知输入；仅保留 comfortable/large，其他输入归一为 standard，防止错误偏好传入样式。 |
| `usePublicReadingMode()` | 在 Nuxt setup 中调用，返回可写 computed；读取 Nuxt useCookie，写入前归一化，HTTPS 时使用 Secure。 |

公共 layout 是唯一状态所有者；将值传到 Header，再由 ReadingControls 发出更新。默认读取不写 Cookie；服务端可读取已有偏好并生成 body 的 data-reading。纯函数可独立测试，组合函数需要 Nuxt 请求上下文。

## 维护说明

当前实现对应前台第 3/10 步；专项说明见 docs/23_前台公共模板_导航与三档字体验收.md。修改代码时同步方法说明和内容校验。
