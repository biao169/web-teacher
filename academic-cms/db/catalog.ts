// Generated from db/schema-spec.json. Edit the spec, then run db:generate.
import type { TableSpec } from './schema-types'

export const catalog = {
  "media_assets": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "object_key": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "unique": true
      },
      "title": {
        "kind": "text",
        "nullable": true
      },
      "category": {
        "kind": "text",
        "nullable": true
      },
      "mime_type": {
        "kind": "text",
        "nullable": true
      },
      "size": {
        "kind": "integer",
        "nullable": false,
        "default": 0,
        "min": 0
      },
      "storage_kind": {
        "kind": "text",
        "nullable": false,
        "enum": [
          "static",
          "local",
          "r2",
          "external"
        ],
        "default": "local"
      },
      "status": {
        "kind": "text",
        "nullable": false,
        "enum": [
          "active",
          "trash"
        ],
        "default": "active"
      },
      "checksum": {
        "kind": "text",
        "nullable": true
      }
    },
    "indexes": [
      {
        "name": "idx_media_assets_status_category_mime",
        "columns": [
          "status",
          "category",
          "mime_type",
          "id"
        ]
      }
    ],
    "search": [
      "title",
      "object_key",
      "category",
      "mime_type"
    ],
    "deletable": true
  },
  "auth_roles": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "level": {
        "kind": "integer",
        "nullable": false,
        "default": 0,
        "min": 0
      },
      "description": {
        "kind": "text",
        "nullable": true
      },
      "visibility_scopes": {
        "kind": "json",
        "nullable": false,
        "default": [
          "public"
        ],
        "jsonType": "array"
      },
      "is_system": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "is_active": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [],
    "search": [
      "name"
    ],
    "deletable": false
  },
  "auth_users": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "username": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 150
      },
      "password_hash": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "display_name": {
        "kind": "text",
        "nullable": true
      },
      "email": {
        "kind": "text",
        "nullable": true
      },
      "role_uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "references": {
          "table": "auth_roles",
          "column": "uid",
          "onDelete": "restrict"
        }
      },
      "status": {
        "kind": "text",
        "nullable": false,
        "enum": [
          "active",
          "disabled",
          "locked"
        ],
        "default": "disabled"
      },
      "must_change_password": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "last_login_at": {
        "kind": "text",
        "nullable": true,
        "format": "timestamp"
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      }
    },
    "indexes": [
      {
        "name": "idx_auth_users_role_uid",
        "columns": [
          "role_uid"
        ]
      },
      {
        "name": "idx_auth_users_username_nocase",
        "columns": [
          {
            "field": "username",
            "collate": "nocase"
          }
        ],
        "unique": true
      }
    ],
    "search": [
      "username",
      "display_name",
      "email"
    ],
    "deletable": false
  },
  "auth_permissions": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "role_uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "references": {
          "table": "auth_roles",
          "column": "uid",
          "onDelete": "restrict"
        }
      },
      "module": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "can_view": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "can_create": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "can_edit": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "can_delete": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "can_export": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_auth_permissions_role_uid",
        "columns": [
          "role_uid"
        ]
      },
      {
        "name": "idx_auth_permissions_role_module",
        "columns": [
          "role_uid",
          "module"
        ],
        "unique": true
      }
    ],
    "search": [],
    "deletable": false
  },
  "profiles": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "name_en": {
        "kind": "text",
        "nullable": true
      },
      "role": {
        "kind": "text",
        "nullable": true
      },
      "title": {
        "kind": "text",
        "nullable": true
      },
      "organization": {
        "kind": "text",
        "nullable": true
      },
      "lab": {
        "kind": "text",
        "nullable": true
      },
      "avatar_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "email": {
        "kind": "text",
        "nullable": true
      },
      "phone": {
        "kind": "text",
        "nullable": true
      },
      "office": {
        "kind": "text",
        "nullable": true
      },
      "bio": {
        "kind": "text",
        "nullable": true
      },
      "bio_en": {
        "kind": "text",
        "nullable": true
      },
      "education": {
        "kind": "text",
        "nullable": true
      },
      "experience": {
        "kind": "text",
        "nullable": true
      },
      "recruiting": {
        "kind": "text",
        "nullable": true
      },
      "orcid": {
        "kind": "text",
        "nullable": true
      },
      "personal_homepage": {
        "kind": "text",
        "nullable": true
      },
      "google_scholar": {
        "kind": "text",
        "nullable": true
      },
      "dblp": {
        "kind": "text",
        "nullable": true
      },
      "github": {
        "kind": "text",
        "nullable": true
      },
      "cnki": {
        "kind": "text",
        "nullable": true
      },
      "contact_visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_active": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      },
      "orcid_value": {
        "kind": "integer",
        "nullable": true,
        "min": 0
      },
      "personal_homepage_value": {
        "kind": "integer",
        "nullable": true,
        "min": 0
      },
      "google_scholar_value": {
        "kind": "integer",
        "nullable": true,
        "min": 0
      },
      "dblp_value": {
        "kind": "integer",
        "nullable": true,
        "min": 0
      },
      "github_value": {
        "kind": "integer",
        "nullable": true,
        "min": 0
      },
      "cnki_value": {
        "kind": "integer",
        "nullable": true,
        "min": 0
      }
    },
    "indexes": [
      {
        "name": "idx_profiles_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_profiles_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_profiles_avatar_key",
        "columns": [
          "avatar_key"
        ]
      },
      {
        "name": "idx_profiles_visibility_active_sort",
        "columns": [
          "visibility",
          "is_active",
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "name",
      "name_en",
      "organization",
      "title"
    ],
    "deletable": true
  },
  "site_settings": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "is_active": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "site_name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "site_name_en": {
        "kind": "text",
        "nullable": true
      },
      "hero_title": {
        "kind": "text",
        "nullable": true
      },
      "hero_subtitle": {
        "kind": "text",
        "nullable": true
      },
      "logo_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "favicon_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "og_image_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "seo_title": {
        "kind": "text",
        "nullable": true
      },
      "seo_description": {
        "kind": "text",
        "nullable": true
      },
      "seo_keywords": {
        "kind": "text",
        "nullable": true
      },
      "footer_text": {
        "kind": "text",
        "nullable": true
      },
      "homepage_profile_uid": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "profiles",
          "column": "uid",
          "onDelete": "set null"
        }
      },
      "homepage_publication_limit": {
        "kind": "integer",
        "nullable": false,
        "default": 6,
        "min": 0
      },
      "homepage_news_limit": {
        "kind": "integer",
        "nullable": false,
        "default": 5,
        "min": 0
      }
    },
    "indexes": [
      {
        "name": "idx_site_settings_logo_key",
        "columns": [
          "logo_key"
        ]
      },
      {
        "name": "idx_site_settings_favicon_key",
        "columns": [
          "favicon_key"
        ]
      },
      {
        "name": "idx_site_settings_og_image_key",
        "columns": [
          "og_image_key"
        ]
      },
      {
        "name": "idx_site_settings_homepage_profile_uid",
        "columns": [
          "homepage_profile_uid"
        ]
      },
      {
        "name": "idx_site_settings_one_active",
        "columns": [
          "is_active"
        ],
        "unique": true,
        "where": "\"is_active\" = 1"
      }
    ],
    "search": [],
    "deletable": false
  },
  "global_settings": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "allow_public_registration": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "allow_anonymous_messages": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "upload_max_size_mb": {
        "kind": "integer",
        "nullable": false,
        "default": 20,
        "min": 1
      },
      "upload_allowed_extensions": {
        "kind": "json",
        "nullable": false,
        "default": [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "pdf"
        ],
        "jsonType": "array"
      },
      "media_trash_retention_days": {
        "kind": "integer",
        "nullable": false,
        "default": 30,
        "min": 0
      },
      "news_pdf_engine": {
        "kind": "text",
        "nullable": true
      },
      "news_pdf_allow_download": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "news_pdf_watermark": {
        "kind": "text",
        "nullable": true
      },
      "translation_provider": {
        "kind": "text",
        "nullable": true
      },
      "translation_providers": {
        "kind": "json",
        "nullable": false,
        "default": [],
        "jsonType": "array"
      },
      "libretranslate_url": {
        "kind": "text",
        "nullable": true
      },
      "libretranslate_api_key": {
        "kind": "text",
        "nullable": true
      },
      "deepl_api_key": {
        "kind": "text",
        "nullable": true
      },
      "google_translate_api_key": {
        "kind": "text",
        "nullable": true
      },
      "microsoft_translator_key": {
        "kind": "text",
        "nullable": true
      },
      "microsoft_translator_region": {
        "kind": "text",
        "nullable": true
      },
      "microsoft_translator_endpoint": {
        "kind": "text",
        "nullable": true
      },
      "mymemory_email": {
        "kind": "text",
        "nullable": true
      },
      "translation_batch_size": {
        "kind": "integer",
        "nullable": false,
        "default": 10,
        "min": 1,
        "max": 50
      },
      "translation_worker_count": {
        "kind": "integer",
        "nullable": false,
        "default": 2,
        "min": 1,
        "max": 8
      },
      "translation_timeout_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 15,
        "min": 1,
        "max": 120
      },
      "translation_job_state": {
        "kind": "json",
        "nullable": false,
        "default": {},
        "jsonType": "object"
      },
      "publication_metadata_provider": {
        "kind": "text",
        "nullable": true
      },
      "publication_metadata_providers": {
        "kind": "json",
        "nullable": false,
        "default": [],
        "jsonType": "array"
      },
      "publication_display_style": {
        "kind": "text",
        "nullable": true
      },
      "publication_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "profile_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "project_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "patent_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "student_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "news_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "course_suggestion_cache_seconds": {
        "kind": "integer",
        "nullable": false,
        "default": 60,
        "min": 0
      },
      "patent_metadata_providers": {
        "kind": "json",
        "nullable": false,
        "default": [],
        "jsonType": "array"
      },
      "patentsview_api_key": {
        "kind": "text",
        "nullable": true
      },
      "epo_ops_client_id": {
        "kind": "text",
        "nullable": true
      },
      "epo_ops_client_secret": {
        "kind": "text",
        "nullable": true
      },
      "notify_email": {
        "kind": "text",
        "nullable": true
      }
    },
    "indexes": [],
    "search": [],
    "deletable": false
  },
  "navigation_items": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "title": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "title_en": {
        "kind": "text",
        "nullable": true
      },
      "kind": {
        "kind": "text",
        "nullable": true
      },
      "url_name": {
        "kind": "text",
        "nullable": true
      },
      "path": {
        "kind": "text",
        "nullable": true
      },
      "fragment": {
        "kind": "text",
        "nullable": true
      },
      "icon": {
        "kind": "text",
        "nullable": true
      },
      "style": {
        "kind": "text",
        "nullable": true
      },
      "location": {
        "kind": "text",
        "nullable": true
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "enabled": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_navigation_items_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_navigation_items_location",
        "columns": [
          "location",
          "enabled",
          "visibility",
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "title"
    ],
    "deletable": true
  },
  "research_interests": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "name_en": {
        "kind": "text",
        "nullable": true
      },
      "description": {
        "kind": "text",
        "nullable": true
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      }
    },
    "indexes": [
      {
        "name": "idx_research_interests_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "name"
    ],
    "deletable": true
  },
  "publications": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "title": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "source_citation": {
        "kind": "text",
        "nullable": true
      },
      "authors": {
        "kind": "text",
        "nullable": true
      },
      "venue": {
        "kind": "text",
        "nullable": true
      },
      "year": {
        "kind": "integer",
        "nullable": true,
        "min": 1,
        "max": 9999
      },
      "volume": {
        "kind": "text",
        "nullable": true
      },
      "issue": {
        "kind": "text",
        "nullable": true
      },
      "pages": {
        "kind": "text",
        "nullable": true
      },
      "doi": {
        "kind": "text",
        "nullable": true
      },
      "url": {
        "kind": "text",
        "nullable": true
      },
      "pdf_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "bibtex": {
        "kind": "text",
        "nullable": true
      },
      "citation_gbt": {
        "kind": "text",
        "nullable": true
      },
      "citation_elsevier": {
        "kind": "text",
        "nullable": true
      },
      "citation_apa": {
        "kind": "text",
        "nullable": true
      },
      "citation_ieee": {
        "kind": "text",
        "nullable": true
      },
      "highlight_gbt": {
        "kind": "text",
        "nullable": true
      },
      "highlight_elsevier": {
        "kind": "text",
        "nullable": true
      },
      "highlight_apa": {
        "kind": "text",
        "nullable": true
      },
      "highlight_ieee": {
        "kind": "text",
        "nullable": true
      },
      "publication_type": {
        "kind": "text",
        "nullable": true
      },
      "author_role": {
        "kind": "text",
        "nullable": true
      },
      "corresponding_authors": {
        "kind": "text",
        "nullable": true
      },
      "index_type": {
        "kind": "text",
        "nullable": true
      },
      "display_tags": {
        "kind": "text",
        "nullable": true
      },
      "abstract": {
        "kind": "text",
        "nullable": true
      },
      "keywords": {
        "kind": "text",
        "nullable": true
      },
      "pdf_visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_publications_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_publications_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_publications_pdf_key",
        "columns": [
          "pdf_key"
        ]
      },
      {
        "name": "idx_publications_visibility_year",
        "columns": [
          "visibility",
          {
            "field": "year",
            "direction": "desc"
          },
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "title",
      "authors",
      "venue",
      "doi"
    ],
    "deletable": true
  },
  "projects": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "source": {
        "kind": "text",
        "nullable": true
      },
      "fund_name": {
        "kind": "text",
        "nullable": true
      },
      "project_number": {
        "kind": "text",
        "nullable": true
      },
      "project_role": {
        "kind": "text",
        "nullable": true
      },
      "principal": {
        "kind": "text",
        "nullable": true
      },
      "members": {
        "kind": "text",
        "nullable": true
      },
      "start_date": {
        "kind": "text",
        "nullable": true,
        "format": "date"
      },
      "end_date": {
        "kind": "text",
        "nullable": true,
        "format": "date"
      },
      "status": {
        "kind": "text",
        "nullable": true
      },
      "amount": {
        "kind": "text",
        "nullable": true,
        "format": "decimal"
      },
      "summary": {
        "kind": "text",
        "nullable": true
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_projects_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_projects_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_projects_visibility_start_date",
        "columns": [
          "visibility",
          {
            "field": "start_date",
            "direction": "desc"
          },
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "name",
      "project_number",
      "principal",
      "members"
    ],
    "deletable": true
  },
  "patents": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "country": {
        "kind": "text",
        "nullable": true
      },
      "patent_type": {
        "kind": "text",
        "nullable": true
      },
      "application_number": {
        "kind": "text",
        "nullable": true
      },
      "grant_number": {
        "kind": "text",
        "nullable": true
      },
      "application_date": {
        "kind": "text",
        "nullable": true,
        "format": "date"
      },
      "grant_date": {
        "kind": "text",
        "nullable": true,
        "format": "date"
      },
      "inventors": {
        "kind": "text",
        "nullable": true
      },
      "owner": {
        "kind": "text",
        "nullable": true
      },
      "legal_status": {
        "kind": "text",
        "nullable": true
      },
      "summary": {
        "kind": "text",
        "nullable": true
      },
      "certificate_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_patents_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_patents_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_patents_certificate_key",
        "columns": [
          "certificate_key"
        ]
      }
    ],
    "search": [
      "name",
      "application_number",
      "grant_number",
      "inventors"
    ],
    "deletable": true
  },
  "students": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "name_en": {
        "kind": "text",
        "nullable": true
      },
      "avatar_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "student_id": {
        "kind": "text",
        "nullable": true
      },
      "degree": {
        "kind": "text",
        "nullable": true
      },
      "category": {
        "kind": "text",
        "nullable": true
      },
      "grade": {
        "kind": "text",
        "nullable": true
      },
      "direction": {
        "kind": "text",
        "nullable": true
      },
      "status": {
        "kind": "text",
        "nullable": true
      },
      "email": {
        "kind": "text",
        "nullable": true
      },
      "homepage": {
        "kind": "text",
        "nullable": true
      },
      "enrollment_date": {
        "kind": "text",
        "nullable": true,
        "format": "date"
      },
      "graduation_date": {
        "kind": "text",
        "nullable": true,
        "format": "date"
      },
      "destination": {
        "kind": "text",
        "nullable": true
      },
      "awards": {
        "kind": "text",
        "nullable": true
      },
      "bio": {
        "kind": "text",
        "nullable": true
      },
      "contact_visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_students_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_students_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_students_avatar_key",
        "columns": [
          "avatar_key"
        ]
      },
      {
        "name": "idx_students_group",
        "columns": [
          "visibility",
          "category",
          "status",
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "name",
      "name_en",
      "degree",
      "direction"
    ],
    "deletable": true
  },
  "student_category_displays": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "key": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "unique": true
      },
      "label": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "label_en": {
        "kind": "text",
        "nullable": true
      },
      "keywords": {
        "kind": "text",
        "nullable": true
      },
      "enabled": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "display_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [],
    "search": [
      "label"
    ],
    "deletable": true
  },
  "news": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "title": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "slug": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "unique": true
      },
      "category": {
        "kind": "text",
        "nullable": true
      },
      "cover_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "content": {
        "kind": "text",
        "nullable": true
      },
      "content_format": {
        "kind": "text",
        "nullable": false,
        "enum": [
          "plain",
          "html",
          "markdown"
        ],
        "default": "plain"
      },
      "related_publication_uid": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "publications",
          "column": "uid",
          "onDelete": "set null"
        }
      },
      "related_project_uid": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "projects",
          "column": "uid",
          "onDelete": "set null"
        }
      },
      "related_student_uid": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "students",
          "column": "uid",
          "onDelete": "set null"
        }
      },
      "allow_comments": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "published_at": {
        "kind": "text",
        "nullable": true,
        "format": "timestamp"
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_news_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_news_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_news_cover_key",
        "columns": [
          "cover_key"
        ]
      },
      {
        "name": "idx_news_related_publication_uid",
        "columns": [
          "related_publication_uid"
        ]
      },
      {
        "name": "idx_news_related_project_uid",
        "columns": [
          "related_project_uid"
        ]
      },
      {
        "name": "idx_news_related_student_uid",
        "columns": [
          "related_student_uid"
        ]
      },
      {
        "name": "idx_news_published",
        "columns": [
          "visibility",
          {
            "field": "published_at",
            "direction": "desc"
          },
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "title",
      "category"
    ],
    "deletable": true
  },
  "courses": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "semester": {
        "kind": "text",
        "nullable": true
      },
      "audience": {
        "kind": "text",
        "nullable": true
      },
      "summary": {
        "kind": "text",
        "nullable": true
      },
      "syllabus_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "material_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "material_visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "references_text": {
        "kind": "text",
        "nullable": true
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      },
      "is_featured": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "sort_order": {
        "kind": "integer",
        "nullable": false,
        "default": 0
      }
    },
    "indexes": [
      {
        "name": "idx_courses_visibility_sort",
        "columns": [
          "visibility",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_courses_featured",
        "columns": [
          "visibility",
          "is_featured",
          "sort_order",
          "id"
        ]
      },
      {
        "name": "idx_courses_syllabus_key",
        "columns": [
          "syllabus_key"
        ]
      },
      {
        "name": "idx_courses_material_key",
        "columns": [
          "material_key"
        ]
      },
      {
        "name": "idx_courses_visibility_semester",
        "columns": [
          "visibility",
          {
            "field": "semester",
            "direction": "desc"
          },
          "sort_order",
          "id"
        ]
      }
    ],
    "search": [
      "name",
      "semester"
    ],
    "deletable": true
  },
  "messages": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "name": {
        "kind": "text",
        "nullable": true
      },
      "email": {
        "kind": "text",
        "nullable": true
      },
      "message_type": {
        "kind": "text",
        "nullable": true
      },
      "subject": {
        "kind": "text",
        "nullable": true
      },
      "content": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "attachment_key": {
        "kind": "text",
        "nullable": true,
        "references": {
          "table": "media_assets",
          "column": "object_key",
          "onDelete": "restrict"
        }
      },
      "status": {
        "kind": "text",
        "nullable": false,
        "default": "new"
      },
      "visibility": {
        "kind": "text",
        "nullable": false,
        "default": "hidden",
        "enum": [
          "public",
          "authenticated",
          "staff",
          "owner",
          "hidden"
        ]
      }
    },
    "indexes": [
      {
        "name": "idx_messages_attachment_key",
        "columns": [
          "attachment_key"
        ]
      },
      {
        "name": "idx_messages_status_created",
        "columns": [
          "status",
          {
            "field": "created_at",
            "direction": "desc"
          },
          "id"
        ]
      }
    ],
    "search": [
      "name",
      "email",
      "subject",
      "content"
    ],
    "deletable": true
  },
  "translation_cache": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "source_hash": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 64,
        "minLength": 64
      },
      "source_ref_key": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "source_text": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "source_lang": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "target_lang": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "translated_text": {
        "kind": "text",
        "nullable": true
      },
      "provider": {
        "kind": "text",
        "nullable": true
      },
      "status": {
        "kind": "text",
        "nullable": false,
        "enum": [
          "pending",
          "success",
          "failed"
        ],
        "default": "pending"
      },
      "is_manual": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "is_current": {
        "kind": "boolean",
        "nullable": false,
        "default": false
      },
      "source_refs": {
        "kind": "json",
        "nullable": false,
        "default": [],
        "jsonType": "array"
      },
      "error_message": {
        "kind": "text",
        "nullable": true
      }
    },
    "indexes": [
      {
        "name": "idx_translation_cache_hash_language",
        "columns": [
          "source_hash",
          "target_lang",
          "is_current"
        ]
      },
      {
        "name": "idx_translation_cache_ref_language",
        "columns": [
          "source_ref_key",
          "target_lang",
          "is_current"
        ]
      },
      {
        "name": "idx_translation_cache_one_current",
        "columns": [
          "source_ref_key",
          "target_lang"
        ],
        "unique": true,
        "where": "\"is_current\" = 1 AND \"status\" = 'success'"
      }
    ],
    "search": [
      "source_ref_key",
      "source_text",
      "translated_text"
    ],
    "deletable": true
  },
  "operation_logs": {
    "columns": {
      "id": {
        "kind": "integer",
        "nullable": false,
        "primary": true,
        "autoIncrement": true
      },
      "uid": {
        "kind": "text",
        "nullable": false,
        "required": true,
        "maxLength": 128,
        "unique": true
      },
      "created_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "updated_at": {
        "kind": "text",
        "nullable": false,
        "format": "timestamp",
        "defaultSql": "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      },
      "actor_uid": {
        "kind": "text",
        "nullable": true
      },
      "actor_name": {
        "kind": "text",
        "nullable": true
      },
      "action": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "module": {
        "kind": "text",
        "nullable": false,
        "required": true
      },
      "target_uid": {
        "kind": "text",
        "nullable": true
      },
      "summary": {
        "kind": "text",
        "nullable": true
      },
      "detail_json": {
        "kind": "json",
        "nullable": false,
        "default": {},
        "jsonType": "object"
      },
      "status": {
        "kind": "text",
        "nullable": true
      }
    },
    "indexes": [
      {
        "name": "idx_operation_logs_module_created",
        "columns": [
          "module",
          {
            "field": "created_at",
            "direction": "desc"
          },
          "id"
        ]
      }
    ],
    "search": [
      "actor_name",
      "action",
      "module",
      "summary"
    ],
    "deletable": false
  }
} as const satisfies Record<string, TableSpec>
