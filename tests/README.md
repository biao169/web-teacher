# 测试用法

测试使用临时目录、合成账号与独立数据库，不连接生产站点。需要Python3.12+，建议独立虚拟环境。

在项目根目录安装测试依赖并运行：

```bash
python -m pip install -r deploy/shared/requirements/requirements-test.lock
python -B tests/run_acceptance.py
```

DOM交互测试需要Node和tests内的依赖：

```bash
npm --prefix tests install
python -B tests/run_acceptance.py --dom
```

也可用 `npm --prefix tests test` 单独运行JS用例；`TEST_PYTHON`指定生成模板的解释器，`JSDOM_PATH`指定已有jsdom目录。

Windows使用 `deploy\windows\test.cmd --dom`；统一入口支持 `--report` 指定结果文件。仅检查某个功能时可用 `python -m pytest tests/具体文件.py`。

范围包括公开页面/权限、媒体、翻译、内容编辑、文件互传、异地同步、后台状态、部署隔离与配置。真实浏览器布局、Windows命令解释器、VPS服务与Cloudflare线上资源占用仍需在目标环境单独核验。

可选的 `tests/preview_lists.py` 在本机回环地址提供合成测试站点；它包含测试登录态，不应开放到公网。维护入口与功能位置见 [函数索引](../docs/FUNCTIONS.md)。
