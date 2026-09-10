# app / admin / media-crop.ts

## 文件定位

- **源码路径**：`app/admin/media-crop.ts`
- **文件类型**：程序/脚本
- **功能定位**：裁剪比例预设与原图坐标运算；缩放按原图焦点计算裁剪框，点击坐标映射回原图比例。
- **规模**：68 行，2490 字节
- **内容校验**：SHA-256 `f9a0595e10e2c6784a8915f4ea988db4f0237e813ecbdf538e67ed7ba051f33e`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `bounded` | 函数，第 30 行 | 把数值限制在闭区间内，供焦点与裁剪边界计算。 |
| `adminCropRect` | 函数，第 34 行 | 校验原图尺寸、目标比例和缩放；围绕焦点计算不超出原图的矩形。 |
| `adminCropFocusAtPoint` | 函数，第 55 行 | 把画布点击映射回裁剪框对应的原图归一化坐标；无有效尺寸时返回中心。 |

### 调用签名

- `bounded`：`function bounded(value: number, minimum: number, maximum: number): number`
- `adminCropRect`：`export function adminCropRect( imageWidth: number, imageHeight: number, targetRatio: number, zoom: number, focus: AdminCropFocus, ): AdminCropRect`
- `adminCropFocusAtPoint`：`export function adminCropFocusAtPoint( rect: AdminCropRect, imageWidth: number, imageHeight: number, canvasX: number, canvasY: number, canvasWidth: number, canvasHeight: number, ): AdminCropFocus`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
