# tests/unit/frontend-round2.spec.ts

## 文件定位

- **源码路径**：`tests/unit/frontend-round2.spec.ts`
- **功能定位**：原第二轮组件交互回归，新闻列表改为仅标题信息且不请求详情正文，其他已交付功能保持。
- **规模**：116 行，10423 字节
- **内容校验**：SHA-256 `766a585fcf87e650f8b934b435c9c3469aeed8594c2bd7bc94456c46dba80b28`

## 使用与维护

原第二轮组件交互回归，新闻列表改为仅标题信息且不请求详情正文，其他已交付功能保持。

## 直接依赖

- `vitest`
- `vue`
- `../../shared/utils/project-amount`
- `../../shared/utils/public-list-link`
- `../../shared/contracts/public-content`
- `../../app/components/public/ProfileLinks.vue`
- `../../app/components/public/content/StudentGroups.vue`
- `../../app/components/public/content/NewsRows.vue`
- `../../app/components/public/content/NewsBody.vue`
- `../../app/components/public/content/FilterPanel.vue`
- `../../app/components/public/NavigationLink.vue`

本轮实现与验证详见 `docs/42_前台第三轮正文与页脚优化.md`。
