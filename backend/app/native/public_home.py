"""Homepage first chunks; subsequent chunks are requested only as readers scroll."""
from .public_data import public_listing,HOME_FIELDS
async def homepage_rows(r,site):
    teacher=await public_listing(r,'profiles',{'f.is_featured':1},profile_overview=True)
    data={'profiles':teacher['rows'][:1]};pages={}
    for table in HOME_FIELDS:
        page=await public_listing(r,table,{},site,home=True)
        data[table]=page['rows'];pages[table]=page
    return data,pages
