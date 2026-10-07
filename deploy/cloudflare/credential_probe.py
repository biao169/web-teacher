"""Fixed read-only D1 probe: never return the key or its fingerprint."""
SQL="""WITH credential AS (SELECT value FROM service_meta WHERE key='site_sync.credentials.v1')
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM credential) THEN 'missing'
WHEN (SELECT json_valid(value) FROM credential)=0 THEN 'invalid'
WHEN (SELECT length(value)<=2048 AND json_extract(value,'$.version')=1
 AND json_type(value,'$.version') IN ('integer','real')
 AND json_type(value,'$.key')='text'
 AND length(json_extract(value,'$.key'))=64
 AND json_extract(value,'$.key') NOT GLOB '*[^0-9a-fA-F]*'
 AND json_type(value,'$.revision')='text'
 AND json_type(value,'$.updated_at')='text'
 AND json_type(value,'$.updated_by')='text' FROM credential) THEN 'valid'
ELSE 'invalid' END AS state"""
