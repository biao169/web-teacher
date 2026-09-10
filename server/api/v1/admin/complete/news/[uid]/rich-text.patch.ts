import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminResourceService } from '~~/server/services/complete-admin/resource-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['news'],'edit',{write:true});const body=await readBoundedJson(event,2*1024*1024);return{record:await new CompleteAdminResourceService(event,p).updateNewsRichText(getRouterParam(event,'uid'),body)}}catch(error){mapAdminError(event,error)}})
