"""Homepage shell: only faculty is read; enabled modules start at page zero."""
from .public_data import public_listing,HOME_FIELDS,home_limit
async def homepage_rows(r,site):
    teacher=await public_listing(r,'profiles',{'f.is_featured':1},profile_overview=True)
    pages={table:{'page':0,'pages':1,'total':0,'query':{'home':'1'}}
           for table in HOME_FIELDS if home_limit(table,site)>0}
    return {'profiles':teacher['rows'][:1]},pages
