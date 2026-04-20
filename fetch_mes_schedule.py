#!/usr/bin/env python3
"""CLI client for reading the API shown in server.js (/api/health and /api/data)."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen

DEFAULT_BASE = os.getenv("MES_SCHEDULE_API_URL", "https://firebase-api-2mx9.onrender.com")
DEFAULT_ENDPOINT = "data"


def normalize_url(url_or_base: str, endpoint: str) -> str:
    """Accept a base URL or a full endpoint URL and normalize to target endpoint."""
    parsed = urlparse(url_or_base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid URL: {url_or_base}")

    endpoint_path = f"/api/{endpoint}"
    path = parsed.path or ""

    if path in ("", "/"):
        return url_or_base.rstrip("/") + endpoint_path
    if path.endswith(endpoint_path):
        return url_or_base
    if path.startswith("/api/"):
        return url_or_base.rstrip("/")
    return url_or_base.rstrip("/") + endpoint_path


def fetch_json(url: str, timeout: float = 15.0) -> Any:
    with urlopen(url, timeout=timeout) as response:
        body = response.read().decode("utf-8")
    return json.loads(body)


def print_table(rows: list[dict[str, Any]], title: str, limit: int) -> None:
    if not rows:
        print(f"\n{title}: (empty)")
        return

    visible_rows = rows[:limit] if limit > 0 else rows
    columns = sorted({key for row in visible_rows for key in row.keys()})

    widths = {col: len(col) for col in columns}
    for row in visible_rows:
        for col in columns:
            widths[col] = max(widths[col], len(str(row.get(col, ""))))

    print(f"\n{title} (showing {len(visible_rows)}/{len(rows)} rows):")
    print(" | ".join(col.ljust(widths[col]) for col in columns))
    print("-+-".join("-" * widths[col] for col in columns))
    for row in visible_rows:
        print(" | ".join(str(row.get(col, "")).ljust(widths[col]) for col in columns))


def print_data_payload(payload: dict[str, Any], show: str, limit: int) -> None:
    success = payload.get("success")
    schedule = payload.get("schedule", [])
    mes = payload.get("mes", [])

    if not isinstance(schedule, list) or not isinstance(mes, list):
        raise ValueError("Invalid /api/data response: schedule/mes should be lists")

    print(f"success: {success}")
    print(f"schedule_count: {payload.get('schedule_count', len(schedule))}")
    print(f"mes_count: {payload.get('mes_count', len(mes))}")

    if show in ("both", "schedule"):
        print_table(schedule, "schedule", limit)
    if show in ("both", "mes"):
        print_table(mes, "mes", limit)


def _print_connection_help(url: str, exc: URLError) -> None:
    reason = getattr(exc, "reason", None)
    is_refused = isinstance(reason, ConnectionRefusedError)
    if isinstance(reason, OSError) and getattr(reason, "winerror", None) == 10061:
        is_refused = True

    if is_refused:
        print(f"Connection refused: {url}", file=sys.stderr)
        print("Tips:", file=sys.stderr)
        print("  1) If local: start API with `npm install` then `node server.js`.", file=sys.stderr)
        print("  2) If remote: verify URL is reachable and includes correct endpoint.", file=sys.stderr)
    elif isinstance(reason, socket.timeout):
        print(f"Request timed out: {url}", file=sys.stderr)
        print("Try --timeout 30", file=sys.stderr)
    else:
        print(f"Request failed: {exc}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read /api/health and /api/data")
    parser.add_argument("--url", default=DEFAULT_BASE, help=f"Base URL or full endpoint URL (default: {DEFAULT_BASE})")
    parser.add_argument("--endpoint", choices=["health", "data"], default=DEFAULT_ENDPOINT, help="Choose endpoint to call")
    parser.add_argument("--show", choices=["both", "schedule", "mes"], default="both", help="When endpoint=data, which table(s) to print")
    parser.add_argument("--limit", type=int, default=5, help="Rows to print per table (0 means all)")
    parser.add_argument("--timeout", type=float, default=15.0, help="HTTP timeout in seconds")
    parser.add_argument("--raw", action="store_true", help="Print raw JSON only")
    args = parser.parse_args()

    try:
        api_url = normalize_url(args.url, args.endpoint)
        payload = fetch_json(api_url, timeout=args.timeout)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except HTTPError as exc:
        print(f"HTTP error: {exc.code} {exc.reason}", file=sys.stderr)
        return 1
    except URLError as exc:
        _print_connection_help(args.url, exc)
        return 1
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON response: {exc}", file=sys.stderr)
        return 1

    if args.raw:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if args.endpoint == "health":
        if isinstance(payload, dict):
            print(f"health: {payload}")
            return 0
        print("Invalid /api/health response", file=sys.stderr)
        return 1

    if not isinstance(payload, dict):
        print("Invalid /api/data response: expected object", file=sys.stderr)
        return 1

    try:
        print_data_payload(payload, show=args.show, limit=args.limit)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
