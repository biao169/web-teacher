import { getQuery,getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMediaService } from '~~/server/services/complete-admin/media-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['media','media_assets'],'delete',{write:true});return await new CompleteAdminMediaService(event,p).purge(getRouterParam(event,'uid'),getQuery(event).updatedAt)}catch(error){mapAdminError(event,error)}})
