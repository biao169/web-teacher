from __future__ import annotations

import argparse

from .app import serve


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the independent transfer tool.")
    parser.add_argument("--db", default="data/site.sqlite3")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    serve(args.db, args.host, args.port)


if __name__ == "__main__":
    main()

