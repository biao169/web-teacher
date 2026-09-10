import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['auth','auth_users','users'],'create',{write:true});return{user:await new CompleteAdminAuthService(event,p).createUser(await readBoundedJson(event))}}catch(error){mapAdminError(event,error)}})
