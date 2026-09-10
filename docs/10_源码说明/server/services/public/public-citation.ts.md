# server/services/public/public-citation.ts

## 文件定位

- **源码路径**：`server/services/public/public-citation.ts`
- **功能定位**：共用引用契约、服务或前台分段/批次辅助；具体方法与预算见下文。
- **规模**：39 行，2874 字节
- **内容校验**：SHA-256 `7f45ef018335a74f9729350684cc00b7487f96bacb3e4044092fbaafa920b94b`

## 使用与维护

共用引用契约、服务或前台分段/批次辅助；具体方法与预算见下文。

命名函数：`splitCitationHighlights`、`publicCitation`。

## 方法与保真

publicCitation优先使用已保存引文；没有保存文本时，仅在题名、作者、出版物、年份和可识别期刊/会议类型齐备时调用原后台generatePublicationCitations。省略缺失卷期页码，不补造元数据，不写数据库。splitCitationHighlights按分号、换行等分隔，保留Zhang, M.中的逗号；最多24个、各256字节。原文上限32000字节，经现有存储/序列化链路NFC归一化，内部空格、标点、已有编号/星号、大小写原样保留。标签形文本作为文字转义渲染，不注入HTML。

## 直接依赖

- `../../../shared/admin/publication-tools`
- `../../../shared/contracts/public-citation`
- `../../../shared/utils/unicode`
- `./errors`

本步说明见 `docs/26_前台论文引文展示验收.md`；第7步已按最新范围完成统一复制与滚动加载，Word专项适配已取消；第8步首页与详情整合待执行。
