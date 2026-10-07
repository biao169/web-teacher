# 列表、媒体、翻译、账号与发布联调验收

测试使用临时目录、合成账号和独立 SQLite；不使用现有网站的配置、数据库或管理员会话。不要把预览服务当作实际网站部署。

在项目根目录，使用 Python 3.12+ 的独立测试虚拟环境：

```sh
python -m pip install -r deploy/shared/requirements/requirements-test.lock
python -B tests/run_acceptance.py
```

模拟 DOM 测试需要 Node 20+，仅测试时安装 jsdom：

```sh
npm --prefix tests install
npm --prefix tests test
```

测试默认用 `python3` 生成真实模板。Windows 可将环境变量 `TEST_PYTHON` 设为测试环境中 `python.exe` 的完整路径，然后运行 `npm --prefix tests test`。也可用 `JSDOM_PATH` 指定已有 jsdom 安装目录。

模拟测试直接执行项目中的 JavaScript 模块；动态导入异常、禁用浏览器存储和 Canvas 异常均为测试注入，不声称复现了用户现场的网络错误。它不替代真实浏览器的布局与端到端验收。

可选的 `python -B tests/preview_lists.py` 仅在 `127.0.0.1:8765` 提供临时测试站点。该站点内部使用合成登录态，只用于本机验收；退出后删除临时数据。URL 参数 `test_fault=columns`、`test_fault=media` 或 `test_fault=list` 可注入对应模块的 503 响应，移除参数并重载恢复。不要将该端口转发到公网。

## 第五步统一验收入口

安装上述测试依赖后，在项目根目录运行：

```sh
python -B tests/run_acceptance.py --dom
```

此命令用当前Python解释器运行全部Python测试，并将同一解释器传给模拟DOM测试，兼容Windows的python.exe。需要先安装Node和tests/package.json中的jsdom；可用JSDOM_PATH指定已有安装。省略--dom时结果会明确标记模拟DOM未运行。任一已选择套件失败时返回非零退出码；不会自动安装依赖。

新增发布联调使用共享启动器，在临时目录建立主站/快传数据，在随机本机端口启动真实服务；检查后台页面、局部刷新、静态模块、媒体类型纠正、译文共享、账号与角色删除、旧会话失效、正常退出及重启。测试结束临时数据由pytest按其临时目录保留策略管理，不访问生产数据库。完整套件包含全部历史回归，可能需要数分钟，取决于机器速度；首次运行依赖安装另计。

测试结果中的windows_browser始终标记为manual_acceptance_required，不能将自动化通过理解为Windows浏览器验收完成。现场清单见`docs/features/acceptance-step5.md`。

## 前台分片与升级回归（0.15.46）

test_public_stream_v46.py验证公开分片、配置总量、译文摘要与升级快照；public-stream-dom.test.cjs验证滚动观察、串行队列、去重、失败重试和离页取消。均纳入统一验收入口，测试数据为临时合成记录。


0.15.57增加 `test_frontend_examples_v57.py`：130条追加与旧数据保留、分类/分页/引用/附件联调、失败续传、媒体保留、授权及原子审计、控制台会话与空库保护。`public-people-dom.test.cjs` 增加四种格式下100篇连续追加和精确复制检查。数据可用 `node scripts/build_frontend_examples.mjs --check` 对照现有引用生成器验证；生产导入无需Node。


## 导航与双语搜索最终回归（0.15.91）

`npm --prefix tests test` 与 `python -B tests/run_acceptance.py --dom` 现在共用 `run_dom_tests.cjs`，自动发现全部 `*.test.cjs`，避免 npm 入口漏跑新增测试。Windows 仍可运行 `deploy\windows\test.cmd --dom --report data/acceptance/v91.json`。

本轮场景、自动结果与仍需实机操作的项目见 `docs/features/navigation-acceptance-step6-v91.md`。真实浏览器、Windows命令解释器、系统服务、防火墙及公网HTTPS只有实际运行后才能标为通过。


## 快传与部署五步更新验收（v0.15.98）

新增短码前后端、后台嵌入和真实单端口 HTTP 链路用例已纳入上述自动发现入口。完整命令仍为：

```sh
python -B tests/run_acceptance.py --dom --report data/acceptance/v98.json
```

Windows 也可使用 `deploy\windows\test.cmd --dom --report data\acceptance\v98.json`（该包装脚本会安装锁定的测试依赖；直接运行 Python 验收入口不会安装依赖）。本版专门回归了短码模式识别、文件夹清单完成后发码、离线短码重启保留、在线中转摘要校验、教师后台设置草稿保留及全站样式集中管理。
