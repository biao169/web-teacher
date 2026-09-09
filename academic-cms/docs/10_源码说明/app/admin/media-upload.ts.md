# app / admin / media-upload.ts

## 文件定位

- **源码路径**：`app/admin/media-upload.ts`
- **文件类型**：程序/脚本
- **功能定位**：将上传接口的驼峰响应转换为列表使用的下划线字段，上传后的本地插入与服务器列表使用相同基础类型。
- **规模**：38 行，941 字节
- **内容校验**：SHA-256 `876480759b5ce95d3c69ae2ef811089ef6feb045e5f1611279ef6954e0cd9b9e`

## 直接依赖

- `./media`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `adminUploadedMediaRow` | 函数，第 25 行 | 上传成功后立即插入响应式列表，无需等待完整列表重新查询。 |

### 调用签名

- `adminUploadedMediaRow`：`export function adminUploadedMediaRow(media: AdminUploadedMedia): AdminUploadedMediaRow`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
