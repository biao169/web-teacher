"""
Export the old Django SQLite database into SQL that matches web02's D1 schema.

Usage from web02:
  D:\Python\Miniconda\envs\py312\python.exe tools\export_django_to_cloudflare.py ^
    --source ..\web01\db.sqlite3 ^
    --out data\django_export.sql ^
    --media-manifest data\media_manifest.csv

This script only reads the source database. It does not upload to Cloudflare.
Copy media files from web01/media to web02/public/media or upload them to R2
with the same object keys.
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path


TABLES = {
    "core_sitesetting": (
        "site_settings",
        {
            "config_name": "config_name",
            "is_active": "is_active",
            "site_name": "site_name",
            "site_name_en": "site_name_en",
            "hero_title": "hero_title",
            "hero_title_en": "hero_title_en",
            "hero_subtitle": "hero_subtitle",
            "hero_subtitle_en": "hero_subtitle_en",
            "logo": "logo_key",
            "favicon": "favicon_key",
            "og_image": "og_image_key",
            "seo_title": "seo_title",
            "seo_title_en": "seo_title_en",
            "seo_description": "seo_description",
            "seo_description_en": "seo_description_en",
            "seo_keywords": "seo_keywords",
            "seo_keywords_en": "seo_keywords_en",
            "footer_text": "footer_text",
            "footer_text_en": "footer_text_en",
            "homepage_profile_id": "homepage_profile_id",
            "updated_at": "updated_at",
        },
    ),
    "core_globalsetting": (
        "global_settings",
        {
            "translation_provider": "translation_provider",
            "translation_default_source": "translation_default_source",
            "translation_default_target": "translation_default_target",
            "enable_site_translator": "enable_site_translator",
            "allow_public_registration": "allow_public_registration",
            "publication_metadata_provider": "publication_metadata_provider",
            "publication_metadata_email": "publication_metadata_email",
            "crossref_endpoint": "crossref_endpoint",
            "openalex_endpoint": "openalex_endpoint",
            "publication_metadata_overwrite": "publication_metadata_overwrite",
            "upload_max_size_mb": "upload_max_size_mb",
            "upload_allowed_extensions": "upload_allowed_extensions",
            "news_pdf_engine": "news_pdf_engine",
            "news_pdf_allow_download": "news_pdf_allow_download",
            "news_pdf_watermark": "news_pdf_watermark",
            "allow_anonymous_messages": "allow_anonymous_messages",
            "notify_email": "notify_email",
            "updated_at": "updated_at",
        },
    ),
    "core_navigationitem": ("navigation_items", {"title": "title", "title_en": "title_en", "url_name": "url_name", "fragment": "fragment", "order": "display_order", "enabled": "enabled"}),
    "core_profile": (
        "profiles",
        {
            "name": "name",
            "name_en": "name_en",
            "title": "title",
            "title_en": "title_en",
            "organization": "organization",
            "organization_en": "organization_en",
            "lab": "lab",
            "lab_en": "lab_en",
            "avatar": "avatar_key",
            "email": "email",
            "phone": "phone",
            "office": "office",
            "office_en": "office_en",
            "bio": "bio",
            "bio_en": "bio_en",
            "education": "education",
            "experience": "experience",
            "recruiting": "recruiting",
            "orcid": "orcid",
            "personal_homepage": "personal_homepage",
            "google_scholar": "google_scholar",
            "researchgate": "researchgate",
            "dblp": "dblp",
            "github": "github",
            "cnki": "cnki",
            "contact_visibility": "contact_visibility",
            "is_active": "is_active",
            "sort_order": "sort_order",
        },
    ),
    "core_researchinterest": ("research_interests", {"name": "name", "name_en": "name_en", "description": "description", "description_en": "description_en", "sort_order": "sort_order"}),
    "core_publication": (
        "publications",
        {
            "title": "title",
            "source_citation": "source_citation",
            "citation_source_format": "citation_source_format",
            "citation_style": "citation_style",
            "authors": "authors",
            "venue": "venue",
            "year": "year",
            "volume": "volume",
            "issue": "issue",
            "pages": "pages",
            "doi": "doi",
            "url": "url",
            "pdf": "pdf_key",
            "bibtex": "bibtex",
            "citation": "citation",
            "publication_type": "publication_type",
            "author_role": "author_role",
            "index_type": "index_type",
            "abstract": "abstract",
            "pdf_visibility": "pdf_visibility",
            "visibility": "visibility",
            "is_featured": "is_featured",
            "sort_order": "sort_order",
            "created_at": "created_at",
            "updated_at": "updated_at",
        },
    ),
    "core_project": ("projects", {"name": "name", "source": "source", "fund_name": "fund_name", "project_number": "project_number", "category": "category", "principal": "principal", "members": "members", "start_date": "start_date", "end_date": "end_date", "status": "status", "amount": "amount", "amount_visibility": "amount_visibility", "contract_number": "contract_number", "summary": "summary", "visibility": "visibility", "is_featured": "is_featured", "sort_order": "sort_order", "created_at": "created_at", "updated_at": "updated_at"}),
    "core_patent": ("patents", {"name": "name", "name_en": "name_en", "country": "country", "patent_type": "patent_type", "application_number": "application_number", "grant_number": "grant_number", "application_date": "application_date", "grant_date": "grant_date", "inventors": "inventors", "owner": "owner", "legal_status": "legal_status", "summary": "summary", "certificate": "certificate_key", "visibility": "visibility", "is_featured": "is_featured", "sort_order": "sort_order", "created_at": "created_at", "updated_at": "updated_at"}),
    "core_student": ("students", {"name": "name", "name_en": "name_en", "avatar": "avatar_key", "student_id": "student_id", "degree": "degree", "category": "category", "grade": "grade", "direction": "direction", "status": "status", "email": "email", "phone": "phone", "homepage": "homepage", "enrollment_date": "enrollment_date", "graduation_date": "graduation_date", "destination": "destination", "awards": "awards", "contact_visibility": "contact_visibility", "visibility": "visibility", "is_featured": "is_featured", "sort_order": "sort_order", "created_at": "created_at", "updated_at": "updated_at"}),
    "core_studentcategorydisplay": ("student_category_displays", {"key": "key", "label": "label", "label_en": "label_en", "keywords": "keywords", "order": "display_order", "enabled": "enabled"}),
    "core_news": ("news", {"title": "title", "slug": "slug", "category": "category", "cover": "cover_key", "content": "content", "content_format": "content_format", "allow_comments": "allow_comments", "published_at": "published_at", "visibility": "visibility", "is_featured": "is_featured", "sort_order": "sort_order", "created_at": "created_at", "updated_at": "updated_at"}),
    "core_course": ("courses", {"name": "name", "semester": "semester", "audience": "audience", "summary": "summary", "syllabus": "syllabus_key", "material": "material_key", "material_visibility": "material_visibility", "references": "references_text", "visibility": "visibility", "is_featured": "is_featured", "sort_order": "sort_order", "created_at": "created_at", "updated_at": "updated_at"}),
    "core_message": ("messages", {"name": "name", "email": "email", "message_type": "message_type", "subject": "subject", "content": "content", "attachment": "attachment_key", "status": "status", "created_at": "created_at"}),
    "core_mediaasset": ("media_assets", {"file": "object_key", "title": "title", "category": "category", "uploaded_at": "uploaded_at"}),
}


FILE_COLUMNS = {"logo", "favicon", "og_image", "avatar", "pdf", "certificate", "cover", "syllabus", "material", "attachment", "file"}


def quote_sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"


def quote_ident(value):
    return '"' + str(value).replace('"', '""') + '"'


def table_exists(conn, name):
    row = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
    return bool(row)


def columns(conn, name):
    return [row[1] for row in conn.execute(f"PRAGMA table_info({name})")]


def export(args):
    source = Path(args.source)
    out = Path(args.out)
    manifest = Path(args.media_manifest)
    out.parent.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(source)
    conn.row_factory = sqlite3.Row
    statements = ["PRAGMA foreign_keys = OFF;"]
    media_rows = []
    for old_table, (new_table, mapping) in TABLES.items():
        if not table_exists(conn, old_table):
            continue
        old_columns = set(columns(conn, old_table))
        selected = [name for name in mapping if name in old_columns]
        if not selected:
            continue
        select_list = ", ".join(["id"] + [quote_ident(name) for name in selected])
        for row in conn.execute(f"SELECT {select_list} FROM {quote_ident(old_table)}"):
            names = ["id"] + [mapping[name] for name in selected]
            values = [row["id"]] + [row[name] for name in selected]
            statements.append(
                f"INSERT OR REPLACE INTO {new_table} ({', '.join(names)}) VALUES ({', '.join(quote_sql(value) for value in values)});"
            )
            for name in selected:
                if name in FILE_COLUMNS and row[name]:
                    media_rows.append({"object_key": row[name], "source_path": str(Path(args.media_root) / row[name])})
    statements.append("PRAGMA foreign_keys = ON;")
    out.write_text("\n".join(statements) + "\n", encoding="utf-8")
    with manifest.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["object_key", "source_path"])
        writer.writeheader()
        writer.writerows(media_rows)
    print(f"wrote {out}")
    print(f"wrote {manifest}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="../web01/db.sqlite3")
    parser.add_argument("--media-root", default="../web01/media")
    parser.add_argument("--out", default="data/django_export.sql")
    parser.add_argument("--media-manifest", default="data/media_manifest.csv")
    export(parser.parse_args())


if __name__ == "__main__":
    main()
