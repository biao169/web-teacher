import { getRouterParam } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['auth','auth_users','users'],'edit',{write:true});return{user:await new CompleteAdminAuthService(event,p).updateUser(getRouterParam(event,'uid'),await readBoundedJson(event))}}catch(error){mapAdminError(event,error)}})
