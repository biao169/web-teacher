# 文件夹增强第五步：兼容验收与中英文（0.15.85）

## 本次实现

- `/transfer/` 默认英文；优先使用 `?lang=en|zh`，其次继承主站语言 Cookie。主站导航仍按后台配置的名称、图标、顺序和可见范围生成，Logo、账号、后台入口、退出表单直接复用主站页头模板。
- 右上角中文 / EN 开关在当前页更新文字，再只刷新导航。已选文件、目录句柄、配对码、进度及接收流保持原对象。切换期间继续传输，不重新创建任务或预留额度。导航刷新失败有提示；多次快速切换只接受最后一次响应。
- 文案集中在 `transfer/frontend/native/transfer-i18n-catalog.js`，服务端首屏和浏览器交互共用。覆盖三种模式、目录预览、权限/额度错误、取消/恢复、无障碍标签。文件名、目录名、分享链接不翻译。未知服务端错误英文给通用检查提示，中文保留原错误。
- 页面沿用主站公共主题、Bootstrap 和导航样式；手机导航换行、操作按钮换行。后台任务管理和设置界面继续沿用原实现，本次未改变其业务规则。

## 能力与限制

| 能力 | 检测与行为 |
| --- | --- |
| 读取完整目录、含空目录 | 安全上下文且有 `showDirectoryPicker` 时使用原生目录选择 |
| 兼容选择目录 | `webkitdirectory` 可保留文件相对路径；无法枚举空目录，界面明确提示 |
| 拖入目录 | 按浏览器提供的目录句柄/条目能力枚举；不支持时提示使用选择按钮 |
| 保存为真实文件夹 | 接收端需要安全上下文和 `showDirectoryPicker` / 可写目录句柄；逐文件写盘、不强制 ZIP |
| 不支持目录写入 | 阻止目录接收并说明换用支持的浏览器；普通单文件浏览器下载仍可使用 |
| 局域网直连 | WebRTC、HTTPS 或 localhost；无 STUN/TURN。不能仅凭连接成功认定实际走物理局域网，设备 VPN、防火墙和 Wi-Fi 隔离需要实测 |
| 在线中转 | 双方在线，经主站 HTTPS 分块；遵守现有流量/大小/并发限制，不整文件驻留内存 |
| 临时缓存 | 接收方可稍后打开同一分享链接；按后台缓存时间/容量、流量和下载次数执行 |
| 暂停与恢复 | 临时接收与中转短时断线在原页继续；直连中断重新配对。不要关闭页面，目录写入句柄不跨刷新恢复 |
| 取消和磁盘失败 | 已完成文件保留；未完成文件不算成功。重收新建唯一目录，不覆盖既有文件 |

能力以运行时检测为准，不根据浏览器名称承诺支持。建议在 Windows 桌面 Chrome / Edge 中实测目录读写。手机、Firefox、Safari 等如果缺少相应能力，应核对降级提示，不应把单文件可下载误判为目录可写。

## 自动检查

Windows 已有统一入口，无需新增另一个测试体系：

```bat
deploy\windows\test.cmd --dom --report data\acceptance\v85.json
```

解释器、虚拟环境在 `deploy/windows/local.cmd` 中配置，参见根 README。该入口会按现有流程准备测试依赖；`--dom` 需要 Node/npm。测试使用隔离数据库，不使用网站当前业务数据。

开发环境直接运行：

```text
python -m pytest -q tests/test_transfer_i18n_v85.py tests/test_transfer_live_folder_v84.py tests/test_transfer_lan_v68.py tests/test_transfer_relay_v69.py tests/test_transfer_folder_receive_v83.py tests/test_transfer_folder_v82.py tests/test_transfer_bounded_v67.py tests/test_transfer_integration_v66.py tests/test_transfer_offline_v70.py tests/test_transfer_portal.py
node --experimental-vm-modules --test tests/transfer-*.test.cjs tests/public-shell-dom.test.cjs
```

Node 需要 `tests/package.json` 中的 jsdom；可用 `JSDOM_PATH` 指定已有安装位置。

## Windows / 双端人工验收

1. 使用项目虚拟环境创建全新测试目录（目标已存在会拒绝，不覆盖）：

   ```bat
   .venv\Scripts\python.exe tests\folder_acceptance_fixture.py create data\acceptance\source-v85 --large-mib 8
   ```

   包含多层目录、空目录、空文件、中文/空格/重音文件名、超过一个分块且末块不足 1 MiB 的文件。需要长时间测试时可提高 `--large-mib`，最大 4096；先确认本地磁盘和后台限额。

2. 双方启动主站，主站 `/transfer/` 同一端口。另一台设备访问 `http://局域网IP` 通常不是安全上下文；应配置受信任 HTTPS。不要用关闭浏览器安全检查代替部署 HTTPS。
3. 三种模式分别传输该目录，接收端选择真实目录。确认文件层级、空目录和空文件存在，不生成压缩包。接收后执行：

   ```bat
   .venv\Scripts\python.exe tests\folder_acceptance_fixture.py compare data\acceptance\source-v85 D:\Received\source-v85
   ```

   路径替换为实际接收目录；比较只读，逐块 SHA-256 验证。保存目录因同名加了后缀时使用实际目录名。跨设备可在发送端保留源目录，并把接收目录拿到同机比较。
4. 发送、等待配对、接收和暂停时分别切换中文/EN。确认任务编号、勾选模式、文件/目录、配对码、进度不重置；原任务继续完成。切换后主站配置的导航、账号显示也跟随语言。下载链接中的 folder 参数不能丢失。
5. 缓存/中转接收中短时断网后恢复，在原页面继续；直连断开重新配对。取消后检查已完成文件仍在；磁盘满或拒绝写入必须显示失败，不能标记保存成功。再次接收不得覆盖原目录。
6. 同名目录预先存在时自动增加后缀；目录根为空、全部文件为零字节分别验收。选择权限拒绝、文件在扫描后被改动、任务过期、额度不足应显示对应提示，不能隐式创建新任务。
7. Windows 上测试 Chrome / Edge；另用缺少目录写入 API 的浏览器检查提示。窄屏 360px、桌面 1280px、键盘 Tab / Enter / 方向键检查导航、传输模式与按钮可达性。
8. 物理局域网直连需在双方关闭 VPN 或明确 VPN 路由后观察服务器流量，确认只有控制/目录清单请求；远程中转需要异网双端确认文件字节经过服务器。模拟单元测试不替代该实测。

## 本次验证范围

自动检查结果见同目录 `transfer-folder-step5-v85-verification.json`。实际 Windows 浏览器、真实目录授权弹窗、双设备 LAN/WAN、实际服务器内存/RSS 与防火墙未在本环境运行，仍需按上表验收。协议内存窗口有回归检查，但不是对整个 Python 进程 RSS 的硬上限保证。
