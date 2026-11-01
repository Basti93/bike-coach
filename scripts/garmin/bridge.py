"""Garmin login for the app. Speaks JSON lines over stdin and stdout.

Input: {"tokens": path, "check": path, "email": ..., "password": ...}, later {"mfa": "123456"}.
Output: {"status": "needs-mfa" | "connected" | "failed", "reason": ...}.
The password arrives only over stdin and is never stored. The check file contains only field names.
"""
import datetime
import json
import os
import sys
from pathlib import Path

out = sys.stdout
sys.stdout = sys.stderr  # Output from the library must not interfere with the protocol.


def emit(**message) -> None:
    out.write(json.dumps(message) + "\n")
    out.flush()


def ask_mfa() -> str:
    emit(status="needs-mfa")
    line = sys.stdin.readline()
    if not line:
        raise RuntimeError("Abgebrochen")
    return str(json.loads(line).get("mfa", "")).strip()


def reason_for(error: Exception) -> str:
    """Short message for the UI, never the raw error text, which could contain login credentials."""
    name = type(error).__name__
    text = str(error)
    if "TooManyRequests" in name or "429" in text:
        return "rate-limit"
    if "Authentication" in name or "401" in text or "403" in text:
        return "credentials"
    return "failed"


def shape(value):
    if isinstance(value, dict):
        return sorted(value.keys())
    if isinstance(value, list):
        return {"eintraege": len(value), "felder": shape(value[0]) if value else []}
    return "vorhanden" if value not in (None, "") else "leer"


def write_check(client, tokens: Path, target: Path) -> None:
    today = datetime.date.today()
    day = (today - datetime.timedelta(days=1)).isoformat()
    start = (today - datetime.timedelta(days=28)).isoformat()
    probes = {
        "profil": client.get_user_profile,
        "profil_einstellungen": client.get_userprofile_settings,
        "aktivitaeten_28_tage": lambda: client.get_activities_by_date(start, day),
        "schlaf": lambda: client.get_sleep_data(day),
        "ruhepuls": lambda: client.get_rhr_day(day),
        "hrv": lambda: client.get_hrv_data(day),
        "vo2max": lambda: client.get_max_metrics(day),
        "ftp": client.get_cycling_ftp,
    }
    result = {"token_gespeichert": (tokens / "garmin_tokens.json").exists()}
    for key, probe in probes.items():
        try:
            result[key] = shape(probe())
        except Exception as e:  # noqa: BLE001 - a missing data type is no reason to abort
            result[key] = f"Fehler: {type(e).__name__}"
    target.write_text(json.dumps(result, indent=1, ensure_ascii=False))
    os.chmod(target, 0o600)


def main() -> None:
    request = json.loads(sys.stdin.readline())
    tokens = Path(request["tokens"])
    tokens.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(tokens.parent, 0o700)
    try:
        from garminconnect import Garmin

        client = Garmin(request["email"], request.pop("password"), prompt_mfa=ask_mfa)
        client.login(str(tokens))
    except Exception as e:  # noqa: BLE001 - every error ends as a short message
        emit(status="failed", reason=reason_for(e))
        return
    if not (tokens / "garmin_tokens.json").exists():
        emit(status="failed", reason="failed")
        return
    emit(status="connected")
    try:
        write_check(client, tokens, Path(request["check"]))
    except Exception:  # noqa: BLE001 - the login still counts
        pass


if __name__ == "__main__":
    main()
