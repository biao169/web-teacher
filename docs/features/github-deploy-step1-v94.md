# GitHub 部署第一步 v0.15.94

默认仓库：https://github.com/biao169/web-teacher.git  
默认分支：web-py

install.sh 与 tweb install 已同步默认来源，仍支持 --repo/--branch 覆盖。tweb update 不提供新的默认来源，继续使用安装状态中保存的仓库与分支，避免覆盖已有用户配置。README 与 deploy/linux/README.md 已提供实际 raw 下载地址和一行安装命令；用户只需替换域名，必要时指定 Python 3.12+ 路径。

Git 属性默认保留原始字节，shell脚本按LF签出，Windows命令文件保留CRLF；忽略运行目录、凭据、本机配置、虚拟环境及压缩包。源代码包和Windows包均带.gitignore/.gitattributes。

复用deploy.vps.release的清单生成和校验，增加manifest --refresh；打包器也复用同一写入函数。下载后、安装Python依赖与切换版本前校验release-manifest.json，校验失败删除本次暂存目录。清单完整性不等于代码可信；仍以用户指定、审核的仓库为来源。

验证：29项相关测试全部通过，包括部署生命周期、真实本机子进程HTTP启动/更新/重启、保存来源规则、源码改动检测、Git本地web-py分支克隆与core.autocrlf=true/false字节一致性。测试只使用临时仓库、临时数据及模拟系统命令；未上传GitHub，未连接云服务器，也未执行真实systemd安装。打包时另外检查ZIP和各文件摘要。

数据库schema.sql与v0.15.93一致，教师前后台、文件快传业务未改动。

下一步：统一两位字母加四位数字的传输码登记、生成、防冲突、失效与解析机制，为后续前台输码和后台整合提供共同接口。
