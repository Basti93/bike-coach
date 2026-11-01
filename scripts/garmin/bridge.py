"""Garmin-Anmeldung für die App. Spricht JSON-Zeilen über stdin und stdout.

Eingabe: {"tokens": Pfad, "check": Pfad, "email": ..., "password": ...}, später {"mfa": "123456"}.
Ausgabe: {"status": "needs-mfa" | "connected" | "failed", "reason": ...}.
Das Passwort kommt nur über stdin und wird nie gespeichert. Die Prüfdatei enthält nur Feldnamen.
"""
import datetime
import json
import os
import sys
from pathlib import Path

out = sys.stdout
sys.stdout = sys.stderr  # Ausgaben der Bibliothek dürfen das Protokoll nicht stören.


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
    """Kurze Meldung für die Oberfläche, nie der rohe Fehlertext, der Anmeldedaten enthalten könnte."""
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
        except Exception as e:  # noqa: BLE001 - eine fehlende Datenart ist kein Abbruch
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
    except Exception as e:  # noqa: BLE001 - jeder Fehler endet als kurze Meldung
        emit(status="failed", reason=reason_for(e))
        return
    if not (tokens / "garmin_tokens.json").exists():
        emit(status="failed", reason="failed")
        return
    emit(status="connected")
    try:
        write_check(client, tokens, Path(request["check"]))
    except Exception:  # noqa: BLE001 - die Anmeldung gilt trotzdem
        pass


if __name__ == "__main__":
    main()
