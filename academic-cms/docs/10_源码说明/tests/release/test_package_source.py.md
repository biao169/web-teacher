# tests / release / test_package_source.py

## 文件定位

- **源码路径**：`tests/release/test_package_source.py`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：68 行，3418 字节
- **内容校验**：SHA-256 `542cac4923551a1a402b46d97b6b49f1f19a441d4acc484b1a66128c217d7007`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `test_report_only_directory_is_rejected` | 测试方法，第 12 行 | 验证只有报告、没有源码的目录不能伪装成源码包。 | 由 `unittest` 自动发现并执行。 |
| `test_archive_paths_reject_escape_and_control_characters` | 测试方法，第 20 行 | 验证归档路径拒绝目录逃逸、绝对路径、反斜杠与控制字符。 | 由 `unittest` 自动发现并执行。 |
| `test_symlink_and_environment_files_are_not_silently_packed` | 测试方法，第 26 行 | 验证符号链接和真实环境变量文件不会被静默打包。 | 由 `unittest` 自动发现并执行。 |
| `test_dependencies_are_excluded_but_regular_source_is_kept` | 测试方法，第 38 行 | 验证依赖目录被排除，同时保留普通源码文件。 | 由 `unittest` 自动发现并执行。 |
| `test_runtime_media_is_excluded_without_dropping_media_source_modules` | 测试方法，第 46 行 | 验证只排除根目录运行时媒体，保留服务端媒体模块与后台页面。 | 由 `unittest` 自动发现并执行。 |
| `test_only_docs_01_through_04_are_protected_baselines` | 测试方法，第 46 行 | 验证不可修改文档集合严格等于 `01–04`。 | 由 `unittest` 自动发现并执行。 |

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PackageTests` | 类，第 11 行 | 封装 Package Tests 的状态与行为 |

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
