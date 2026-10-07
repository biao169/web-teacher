"""Explicit mappings from the user-selected v0.15.160 website only."""
from backend.app.native.catalog import TABLES,SECRET,CONTENT
SCOPES=(*CONTENT,'student_category_displays','navigation_items','site_settings','translation_cache')
OMIT={'id','error_message','translation_job_state'}|SECRET
COLUMNS={t:tuple(k for k in TABLES[t]['columns'] if k not in OMIT) for t in (*SCOPES,'media_assets')}
RELATIONS={'news':{'related_publication_uid':'publications','related_project_uid':'projects','related_student_uid':'students'},'site_settings':{'homepage_profile_uid':'profiles'}}
def ident(s):
    if s not in TABLES and not any(s in c for c in COLUMNS.values()):raise ValueError('Unknown mapped identifier')
    return '"'+s+'"'
def row_json(t,alias='r'):
    return 'json_object('+','.join("'"+c+"',"+alias+'."'+c+'"' for c in COLUMNS[t])+')'
