# server/services/public/public-content-blocks.ts

## 文件定位

- **源码路径**：`server/services/public/public-content-blocks.ts`
- **功能定位**：正文白名单净化、类型化媒体引用提取与PDF受控地址转换；网站设置页脚支持安全HTML及纯文本换行，脚本、事件和未授权媒体不输出。
- **规模**：293 行，13488 字节
- **内容校验**：SHA-256 `313452bb5b8a94bcfb0a32f794e2866542eeec89b3f5baaab547194a5fa216d8`

## 使用与维护

正文白名单净化、类型化媒体引用提取与PDF受控地址转换；网站设置页脚支持安全HTML及纯文本换行，脚本、事件和未授权媒体不输出。

## 直接依赖

- `../../../shared/contracts/public-content`
- `../../../shared/utils/unicode`
- `./errors`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
