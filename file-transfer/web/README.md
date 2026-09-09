# 页面边界

前台 `public/transfer.vue` 共用教师公共布局，通过发送/接收切换；独立管理页 `admin/index.vue` 承载全部控制项。
第五步的 `PairWorkspace.vue` 负责配对码/二维码、确认、远程清单、进度与接收保存；`FileWorkspace.vue` 继续负责本机选择和预览。两者不把文件放入 SSR、浏览器持久化缓存或教师媒体库。
`useDirectTransfer.ts` 按 Nuxt 应用保存当前传输，语言切换/视图切换复用连接；离开工具页面会结束连接，刷新后须重新选文件和配对。
`files/direct.mjs` 实现分块协议，`files/peer.mjs` 驱动信令和原生 WebRTC。样式均使用 ft 前缀。
真实两设备浏览器验收尚待部署；当前自动化交互验证使用真实 Vue 与 DOM 适配器。

第六步增加个人／匿名共享额度看板、任务限速与限制说明；`useTransferSession` 在任务重要状态变化、回到页面、定时或手动操作时刷新私有统计。后台新增一个原页分区，不另建管理页。
