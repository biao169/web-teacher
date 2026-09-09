import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['auth','auth_permissions','permissions'],'edit',{write:true});return await new CompleteAdminAuthService(event,p).savePermissions(getRouterParam(event,'uid'),await readBoundedJson(event,256*1024))}catch(error){mapAdminError(event,error)}})
