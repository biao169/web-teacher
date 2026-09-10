# app / composables / useCompleteAdminApi.ts

## 文件定位

- **源码路径**：`app/composables/useCompleteAdminApi.ts`
- **文件类型**：程序/脚本
- **功能定位**：后台 JSON 请求和 CSRF 就绪入口；处理会话恢复、写入安全头、登录失效跳转及权限反馈。
- **规模**：59 行，2641 字节
- **内容校验**：SHA-256 `b85135539ce5dd4104756259bd6d62169d081870105aa968ff61d257a850b9f3`

## 直接依赖

- `ofetch`
- `../admin/errors`
- `../admin/permission-feedback`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `readCsrfCookie` | 函数，第 7 行 | 读取或定位 Csrf Cookie，向调用方返回匹配结果 |
| `useCompleteAdminApi` | 函数，第 19 行 | 封装 Admin Api 相关逻辑，供本文件或上层模块按其参数调用 |
| `csrfTokenForWrite` | 函数，第 23 行 | 缺少可读 CSRF cookie 且已登录时刷新会话，再读取令牌，供 JSON 保存与二进制上传共用。 |
| `request` | 函数，第 35 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `readCsrfCookie`：`function readCsrfCookie(): string`
- `useCompleteAdminApi`：`export function useCompleteAdminApi()`
- `csrfTokenForWrite`：`async function csrfTokenForWrite(): Promise<string>`
- `request`：`async function request<T>(path: string, options: FetchOptions = {}): Promise<T>`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
