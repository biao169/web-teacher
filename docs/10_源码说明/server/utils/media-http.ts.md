# server/utils/media-http.ts

## 文件定位

- **源码路径**：`server/utils/media-http.ts`
- **功能定位**：公开导出媒体失败响应边界，供新闻PDF读取复用统一404/416等错误处理与不缓存策略。
- **规模**：66 行，3411 字节
- **内容校验**：SHA-256 `79a5e79e3bae95281b07473fa9d57c65578f42407e11b08538944874a4486daa`

## 使用与维护

公开导出媒体失败响应边界，供新闻PDF读取复用统一404/416等错误处理与不缓存策略。

## 直接依赖

- `h3`
- `../security/errors`
- `./auth-runtime`
- `../media/object-key`
- `../media/errors`
- `./media-runtime`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
