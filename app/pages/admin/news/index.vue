<script setup lang="ts">
import AdminCompleteResourceWorkspace from '../../../components/admin/complete/AdminCompleteResourceWorkspace.vue'
definePageMeta({layout:'admin'});useHead({title:'新闻动态 · 后台'})
</script><template><AdminCompleteResourceWorkspace resource-key="news" permission-module="news" title="新闻动态" description="维护新闻标题、分类、关联内容、发布时间和正文；在记录编辑区或列表中打开富文本设计器。"/></template>
