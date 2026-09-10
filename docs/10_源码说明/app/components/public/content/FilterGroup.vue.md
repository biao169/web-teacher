# app/components/public/content/FilterGroup.vue

## 文件定位

- **源码路径**：`app/components/public/content/FilterGroup.vue`
- **功能定位**：可搜索且按需分页的单入口下拉：显示字段与已选值；250ms搜索去抖、每次20个候选；关闭和路由切换取消旧请求；键盘列表、焦点返回、外部关闭与视口定位。
- **规模**：172 行，10595 字节
- **内容校验**：SHA-256 `e5f0b697933a3b5dd08d53b3d8aec55aaedfb77295ce1c61caf63b6947094ee4`

## 使用与维护

可搜索且按需分页的单入口下拉：显示字段与已选值；250ms搜索去抖、每次20个候选；关闭和路由切换取消旧请求；键盘列表、焦点返回、外部关闭与视口定位。

命名函数：`cancelRequest`、`close`、`choose`、`browse`、`scheduleSearch`、`positionPopup`、`outside`、`cleanup`、`focusList`、`openFromKeyboard`、`move`。

## 直接依赖

- `@lucide/vue`
- `vue`
- `~~/shared/contracts/public-content`
- `~~/shared/utils/public-list-link`

本步说明见 `docs/36_前台改版_紧凑搜索筛选.md`。卡片、研究标签和一键复制继续按第5–7步实施；真实浏览器视觉验收属于第8步。
