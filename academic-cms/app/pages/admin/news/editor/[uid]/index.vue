<script setup lang="ts">
import AdminCompleteNewsEditor from '../../../../../components/admin/complete/AdminCompleteNewsEditor.vue'
definePageMeta({layout:'admin'});const route=useRoute();const uid=computed(()=>String(route.params.uid||''));useHead({title:'新闻富文本编辑 · 后台'})
</script><template><AdminCompleteNewsEditor :uid="uid"/></template>
