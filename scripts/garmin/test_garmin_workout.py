import io
import json
import unittest
from types import SimpleNamespace

import garmin_workout


class HttpError(Exception):
    def __init__(self, status, text="kaputt"):
        super().__init__(f"{status} {text}")
        self.status_code = status


class Model:
    """Stands in for the library's typed models: keeps what it was given."""

    def __init__(self, kind, **fields):
        self.kind, self.fields = kind, fields


def fake_lib():
    """The parts of garminconnect.workout the script uses, built offline."""
    def step(kind):
        return lambda duration, order=1, **kw: Model(kind, duration=duration, order=order, **kw)

    return SimpleNamespace(
        RunningWorkout=lambda **kw: Model("workout", **kw),
        WorkoutSegment=lambda **kw: Model("segment", **kw),
        CustomHeartRateTarget=lambda **kw: Model("hr", **kw),
        create_warmup_step=step("warmup"),
        create_interval_step=step("main"),
        create_targeted_interval_step=step("main"),
        create_cooldown_step=step("cooldown"),
    )


class Client:
    def __init__(self, fail_on=None, error=None):
        self.calls, self.fail_on, self.error = [], fail_on, error
        self.uploaded = []
        self.next_id = 100

    def _call(self, name, *args):
        self.calls.append((name,) + args)
        if self.fail_on and self.fail_on(name, len([c for c in self.calls if c[0] == name])):
            raise self.error

    def login(self, tokens):
        self._call("login")

    def unschedule_workout(self, schedule_id):
        self._call("unschedule_workout", schedule_id)

    def delete_workout(self, workout_id):
        self._call("delete_workout", workout_id)

    def upload_running_workout(self, workout):
        self._call("upload_running_workout")
        self.uploaded.append(workout)
        self.next_id += 1
        return {"workoutId": self.next_id, "workoutName": workout.fields["workoutName"]}

    def schedule_workout(self, workout_id, date):
        self._call("schedule_workout", workout_id, date)
        return {"workoutScheduleId": workout_id + 1000, "calendarDate": date}


CREATE = {"date": "2026-11-04", "name": "Lauf ruhig", "warmupS": 300, "mainS": 1200, "cooldownS": 300, "hrLow": 114, "hrHigh": 143}
TOKENS = "geheim-token-ordner"


def run(client, ops, lib=None):
    out = io.StringIO()
    garmin_workout.send(lambda: client, lib or fake_lib(), TOKENS, ops, out)
    lines = out.getvalue().strip().split("\n")
    assert len(lines) == 1
    return json.loads(lines[0]), lines[0]


class Supported:
    def upload_running_workout(self, w): pass
    def schedule_workout(self, i, d): pass
    def unschedule_workout(self, i): pass
    def delete_workout(self, i): pass


class CheckTest(unittest.TestCase):
    def test_check_ok_with_workout_support(self):
        self.assertEqual(garmin_workout.check(fake_lib(), Supported), {"status": "ok"})

    def test_check_unsupported_without_upload_running_workout(self):
        class Old:
            def schedule_workout(self, i, d): pass
            def unschedule_workout(self, i): pass
            def delete_workout(self, i): pass
        self.assertEqual(garmin_workout.check(fake_lib(), Old), {"status": "unsupported"})

    def test_check_unsupported_without_running_workout(self):
        lib = fake_lib()
        del lib.RunningWorkout
        self.assertEqual(garmin_workout.check(lib, Supported), {"status": "unsupported"})

    def test_check_unsupported_when_the_models_do_not_build(self):
        # garminconnect 0.3.20 without pydantic: the classes exist, but take no arguments.
        class NoArgs:
            pass
        lib = fake_lib()
        lib.CustomHeartRateTarget = NoArgs
        lib.RunningWorkout = NoArgs
        self.assertEqual(garmin_workout.check(lib, Supported), {"status": "unsupported"})


