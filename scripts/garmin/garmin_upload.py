#!/usr/bin/env python3
"""Uploads one FIT file to Garmin Connect. Prints exactly one JSON line, tokens never appear in it."""
import argparse
import json
import os
import re
import sys


def status_of(error):
    for source in (getattr(error, "response", None), error):
        status = getattr(source, "status_code", None)
        if isinstance(status, int):
            return status
    found = re.search(r"\b(401|403|409|427|429)\b", str(error))
    return int(found.group(1)) if found else None


def result_for(error):
    name = type(error).__name__
    status = status_of(error)
    if status == 409:
        return {"status": "duplicate"}
    if "TooManyRequests" in name or status in (427, 429):
        return {"status": "failed", "reason": "rate-limit"}
    if "Authentication" in name or status in (401, 403):
        return {"status": "failed", "reason": "reauth"}
    return {"status": "failed", "reason": "failed"}


def attempt(make_client, tokens, path):
    if not os.path.isfile(path):
        return {"status": "failed", "reason": "missing-file"}
    try:
        client = make_client()
        client.login(tokens)
        client.upload_activity(path)
    except Exception as error:  # noqa: BLE001 - every error ends as a short result
        return result_for(error)
    return {"status": "uploaded"}


def upload(make_client, tokens, path, out):
    out.write(json.dumps(attempt(make_client, tokens, path)) + "\n")
    out.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--file", required=True)
    args = parser.parse_args()
    out = sys.stdout
    sys.stdout = sys.stderr  # Output from the library must not interfere with the result line.

    def make_client():
        from garminconnect import Garmin

        return Garmin()

    upload(make_client, args.tokens, args.file, out)


if __name__ == "__main__":
    main()
