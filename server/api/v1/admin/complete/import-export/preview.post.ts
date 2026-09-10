import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTransferService } from '~~/server/services/complete-admin/transfer-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['import_export'],'create',{write:true});return await new CompleteAdminTransferService(event,p).preview(await readBoundedJson(event,48*1024*1024))}catch(error){mapAdminError(event,error)}})
