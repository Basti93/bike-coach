#!/usr/bin/env python3
"""Sends planned runs to Garmin Connect as running workouts on their day, and removes old ones first.

--check says whether the installed library can build and send running workouts, without logging in.
Otherwise the ops come as JSON on stdin. Prints exactly one JSON line, tokens never appear in it.
"""
import argparse
import json
import sys

from garmin_upload import status_of

METHODS = ("upload_running_workout", "schedule_workout", "unschedule_workout", "delete_workout")
RUNNING = {"sportTypeId": 1, "sportTypeKey": "running"}
SAMPLE = {"date": "2026-01-01", "name": "Probe", "warmupS": 60, "mainS": 60, "cooldownS": 60, "hrLow": 100, "hrHigh": 120}


def reason_for(error):
    name = type(error).__name__
    status = status_of(error)
    if "TooManyRequests" in name or status in (427, 429):
        return "rate-limit"
    if "Authentication" in name or status in (401, 403):
        return "reauth"
    return "failed"


def build_workout(lib, run):
    """Warm-up, main step (heart-rate range or no target), cool-down, all by time."""
    warmup = lib.create_warmup_step(float(run["warmupS"]), 1)
    if run["hrLow"] is not None and run["hrHigh"] is not None:
        target = lib.CustomHeartRateTarget(lower_limit=run["hrLow"], upper_limit=run["hrHigh"])
        main = lib.create_targeted_interval_step(float(run["mainS"]), 2, target=target)
    else:
        main = lib.create_interval_step(float(run["mainS"]), 2)
    cooldown = lib.create_cooldown_step(float(run["cooldownS"]), 3)
    return lib.RunningWorkout(
        workoutName=run["name"],
        estimatedDurationInSecs=int(run["warmupS"] + run["mainS"] + run["cooldownS"]),
        workoutSegments=[lib.WorkoutSegment(segmentOrder=1, sportType=dict(RUNNING), workoutSteps=[warmup, main, cooldown])],
    )


def check(lib, client_cls):
    """ok only when the client has every call and the typed models really build (they need pydantic)."""
    if not all(callable(getattr(client_cls, name, None)) for name in METHODS):
        return {"status": "unsupported"}
    try:
        build_workout(lib, SAMPLE)
    except Exception:  # noqa: BLE001 - missing class or no pydantic: not supported
        return {"status": "unsupported"}
    return {"status": "ok"}


def valid(ops):
    def text(x):
        return isinstance(x, str) and 0 < len(x) <= 100

    def secs(x):
        return isinstance(x, int) and not isinstance(x, bool) and 0 <= x <= 6 * 3600

    def hr(x):
        return x is None or (isinstance(x, int) and not isinstance(x, bool) and 30 <= x <= 250)

    if not isinstance(ops, dict) or not isinstance(ops.get("delete"), list) or not isinstance(ops.get("create"), list):
        return False
    deletes_ok = all(isinstance(d, dict) and text(d.get("workoutId")) and (d.get("scheduleId") is None or text(d.get("scheduleId"))) for d in ops["delete"])
    creates_ok = all(
        isinstance(c, dict) and isinstance(c.get("date"), str) and len(c["date"]) == 10 and text(c.get("name"))
        and secs(c.get("warmupS")) and secs(c.get("mainS")) and secs(c.get("cooldownS")) and hr(c.get("hrLow")) and hr(c.get("hrHigh"))
        for c in ops["create"]
    )
    return deletes_ok and creates_ok


def gone(error):
    """Removed in the app already: nothing left to delete."""
    return status_of(error) == 404


def attempt(make_client, lib, tokens, ops):
    done = {"status": "ok", "reason": None, "deleted": [], "created": []}
    if not valid(ops):
        return dict(done, status="failed", reason="failed")
    try:
        client = make_client()
        client.login(tokens)
        # Deletes first, so a changed run never stands twice on the watch.
        for d in ops["delete"]:
            if d["scheduleId"] is not None:
                try:
                    client.unschedule_workout(d["scheduleId"])
                except Exception as error:  # noqa: BLE001
                    if not gone(error):
                        raise
            try:
                client.delete_workout(d["workoutId"])
            except Exception as error:  # noqa: BLE001
                if not gone(error):
                    raise
            done["deleted"].append(d["workoutId"])
        for c in ops["create"]:
            response = client.upload_running_workout(build_workout(lib, c))
            created = {"date": c["date"], "workoutId": str(response["workoutId"]), "scheduleId": None}
            # The uploaded workout is reported even when scheduling fails, so it can be removed later.
            done["created"].append(created)
            scheduled = client.schedule_workout(response["workoutId"], c["date"])
            schedule_id = scheduled.get("workoutScheduleId") if isinstance(scheduled, dict) else None
            created["scheduleId"] = None if schedule_id is None else str(schedule_id)
    except Exception as error:  # noqa: BLE001 - every error ends as a short result with what was done
        return dict(done, status="failed", reason=reason_for(error))
    return done


def send(make_client, lib, tokens, ops, out):
    out.write(json.dumps(attempt(make_client, lib, tokens, ops)) + "\n")
    out.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    out = sys.stdout
    sys.stdout = sys.stderr  # Output from the library must not interfere with the result line.

    if args.check:
        try:
            import garminconnect.workout as lib
            from garminconnect import Garmin

            result = check(lib, Garmin)
        except Exception:  # noqa: BLE001 - no library, no workouts
            result = {"status": "unsupported"}
        out.write(json.dumps(result) + "\n")
        out.flush()
        return

    try:
        ops = json.loads(sys.stdin.read())
    except ValueError:
        ops = None

    def make_client():
        from garminconnect import Garmin

        return Garmin()

    try:
        import garminconnect.workout as lib
    except Exception:  # noqa: BLE001 - reported as a failed send below
        lib = None
    send(make_client, lib, args.tokens, ops, out)


if __name__ == "__main__":
    main()
