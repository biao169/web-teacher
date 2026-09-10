# app / composables / usePublicHome.ts

## 文件定位

- **源码路径**：`app/composables/usePublicHome.ts`
- **文件类型**：程序模块
- **功能定位**：Nuxt/Vue 组合式逻辑模块；集中管理可复用的数据请求、状态和页面行为。
- **规模**：19 行，661 字节
- **内容校验**：SHA-256 `4cab2bfcd43670a321ec14e16e7b3146d85bb6e73122b0466904bad22792dc2f`

## 直接依赖

- `vue`
- `~~/shared/contracts/public-site`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `usePublicHome` | 函数，第 4 行 | 封装 Home 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `usePublicHome`：`export function usePublicHome(localeInput: MaybeRefOrGetter<PublicSiteLocale>)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
