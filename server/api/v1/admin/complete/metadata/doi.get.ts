import { getQuery } from 'h3'
import { requireAdmin } from '~~/server/utils/complete-admin/auth'
import { CompleteAdminMetadataService } from '~~/server/services/complete-admin/metadata-service'
import { mapAdminError } from '~~/server/utils/complete-admin/api'
export default defineEventHandler(async(event)=>{try{await requireAdmin(event,['publications'],'edit');return await new CompleteAdminMetadataService(event).doi(getQuery(event).doi)}catch(error){mapAdminError(event,error)}})