class SendTest(unittest.TestCase):
    def test_deletes_before_creates(self):
        client = Client()
        result, _ = run(client, {"delete": [{"workoutId": "7", "scheduleId": "70"}], "create": [CREATE]})
        self.assertEqual([c[0] for c in client.calls], ["login", "unschedule_workout", "delete_workout", "upload_running_workout", "schedule_workout"])
        self.assertEqual(client.calls[1], ("unschedule_workout", "70"))
        self.assertEqual(client.calls[2], ("delete_workout", "7"))
        self.assertEqual(result, {"status": "ok", "reason": None, "deleted": ["7"], "created": [{"date": "2026-11-04", "workoutId": "101", "scheduleId": "1101"}]})

    def test_delete_without_schedule_id_only_deletes(self):
        client = Client()
        result, _ = run(client, {"delete": [{"workoutId": "7", "scheduleId": None}], "create": []})
        self.assertEqual([c[0] for c in client.calls], ["login", "delete_workout"])
        self.assertEqual(result["deleted"], ["7"])

    def test_a_workout_already_gone_counts_as_deleted(self):
        client = Client(fail_on=lambda name, n: name in ("unschedule_workout", "delete_workout"), error=HttpError(404))
        result, _ = run(client, {"delete": [{"workoutId": "7", "scheduleId": "70"}], "create": [CREATE]})
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["deleted"], ["7"])
        self.assertEqual(len(result["created"]), 1)

    def test_main_step_has_hr_range_and_schedules_on_date(self):
        client = Client()
        run(client, {"delete": [], "create": [CREATE]})
        workout = client.uploaded[0]
        self.assertEqual(workout.fields["workoutName"], "Lauf ruhig")
        self.assertEqual(workout.fields["estimatedDurationInSecs"], 1800)
        steps = workout.fields["workoutSegments"][0].fields["workoutSteps"]
        self.assertEqual([s.kind for s in steps], ["warmup", "main", "cooldown"])
        self.assertEqual([s.fields["duration"] for s in steps], [300.0, 1200.0, 300.0])
        self.assertEqual([s.fields["order"] for s in steps], [1, 2, 3])
        target = steps[1].fields["target"]
        self.assertEqual((target.kind, target.fields), ("hr", {"lower_limit": 114, "upper_limit": 143}))
        self.assertEqual(client.calls[-1], ("schedule_workout", 101, "2026-11-04"))

    def test_main_without_hr_has_no_target(self):
        client = Client()
        run(client, {"delete": [], "create": [dict(CREATE, hrLow=None, hrHigh=None, name="Testlauf 30 Minuten")]})
        steps = client.uploaded[0].fields["workoutSegments"][0].fields["workoutSteps"]
        self.assertNotIn("target", steps[1].fields)

    def test_401_ends_as_reauth_and_reports_done_so_far(self):
        second = dict(CREATE, date="2026-11-06")
        client = Client(fail_on=lambda name, n: name == "upload_running_workout" and n == 2, error=HttpError(401))
        result, _ = run(client, {"delete": [{"workoutId": "7", "scheduleId": None}], "create": [CREATE, second]})
        self.assertEqual(result, {"status": "failed", "reason": "reauth", "deleted": ["7"], "created": [{"date": "2026-11-04", "workoutId": "101", "scheduleId": "1101"}]})
        # It stops at the first error: nothing after it is tried.
        self.assertEqual(client.calls[-1][0], "upload_running_workout")

    def test_a_failed_schedule_still_reports_the_uploaded_workout(self):
        client = Client(fail_on=lambda name, n: name == "schedule_workout", error=HttpError(429))
        result, _ = run(client, {"delete": [], "create": [CREATE]})
        self.assertEqual(result, {"status": "failed", "reason": "rate-limit", "deleted": [], "created": [{"date": "2026-11-04", "workoutId": "101", "scheduleId": None}]})

    def test_login_failure_is_reauth_with_nothing_done(self):
        client = Client(fail_on=lambda name, n: name == "login", error=HttpError(403))
        result, _ = run(client, {"delete": [{"workoutId": "7", "scheduleId": None}], "create": [CREATE]})
        self.assertEqual(result, {"status": "failed", "reason": "reauth", "deleted": [], "created": []})

    def test_bad_ops_fail_without_calling_garmin(self):
        client = Client()
        result, _ = run(client, {"delete": "kaputt"})
        self.assertEqual(result["status"], "failed")
        self.assertEqual(client.calls, [])

    def test_output_never_contains_tokens(self):
        client = Client(fail_on=lambda name, n: name == "delete_workout", error=Exception(f"401 {TOKENS}"))
        _, line = run(client, {"delete": [{"workoutId": "7", "scheduleId": None}], "create": [CREATE]})
        self.assertNotIn(TOKENS, line)
        _, line = run(Client(), {"delete": [], "create": [CREATE]})
        self.assertNotIn(TOKENS, line)


if __name__ == "__main__":
    unittest.main()
