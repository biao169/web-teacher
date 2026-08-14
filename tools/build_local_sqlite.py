from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "web02.sqlite3"


def main():
    DB_PATH.unlink(missing_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript((ROOT / "migrations" / "0001_initial.sql").read_text(encoding="utf-8"))
    conn.executescript((ROOT / "data" / "django_export.sql").read_text(encoding="utf-8"))
    conn.commit()
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    publications = conn.execute("SELECT COUNT(*) FROM publications").fetchone()[0]
    news = conn.execute("SELECT COUNT(*) FROM news").fetchone()[0]
    conn.close()
    print(f"created {DB_PATH}")
    print(f"tables {len(tables)}")
    print(f"publications {publications}")
    print(f"news {news}")


if __name__ == "__main__":
    main()
