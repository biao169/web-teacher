# scripts / release / package-source.py

## 文件定位

- **源码路径**：`scripts/release/package-source.py`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：167 行，8563 字节
- **内容校验**：SHA-256 `b412845e7852f7a89f7801b4de6347b91bd1902c3f31d054d6f4485a865310c5`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `sha256` | 函数，第 26 行 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `safe_relative` | 函数，第 30 行 | 封装 relative 相关逻辑，供本文件或上层模块按其参数调用 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `require_source` | 函数，第 39 行 | 检查 source 是否满足业务、安全或类型约束 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `enumerate_source` | 函数，第 48 行 | 封装 source 相关逻辑，供本文件或上层模块按其参数调用 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `verify_protected` | 函数，第 73 行 | 检查 protected 是否满足业务、安全或类型约束 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `verify_zip` | 函数，第 90 行 | 检查 zip 是否满足业务、安全或类型约束 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `build_archive` | 函数，第 123 行 | 根据输入组装 archive 所需的结果对象或结构 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |
| `main` | 函数，第 157 行 | 封装 main 相关逻辑，供本文件或上层模块按其参数调用 | 由脚本入口、测试框架或同文件其他函数按参数调用。 |

### 调用签名

- `sha256`：`def sha256(value: bytes)`
- `safe_relative`：`def safe_relative(name: str)`
- `require_source`：`def require_source(root: Path)`
- `enumerate_source`：`def enumerate_source(root: Path)`
- `verify_protected`：`def verify_protected(root: Path)`
- `verify_zip`：`def verify_zip(archive: Path, expected: dict[str, str], protected: dict[str, str])`
- `build_archive`：`def build_archive(root: Path, output: Path)`
- `main`：`def main()`

## 维护注意事项

- `verify_protected` 只保护项目需求基线 `docs/01–04`；`REQUIRED` 另外检查当前设计文档 `09_后台对象编辑统一设计.md` 是否随源码交付。
- 运行时 `media/`、数据库、报告、依赖和构建缓存均不得进入源码交付；公开演示资源只从 `public/demo/` 提供。
- ZIP 使用 Deflate 最高压缩等级，并在生成后执行清单、CRC、路径、权限和独立解压验证。
- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
