<script setup lang="ts">
import AdminCompleteResourceWorkspace from '../../../components/admin/complete/AdminCompleteResourceWorkspace.vue'
definePageMeta({layout:'admin'});useHead({title:'导航与按钮 · 后台'})
</script><template><AdminCompleteResourceWorkspace resource-key="navigation" permission-module="navigation_items" title="导航与按钮" description="管理顶部导航、首页入口、页脚和后台侧栏链接；站内路径与 HTTPS 外链分别校验。"/></template>
