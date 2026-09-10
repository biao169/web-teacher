import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminAuthService } from '~~/server/services/complete-admin/auth-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['auth','auth_roles','roles'],'create',{write:true});return{role:await new CompleteAdminAuthService(event,p).saveRole(null,await readBoundedJson(event))}}catch(error){mapAdminError(event,error)}})
