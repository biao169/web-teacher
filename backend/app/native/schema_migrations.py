"""Versioned additive upgrades. Caller owns the lock, backup, transaction and verification."""
from .schema_sources import current_objects

SUPPORTED = ('0.15.37', '0.15.45', '0.15.52', '0.15.65', '0.15.66')
TARGET = '0.15.67'  # Latest structural revision; application releases can be newer.


def media_original_filename():
    return ["ALTER TABLE media_assets ADD COLUMN original_filename TEXT CHECK (original_filename IS NULL OR length(original_filename)<=255)"]


def homepage_project_limit():
    return ["ALTER TABLE site_settings ADD COLUMN homepage_project_limit INTEGER NOT NULL DEFAULT 10 CHECK (typeof(homepage_project_limit) = 'integer' AND homepage_project_limit >= 0)"]


def public_home_settings():
    return [
        "ALTER TABLE site_settings ADD COLUMN homepage_student_limit INTEGER NOT NULL DEFAULT 0 CHECK (typeof(homepage_student_limit) = 'integer' AND homepage_student_limit >= 0)",
        "ALTER TABLE site_settings ADD COLUMN homepage_patent_limit INTEGER NOT NULL DEFAULT 0 CHECK (typeof(homepage_patent_limit) = 'integer' AND homepage_patent_limit >= 0)",
        "ALTER TABLE site_settings ADD COLUMN publication_citation_style TEXT NOT NULL DEFAULT 'gbt' CHECK (publication_citation_style IN ('gbt','elsevier','apa','ieee'))",
    ]


INTEGRATED_OBJECTS = (
    'service_meta', 'admin_grants', 'bridge_nonces', 'tool_settings', 'settings_audit',
    'transfer_allowances', 'vpn_state', 'vpn_grants', 'vpn_audit', 'temporary_shares',
    'recovery_tasks', 'recovery_members', 'bridge_nonce_expiry', 'allowance_identity',
    'allowance_kind', 'allowance_expiry', 'vpn_grants_expiry', 'share_expiry', 'recovery_expiry',
)
CHUNK_OBJECTS = ('transfer_chunks', 'transfer_receivers', 'receiver_expiry', 'receiver_task')


def statements_for(version):
    """An explicit known predecessor is required; this is not a generic schema differ."""
    if version not in SUPPORTED:
        raise ValueError('Unsupported schema predecessor')
    position = SUPPORTED.index(version)
    statements = []
    if position == 0:
        statements += media_original_filename()
    if position <= 1:
        statements += homepage_project_limit()
    if position <= 2:
        statements += public_home_settings()
    ddl = current_objects()
    if position <= 3:
        statements += [ddl[name] for name in INTEGRATED_OBJECTS]
    statements += [ddl[name] for name in CHUNK_OBJECTS]
    statements += [ddl[name] for name in ('transfer_codes','transfer_code_target','transfer_code_expiry')]
    return statements


def apply(connection, version):
    """Execute individual statements so a failure can roll back DDL and data together."""
    for statement in statements_for(version):
        connection.execute(statement)
    from transfer.backend.chunks import index_legacy
    index_legacy(connection)
