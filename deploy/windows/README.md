# Windows开发入口

`start.cmd` 每次按新站重建专用开发数据库，不做迁移或备份；`start-existing.cmd` 用于保留一次调试的数据。Windows .cmd 全部在 deploy/windows；Linux .sh 在根目录。

## 本机配置

复制local.example.cmd为local.cmd。使用 `set "变量=值"`，不要在值内额外加引号。路径可包含空格，相对开发数据路径基于TEACHER_DEV_ROOT，不受启动时工作目录影响。

| 变量 | 说明 |
| --- | --- |
| TEACHER_PYTHON | Python 3.12+可执行文件完整路径，优先级最高 |
| TEACHER_VENV | 虚拟环境目录；缺少时由选定解释器创建，锁文件变化时更新依赖 |
| TEACHER_DEV_ROOT | 可重建的数据目录，默认项目根目录 data/，与普通启动默认路径相同 |
| TEACHER_DEV_DATABASE_PATH | 默认database/site.sqlite3，可配置根目录内的相对/绝对路径 |
| TEACHER_DEV_MEDIA_DIR / TEACHER_DEV_CACHE_DIR | 默认media / cache |
| TEACHER_DEV_TRANSFER_DIR / TEACHER_DEV_TRANSFER_CACHE | 默认transfer-data/files / transfer-data/cache |
| TEACHER_DEV_ADMIN_USER / TEACHER_DEV_ADMIN_PASSWORD | 专用测试管理员；未设置密码时交互输入；不要使用真实账号密码 |
| TEACHER_PORT | 网站与快传共用端口，默认8003 |
| TEACHER_NO_PAUSE | 设为1可取消末尾暂停，供命令行/CI使用 |
| TEACHER_CONFIG | 仅普通启动入口使用的外部存储TOML，开发重建忽略它 |

解释器顺序：TEACHER_PYTHON → 自定义TEACHER_VENV中的Python → 项目.venv → py -3（验证3.12+）→ PATH上的python（验证3.12+）。不再使用个人电脑固定Conda路径。

local.cmd为私有本机文件，已从Git和发布清单排除。启动不会输出密码；开发密码在启动Web子进程前清除。环境与依赖初次准备需要网络，网页运行本身不需要Node或前端构建。

## 示例及测试

基础示例沿用原幂等seed函数；扩展示例沿用原30学生/100论文导入函数，需要现有开发管理员登录。基础示例可在运行时追加并刷新页面；扩展示例仍需先停服。普通站点使用自定义配置时，执行 add-demo-data.cmd --profile normal。

`test.cmd` 使用当前虚拟环境安装deploy/shared/requirements/requirements-test.lock并执行tests/run_acceptance.py。可运行 `test.cmd --dom`：额外需要Node.js/npm，首次执行安装tests/package-lock.json中的依赖。已有JSDOM_PATH时直接使用，不重复安装。测试采用临时数据库，不重建正在使用的开发库。

## 重建范围

专用目录首次使用时必须为空，并创建开发标记；以后可重复使用。路径逃逸、符号链接或未标记的非空目录会被拒绝。重建只删除配置的开发SQLite文件及其侧文件，媒体/快传磁盘文件不会递归清除。

Windows批处理已统一使用CRLF并传递返回码；当前Linux环境能测试共用Python逻辑，实际Windows双击、中文/空格路径和浏览器仍需实机验收。

### 验收报告

在项目根目录 cmd 执行 `deploy\windows\test.cmd --dom --report "%TEMP%\teacher-site-acceptance.json"` 可保存结果。Linux 专用项在 Windows 跳过；缺少符号链接权限时明确标注跳过原因。详细实机步骤见 `docs/features/layout-deploy-step6-v77.md`。
