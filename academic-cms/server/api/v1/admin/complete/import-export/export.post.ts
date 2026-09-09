import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminTransferService } from '~~/server/services/complete-admin/transfer-service'
import { mapAdminError,readBoundedJson } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{const p=await requireAdmin(event,['import_export'],'export',{write:true});return await new CompleteAdminTransferService(event,p).export(await readBoundedJson(event,256*1024))}catch(error){mapAdminError(event,error)}})
