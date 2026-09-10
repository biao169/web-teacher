# app / components / public / auth / LoginForm.vue

## 文件定位

- **源码路径**：`app/components/public/auth/LoginForm.vue`
- **文件类型**：Vue 组件
- **功能定位**：公开站展示组件；渲染页面区块、内容列表、详情或通用视觉元素。
- **规模**：13 行，3292 字节
- **内容校验**：SHA-256 `397c94821dca44660531dc490376ae7a3874e388d69a8791e8ceb35c10ca6330`

## 直接依赖

- `@lucide/vue`
- `~/utils/interaction-errors`
- `~~/shared/utils/redirect`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `labels` | computed 声明，第 8 行 | 派生 labels 的响应式状态，供模板和交互逻辑读取 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `enterTarget` | 函数，第 9 行 | 封装 Target 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `submit` | 函数，第 10 行 | 封装 submit 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `labels`：`labels=computed(()=>props.locale==='zh'?`
- `enterTarget`：`async function enterTarget(target:string):Promise<void>`
- `submit`：`async function submit():Promise<void>`

## Vue 模板交互

- 模板约 1 行；样式区约 0 行。
- 子组件：`PublicAuthStatusMessage`、`EyeOff`、`Eye`、`LogIn`、`NuxtLink`、`ArrowRight`
- 事件绑定：`click → showPassword=!showPassword`
- 动态属性：`request-id`、`type`、`aria-label`、`size`、`disabled`、`to`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
