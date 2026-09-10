# app / composables / useAdminEditorLifecycle.ts

## 文件定位

- **源码路径**：`app/composables/useAdminEditorLifecycle.ts`
- **文件类型**：程序/脚本
- **功能定位**：后台编辑导航保护、保存/删除互斥与成功提交状态；最新读取保护委托给 useLatestRequest。
- **规模**：68 行，2911 字节
- **内容校验**：SHA-256 `33e46f31798d1252ddd1724bba6e9caf0ee3e99457c7ba1b63c81ed99c979da0`

## 接入与状态约定
编辑器提供 dirty getter 与可选的外部 busy getter，保留各自业务快照和 API。run 必须包住完整异步操作及确认框；成功更新基线后调用 commit，允许当前写操作中的保存后导航。失败不能调用 commit 或推进版本令牌。默认对象身份由 path、edit、tab 组成；日志显式使用 detail。

## 直接依赖

- `vue`
- `vue-router`
- `element-plus`
- `./useLatestRequest`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `useAdminEditorLifecycle` | 函数，第 13 行 | 在编辑器 setup 中注册离开、路由更新与窗口关闭守卫，返回共用操作和请求管理接口。 |
| `busy` | computed 派生状态，第 15 行 | 根据当前表单、权限或 URL 派生状态，供模板及操作校验读取。 |
| `confirmDiscard` | 函数，第 22 行 | 未保存内容存在时复用同一个确认框；取消或关闭返回 false，确认后返回 true。 |
| `mayLeave` | 函数，第 32 行 | 写入尚未提交时阻止离开；其余情况按脏状态决定是否询问。 |
| `run` | 函数，第 40 行 | 同步取得写操作锁，执行异步业务并在 finally 释放；忙碌、确认中或已卸载时不启动重复操作。 |
| `commit` | 函数，第 49 行 | 仅在服务端成功且保存基线更新后标记本次操作已提交，让保存后的导航可以执行。 |
| `beforeUnload` | 函数，第 56 行 | 存在未保存内容或正在写入时申请浏览器原生离开提示。 |

### 调用签名

- `useAdminEditorLifecycle`：`export function useAdminEditorLifecycle(options: EditorLifecycleOptions)`
- `busy`：`busy = computed(() => locked.value || Boolean(options.busy?.()))`
- `confirmDiscard`：`async function confirmDiscard(message = '当前页面有未保存修改，确定放弃并离开吗？'): Promise<boolean>`
- `mayLeave`：`async function mayLeave(): Promise<boolean>`
- `run`：`async function run<T>(operation: () => Promise<T>): Promise<T | undefined>`
- `commit`：`function commit(): void`
- `beforeUnload`：`function beforeUnload(event: BeforeUnloadEvent): void`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
