#!/usr/bin/env python3
"""Simple client for reading the /api/mes-schedule endpoint."""

from __future__ import annotations

import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


DEFAULT_URL = "http://localhost:3000/api/mes-schedule"


def fetch_mes_schedule(url: str) -> list[dict]:
    """Fetch and parse JSON data from the API URL."""
    with urlopen(url) as response:
        body = response.read().decode("utf-8")
    data = json.loads(body)

    if not isinstance(data, list):
        raise ValueError(f"Expected a list from API, got: {type(data).__name__}")

    return data


def print_table(rows: list[dict]) -> None:
    """Pretty-print selected fields in a simple table."""
    columns = ["chassis", "Dealer", "SignedPlansReceived", "RegentProduction", "changeMode", "type"]

    widths = {col: len(col) for col in columns}
    for row in rows:
        for col in columns:
            widths[col] = max(widths[col], len(str(row.get(col, ""))))

    header = " | ".join(col.ljust(widths[col]) for col in columns)
    divider = "-+-".join("-" * widths[col] for col in columns)

    print(header)
    print(divider)
    for row in rows:
        print(" | ".join(str(row.get(col, "")).ljust(widths[col]) for col in columns))


def main() -> int:
    parser = argparse.ArgumentParser(description="Read /api/mes-schedule API data")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"API URL (default: {DEFAULT_URL})")
    parser.add_argument("--raw", action="store_true", help="Print raw JSON instead of table")
    args = parser.parse_args()

    try:
        rows = fetch_mes_schedule(args.url)
    except (HTTPError, URLError) as exc:
        print(f"Request failed: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON response: {exc}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if args.raw:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_table(rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
