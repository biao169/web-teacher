"""One durable revision, advanced atomically with public business writes."""
import re,secrets
KEY='public_cache_revision'
TABLES=frozenset('profiles students research_interests projects publications patents courses news student_category_displays navigation_items site_settings global_settings translation_cache media_assets news_publications news_projects news_students'.split())
WRITE=re.compile(r'^\s*(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`\[]?(\w+)',re.I)
def revision_write(statements):
    if any((m:=WRITE.match(sql)) and (m[1].lower() in TABLES or m[1].lower().startswith('news_')) for sql,args in statements):
        return ("INSERT INTO service_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(KEY,secrets.token_hex(16)))
async def revision(sql):
    rows=await sql.query('SELECT value FROM service_meta WHERE key=?',(KEY,))
    return rows[0]['value'] if rows else '0'
