#!/usr/bin/env python3
"""Uploads one FIT file to Garmin Connect and names it. Prints exactly one JSON line, tokens never appear in it."""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time

PROCESSING_WAIT_S = 5

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


def imported_id(response):
    if hasattr(response, "json"):
        response = response.json()
    try:
        return response["detailedImportResult"]["successes"][0]["internalId"]
    except (KeyError, IndexError, TypeError):
        return None


def find_by_start(client, start_ms):
    """Garmin sometimes answers before it has processed the file, the start time identifies the ride then."""
    wanted = dt.datetime.fromtimestamp(start_ms / 1000, dt.timezone.utc).replace(tzinfo=None)
    for activity in client.get_activities(0, 5):
        try:
            started = dt.datetime.strptime(activity["startTimeGMT"], "%Y-%m-%d %H:%M:%S")
        except (KeyError, TypeError, ValueError):
            continue
        if abs((started - wanted).total_seconds()) <= 60:
            return activity.get("activityId")
    return None


def name_activity(client, response, title, start_ms, wait):
    """The upload already counts, a missing name must not turn it into a failure."""
    try:
        activity_id = imported_id(response)
        if activity_id is None:
            wait(PROCESSING_WAIT_S)
            activity_id = find_by_start(client, start_ms)
        if activity_id is None:
            return False
        client.set_activity_name(activity_id, title)
        return True
    except Exception:  # noqa: BLE001 - see above
        return False


def attempt(make_client, tokens, path, title, start_ms, wait):
    if not os.path.isfile(path):
        return {"status": "failed", "reason": "missing-file"}
    try:
        client = make_client()
        client.login(tokens)
        response = client.upload_activity(path)
    except Exception as error:  # noqa: BLE001 - every error ends as a short result
        return result_for(error)
    if name_activity(client, response, title, start_ms, wait):
        return {"status": "uploaded"}
    return {"status": "uploaded", "named": False}


def upload(make_client, tokens, path, out, title, start_ms, wait=time.sleep):
    out.write(json.dumps(attempt(make_client, tokens, path, title, start_ms, wait)) + "\n")
    out.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--file", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--start-ms", required=True, type=int)
    args = parser.parse_args()
    out = sys.stdout
    sys.stdout = sys.stderr  # Output from the library must not interfere with the result line.

    def make_client():
        from garminconnect import Garmin

        return Garmin()

    upload(make_client, args.tokens, args.file, out, args.name, args.start_ms)


if __name__ == "__main__":
    main()
