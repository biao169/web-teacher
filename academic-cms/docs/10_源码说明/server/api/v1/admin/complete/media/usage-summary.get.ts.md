# server / api / v1 / admin / complete / media / usage-summary.get.ts

## 文件定位

- **源码路径**：`server/api/v1/admin/complete/media/usage-summary.get.ts`
- **文件类型**：程序/脚本
- **功能定位**：汇总媒体引用数量，供列表提前禁用正在使用的媒体回收按钮。
- **规模**：13 行，687 字节
- **内容校验**：SHA-256 `aa3ccee71673570d6d83463835f0a240bd7d83b6c905d850d739fde06501f243`

## 直接依赖

- `h3`
- `~~/server/utils/complete-admin/auth`
- `~~/server/services/complete-admin/media-service`
- `~~/server/utils/complete-admin/api`

## 方法、函数与派生状态

无独立命名函数。该文件通过类型声明、配置、样式、测试声明或框架默认入口发挥上述作用。

## HTTP 入口

由 Nuxt 根据 `server/api/v1/admin/complete/media/usage-summary.get.ts` 的目录、参数段和方法后缀注册。默认 handler 读取请求上下文，经本文件调用的权限/输入检查后交给业务服务；不应直接从前台导入。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
