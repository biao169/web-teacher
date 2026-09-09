# 版本和组件记录

| 项目 | 本步版本／用途 |
| --- | --- |
| 工具 | 0.10.0，milestone 10，protocol/bootstrap config version 1，schema version 8 |
| Node.js | 验证 24.19.0；运行要求 >=24.19.0 <25；与教师网站一致 |
| SQLite | Node 24.19.0 内置版本 3.53.3，独立元数据 |
| 包管理器 | pnpm 11.19.0；锁文件已生成并以冻结、离线模式校验 |
| 新增 npm 依赖 | ws 8.21.3（服务端信令/代理/受控文件中继）与 qrcode-generator 2.0.4（前台本地二维码）；均 MIT，无传递运行依赖 |
| 教师基线 | 第六轮源码，Nuxt 4.5.2 / Vue 3.5.42 |
| 开发验证环境 | Linux；中文与空格路径、不同启动目录已实际验证 |
| WebRTC | 浏览器原生 DataChannel；LAN 无 STUN/TURN；WAN 使用可选 STUN 和已核验公网候选，无 TURN |
| coturn / tus | 本步以既有 ws 受控中继实现；coturn / tus 未安装、未启动 |

本工具暂为用户自有私有项目，`private:true` / `license:UNLICENSED` 不为用户代码擅自指定开源许可证。
所用基础工具为开源组件；运行时由用户环境提供，没有将 Node 或 pnpm 二进制放进源码包。
Node.js 主要采用 MIT，捆绑依赖有各自声明；SQLite 为 public domain；pnpm 为 MIT。

官方来源：[Node 24.19.0 发布说明](https://nodejs.org/en/blog/release/v24.19.0)、[Node 许可证](https://github.com/nodejs/node/blob/v24.19.0/LICENSE)、[SQLite 许可](https://sqlite.org/copyright.html)、[pnpm 许可证](https://github.com/pnpm/pnpm/blob/main/LICENSE)。
Nuxt 模块使用普通函数接口，无工具侧 Nuxt 运行依赖，参见 [Nuxt 模块结构](https://nuxt.com/docs/4.x/guide/modules/module-anatomy)。
SQLite API 的稳定状态随 Node 版本变化；本版按上述精确运行时验证，并将数据库访问集中在适配器中。

依赖上游：[ws](https://github.com/websockets/ws)、[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)。本包附带声明与许可证原文：`docs/licenses/`。Node 原生 WebSocket 仅是客户端，因此服务端使用小型 ws 实现；没有自行重写 WebSocket 帧协议。

第 7/8/9/10 步没有新增 npm 依赖。出口采集使用 Linux 内核 sysfs 或随包的固定 PowerShell 脚本；外部账单通过固定私有 JSON 文件导入。没有安装防火墙组件或声称已接入供应商硬停机能力。

第 9 步复用 Node SQLite 保存恢复账本，浏览器原生文件接口提交并校验检查点；未引入 tus、IndexedDB 依赖或额外后台服务。

第 10 步增加纯 Node 文件流、运行锁、只读诊断及停机备份／恢复命令，schema 仍为 8。systemd 与 Nginx 仅提供配置示例，不随源码安装系统服务；Windows 入口无额外脚本运行依赖。
