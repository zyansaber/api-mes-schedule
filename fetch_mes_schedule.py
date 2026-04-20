#!/usr/bin/env python3
"""Simple client for reading the /api/mes-schedule endpoint."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen


DEFAULT_API_PATH = "/api/mes-schedule"
DEFAULT_BASE = "https://firebase-api-2mx9.onrender.com"
DEFAULT_URL = os.getenv("MES_SCHEDULE_API_URL", DEFAULT_BASE)


def normalize_api_url(url_or_base: str) -> str:
    """Allow users to pass either full endpoint URL or base server URL."""
    parsed = urlparse(url_or_base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid URL: {url_or_base}")

    path = parsed.path or ""
    if path in ("", "/"):
        return url_or_base.rstrip("/") + DEFAULT_API_PATH
    if path.endswith(DEFAULT_API_PATH):
        return url_or_base
    return url_or_base.rstrip("/") + DEFAULT_API_PATH


def fetch_mes_schedule(url: str, timeout: float = 10.0) -> list[dict]:
    """Fetch and parse JSON data from the API URL."""
    with urlopen(url, timeout=timeout) as response:
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


def _print_connection_help(url: str, exc: URLError) -> None:
    reason = getattr(exc, "reason", None)
    is_refused = isinstance(reason, ConnectionRefusedError)
    if isinstance(reason, OSError) and getattr(reason, "winerror", None) == 10061:
        is_refused = True

    if is_refused:
        print(f"Connection refused: {url}", file=sys.stderr)
        print("Tips:", file=sys.stderr)
        print("  1) Check whether your API URL is correct and reachable.", file=sys.stderr)
        print("  2) For local mode, start the service first (`npm install` then `npm start`).", file=sys.stderr)
        print("  3) You can set MES_SCHEDULE_API_URL to avoid typing --url every time.", file=sys.stderr)
    elif isinstance(reason, socket.timeout):
        print(f"Request timed out when connecting to: {url}", file=sys.stderr)
        print("Try a larger --timeout value or verify network connectivity.", file=sys.stderr)
    else:
        print(f"Request failed: {exc}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read /api/mes-schedule API data")
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help=(
            "API base URL or full endpoint URL "
            f"(default: {DEFAULT_URL}; endpoint path: {DEFAULT_API_PATH})"
        ),
    )
    parser.add_argument("--timeout", type=float, default=10.0, help="HTTP timeout in seconds (default: 10)")
    parser.add_argument("--raw", action="store_true", help="Print raw JSON instead of table")
    args = parser.parse_args()

    try:
        api_url = normalize_api_url(args.url)
        rows = fetch_mes_schedule(api_url, timeout=args.timeout)
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
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        print_table(rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
