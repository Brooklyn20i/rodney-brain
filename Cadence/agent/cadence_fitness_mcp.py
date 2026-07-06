#!/usr/bin/env python3
"""MCP wrapper for live Cadence Fitness Supabase access.

Exposes the owner-aware `cadence_fitness_bridge.py` operations as Hermes-native
MCP tools, mirroring Cadence/agent/cadence_supabase_mcp.py. It does not store
credentials; the bridge reads public config from MCP env and the agent
password from macOS Keychain.

Register in Hermes with e.g.:
  hermes mcp add cadence-fitness -- python3 /path/to/cadence_fitness_mcp.py
"""

from __future__ import annotations

import datetime as dt

from mcp.server.fastmcp import FastMCP

import cadence_fitness_bridge as bridge

mcp = FastMCP("cadence-fitness")


def _today() -> str:
    return dt.date.today().isoformat()


def _first(res):
    return res[0] if isinstance(res, list) and res else res


# ── Health / discovery ──────────────────────────────────────────────────────

@mcp.tool()
def probe() -> dict:
    """Read-only check: confirms grant visibility and counts without dumping row contents."""
    try:
        counts: dict[str, int | str] = {}
        grants = bridge.select(
            "fitness_agent_access",
            "select=owner_user_id,can_read,can_write,revoked_at&revoked_at=is.null",
            limit=10,
        )
        writable = [g for g in grants if isinstance(g, dict) and g.get("can_write")] if isinstance(grants, list) else []
        for table in ["workouts", "programs", "exercises", "body_metrics", "recovery_metrics", "nutrition_logs"]:
            rows = bridge.select(table, "select=id", limit=1000)
            counts[table] = len(rows) if isinstance(rows, list) else "?"
        return {
            "ok": True,
            "active_grants": len(grants) if isinstance(grants, list) else "?",
            "writable_grants": len(writable),
            "visible_counts": counts,
        }
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


# ── Reading: training ───────────────────────────────────────────────────────

@mcp.tool()
def get_active_program() -> dict:
    """The active program with its days and exercise slots (targets included)."""
    try:
        progs = bridge.select("programs", "select=*&status=eq.active&deleted_at=is.null", limit=1)
        if not progs:
            return {"active_program": None}
        prog = progs[0]
        days = bridge.select(
            "program_days",
            f"select=*&program_id=eq.{prog['id']}&deleted_at=is.null&order=day_order.asc",
        )
        slots = []
        for d in days:
            rows = bridge.select(
                "program_exercises",
                f"select=*&program_day_id=eq.{d['id']}&deleted_at=is.null&order=ex_order.asc",
            )
            slots.append({"day": d, "exercises": rows})
        return {"active_program": prog, "days": slots}
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def list_recent_workouts(limit: int = 10) -> list[dict]:
    """Most recent workouts (newest first), without their sets."""
    try:
        return bridge.select(
            "workouts", "select=*&deleted_at=is.null&order=date.desc,created_at.desc", limit=limit
        )
    except bridge.FitnessBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def get_workout(workout_id: str) -> dict:
    """One workout with all its logged sets and exercise names."""
    try:
        w = _first(bridge.select("workouts", f"select=*&id=eq.{workout_id}", limit=1))
        sets = bridge.select(
            "workout_sets",
            f"select=*&workout_id=eq.{workout_id}&deleted_at=is.null&order=exercise_id.asc,set_number.asc",
        )
        exercises = bridge.select("exercises", "select=id,name,muscle_group&deleted_at=is.null", limit=1000)
        names = {e["id"]: e["name"] for e in exercises} if isinstance(exercises, list) else {}
        for s in sets:
            s["exercise_name"] = names.get(s.get("exercise_id"), "?")
        return {"workout": w, "sets": sets}
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def get_exercise_history(exercise_name: str, limit: int = 60) -> dict:
    """Working-set history for one exercise (matched by name, case-insensitive)."""
    try:
        matches = bridge.select(
            "exercises", f"select=*&name=ilike.*{exercise_name}*&deleted_at=is.null", limit=5
        )
        if not matches:
            return {"error": f"No exercise matching {exercise_name!r}"}
        ex = matches[0]
        sets = bridge.select(
            "workout_sets",
            f"select=*&exercise_id=eq.{ex['id']}&done=eq.true&is_warmup=eq.false"
            "&deleted_at=is.null&order=created_at.desc",
            limit=limit,
        )
        return {"exercise": ex, "sets": sets}
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


# ── Reading: body / recovery / nutrition ────────────────────────────────────

@mcp.tool()
def get_daily_brief(date: str | None = None) -> dict:
    """Everything about one day (default today): recovery, weight, nutrition totals, training."""
    try:
        day = date or _today()
        recovery = _first(bridge.select("recovery_metrics", f"select=*&date=eq.{day}&deleted_at=is.null", limit=1))
        body = _first(bridge.select("body_metrics", f"select=*&date=eq.{day}&deleted_at=is.null", limit=1))
        meals = bridge.select("nutrition_logs", f"select=*&date=eq.{day}&deleted_at=is.null", limit=100)
        targets = bridge.select(
            "nutrition_targets",
            f"select=*&effective_from=lte.{day}&deleted_at=is.null&order=effective_from.desc",
            limit=1,
        )
        workouts = bridge.select("workouts", f"select=*&date=eq.{day}&deleted_at=is.null", limit=10)
        cardio = bridge.select("cardio_sessions", f"select=*&date=eq.{day}&deleted_at=is.null", limit=10)
        sauna = bridge.select("sauna_sessions", f"select=*&date=eq.{day}&deleted_at=is.null", limit=10)
        totals = {
            "calories": sum(int(m.get("calories") or 0) for m in meals),
            "protein_g": sum(float(m.get("protein_g") or 0) for m in meals),
            "carbs_g": sum(float(m.get("carbs_g") or 0) for m in meals),
            "fat_g": sum(float(m.get("fat_g") or 0) for m in meals),
        }
        return {
            "date": day,
            "recovery": recovery,
            "body": body,
            "nutrition_totals": totals,
            "nutrition_target": _first(targets),
            "meals": meals,
            "workouts": workouts,
            "cardio": cardio,
            "sauna": sauna,
        }
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def get_week_summary(start_date: str | None = None) -> dict:
    """Training/cardio/sauna volume and body trend for the 7 days starting start_date (default: last 7 days)."""
    try:
        if start_date:
            start = start_date
        else:
            start = (dt.date.today() - dt.timedelta(days=6)).isoformat()
        end = (dt.date.fromisoformat(start) + dt.timedelta(days=6)).isoformat()
        rng = f"date=gte.{start}&date=lte.{end}&deleted_at=is.null"
        workouts = bridge.select("workouts", f"select=*&status=eq.completed&{rng}", limit=50)
        cardio = bridge.select("cardio_sessions", f"select=*&{rng}", limit=50)
        sauna = bridge.select("sauna_sessions", f"select=*&{rng}", limit=50)
        body = bridge.select("body_metrics", f"select=date,weight_kg,body_fat_pct&{rng}&order=date.asc", limit=10)
        recovery = bridge.select(
            "recovery_metrics", f"select=date,recovery_pct,strain,sleep_hours&{rng}&order=date.asc", limit=10
        )
        return {
            "start": start,
            "end": end,
            "workouts": workouts,
            "cardio_sessions": cardio,
            "sauna_sessions": sauna,
            "body_metrics": body,
            "recovery_metrics": recovery,
        }
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


# ── Recovery drivers (what moves Rodney's recovery) ─────────────────────────
# Mirrors Cadence/web/src/fitness/lib/insights.ts so Kobe can coach against the
# same numbers the app shows: contrasts + a Welch t-test, association not proof.

_DRV_MIN_N = 20
_DRV_MIN_DELTA = 2.0


def _welch(a: list[float], b: list[float]) -> dict:
    import statistics as st

    m1 = sum(a) / len(a) if a else 0.0
    m2 = sum(b) / len(b) if b else 0.0
    v1 = st.variance(a) if len(a) > 1 else 0.0
    v2 = st.variance(b) if len(b) > 1 else 0.0
    se = (v1 / max(1, len(a)) + v2 / max(1, len(b))) ** 0.5
    t = (m1 - m2) / se if se > 0 else 0.0
    return {"n_with": len(a), "n_without": len(b), "mean_with": m1, "mean_without": m2, "delta": m1 - m2, "t": t}


def _confidence(t: float, n1: int, n2: int) -> str | None:
    if n1 < _DRV_MIN_N or n2 < _DRV_MIN_N:
        return None
    a = abs(t)
    if a >= 2.8:
        return "high"
    if a >= 2.1:
        return "medium"
    return None


def _shift(iso: str, n: int) -> str:
    return (dt.date.fromisoformat(iso) + dt.timedelta(days=n)).isoformat()


def _finish(cid, label, detail, a, b):
    c = _welch(a, b)
    conf = _confidence(c["t"], c["n_with"], c["n_without"])
    if not conf or abs(c["delta"]) < _DRV_MIN_DELTA:
        return None
    sign = "+" if c["delta"] >= 0 else "-"
    return {
        "id": cid,
        "label": label,
        "detail": detail,
        "mean_with": round(c["mean_with"], 1),
        "mean_without": round(c["mean_without"], 1),
        "delta": round(c["delta"], 1),
        "n_with": c["n_with"],
        "n_without": c["n_without"],
        "confidence": conf,
        "helps": c["delta"] > 0,
        "sentence": f"{label}: recovery averages {round(c['mean_with'])}% vs {round(c['mean_without'])}% "
        f"{detail} ({sign}{abs(round(c['delta']))} pts, {conf} confidence, n={c['n_with']}/{c['n_without']}).",
    }


@mcp.tool()
def get_recovery_drivers() -> dict:
    """What moves Rodney's recovery, learned across all his data (Whoop plus
    workouts, cardio, sauna, nutrition). Each driver contrasts recovery under a
    condition vs without it, gated by a Welch t-test and a minimum sample so
    weak/noisy links are held back. Association, not proof. Use these numbers to
    coach (e.g. protect sleep, ease off after hard days)."""
    try:
        recs = bridge.select(
            "recovery_metrics",
            "select=date,recovery_pct,strain,sleep_hours&deleted_at=is.null&order=date.asc",
            limit=5000,
        )
        recovery = {r["date"]: float(r["recovery_pct"]) for r in recs if r.get("recovery_pct") is not None}
        strain = {r["date"]: float(r["strain"]) for r in recs if r.get("strain") is not None}
        sleep = {r["date"]: float(r["sleep_hours"]) for r in recs if r.get("sleep_hours") is not None}

        def days(table, extra=""):
            rows = bridge.select(table, f"select=date&deleted_at=is.null{extra}", limit=5000)
            return {r["date"] for r in rows}

        sauna_d = days("sauna_sessions")
        cardio_d = days("cardio_sessions")
        lift_d = days("workouts", "&status=eq.completed")
        prot_rows = bridge.select("nutrition_logs", "select=date,protein_g&deleted_at=is.null", limit=10000)
        protein: dict[str, float] = {}
        for r in prot_rows:
            protein[r["date"]] = protein.get(r["date"], 0.0) + float(r.get("protein_g") or 0)

        drivers = []

        # Sleep (same night → that morning's recovery)
        a = [rec for d, rec in recovery.items() if sleep.get(d, 0) >= 7]
        b = [rec for d, rec in recovery.items() if d in sleep and sleep[d] < 6.5]
        drv = _finish("sleep", "After 7h+ sleep", "after nights under 6.5h", a, b)
        if drv:
            drivers.append(drv)

        # Prior-day strain terciles → next-day recovery
        sv = sorted(strain.values())
        if len(sv) >= 6:
            lo, hi = sv[len(sv) // 3], sv[2 * len(sv) // 3]
            if hi > lo:
                a = [rec for d, rec in recovery.items() if strain.get(_shift(d, -1), -1) >= hi]
                b = [rec for d, rec in recovery.items() if 0 <= strain.get(_shift(d, -1), -1) <= lo]
                drv = _finish("strain", "After a hard day", "after an easy day", a, b)
                if drv:
                    drivers.append(drv)

        # Prior-day behaviours → next-day recovery
        for cid, dayset, label, detail in [
            ("sauna", sauna_d, "After a sauna", "otherwise"),
            ("cardio", cardio_d, "After cardio", "on other days"),
            ("lift", lift_d, "After lifting", "on non-lifting days"),
        ]:
            a = [rec for d, rec in recovery.items() if _shift(d, -1) in dayset]
            b = [rec for d, rec in recovery.items() if _shift(d, -1) not in dayset and _shift(d, -1) in recovery]
            drv = _finish(cid, label, detail, a, b)
            if drv:
                drivers.append(drv)

        rank = {"high": 2, "medium": 1}
        drivers.sort(key=lambda d: (rank.get(d["confidence"], 0), abs(d["delta"])), reverse=True)
        return {
            "considered_days": len(recovery),
            "drivers": drivers,
            "note": "Associations across Rodney's own data, not proof of cause.",
        }
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


# ── Writing: logging for Rodney ─────────────────────────────────────────────

@mcp.tool()
def log_body_metric(weight_kg: float, body_fat_pct: float | None = None, date: str | None = None) -> dict:
    """Record (or update) a day's Renpho weigh-in. One row per day."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "date": date or _today(),
            "weight_kg": weight_kg,
            "body_fat_pct": body_fat_pct,
            "source": "agent",
        }
        return _first(bridge.upsert("body_metrics", row, on_conflict="owner_id,date"))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def log_recovery_metric(
    recovery_pct: int | None = None,
    strain: float | None = None,
    sleep_hours: float | None = None,
    sleep_performance_pct: int | None = None,
    hrv_ms: int | None = None,
    resting_hr: int | None = None,
    active_energy_kcal: int | None = None,
    steps: int | None = None,
    date: str | None = None,
) -> dict:
    """Record (or update) a day's Whoop / Apple Health numbers (recovery, sleep,
    HRV, resting HR, calories burned, steps). One row per day; omitted fields
    stay null/previous."""
    try:
        row: dict = {
            "owner_id": bridge.discover_owner_id(),
            "date": date or _today(),
            "source": "agent",
        }
        for k, v in {
            "recovery_pct": recovery_pct,
            "strain": strain,
            "sleep_hours": sleep_hours,
            "sleep_performance_pct": sleep_performance_pct,
            "hrv_ms": hrv_ms,
            "resting_hr": resting_hr,
            "active_energy_kcal": active_energy_kcal,
            "steps": steps,
        }.items():
            if v is not None:
                row[k] = v
        return _first(bridge.upsert("recovery_metrics", row, on_conflict="owner_id,date"))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


# Historical backfill: Rodney sends Kobe a Whoop monthly export (ZIP of CSVs)
# or a weight/scale history; Kobe parses whatever the format is and calls
# these with clean rows. Upserts key on (owner_id, date), so re-importing the
# same export -- or overlapping months -- is always safe.

_RECOVERY_KEYS = {
    "recovery_pct", "strain", "sleep_hours", "sleep_performance_pct",
    "hrv_ms", "resting_hr", "active_energy_kcal", "steps", "notes",
}
_BODY_KEYS = {
    "measurement_at", "weight_kg", "body_fat_pct", "muscle_mass_kg",
    "body_score", "body_fat_mass_kg", "fat_free_mass_kg", "skeletal_muscle_mass_kg",
    "bmi", "bmr_kcal", "visceral_fat", "subcutaneous_fat_pct", "bone_mass_kg",
    "protein_mass_kg", "body_water_mass_kg", "smi_kg_m2", "whr", "metabolic_age",
    "height_cm", "report_age", "report_sex", "optimal_weight_kg",
    "target_weight_delta_kg", "target_fat_mass_delta_kg", "target_muscle_mass_delta_kg",
    "notes",
}
_BULK_CHUNK = 200


def _bulk_upsert(table: str, rows: list[dict], allowed: set[str], default_source: str) -> dict:
    owner = bridge.discover_owner_id()
    clean: list[dict] = []
    skipped: list[str] = []
    for i, r in enumerate(rows):
        date = str(r.get("date", ""))[:10]
        if len(date) != 10:
            skipped.append(f"row {i}: missing/invalid date")
            continue
        row = {"owner_id": owner, "date": date, "source": r.get("source", default_source)}
        for k in allowed:
            if r.get(k) is not None:
                row[k] = r[k]
        if len(row) <= 3:
            skipped.append(f"row {i} ({date}): no metric fields")
            continue
        clean.append(row)
    # PostgREST bulk rows must share identical keys; group by key signature
    # so mixed-completeness days don't fail the request (or null each other).
    groups: dict[str, list[dict]] = {}
    for row in clean:
        groups.setdefault(",".join(sorted(row)), []).append(row)
    written = 0
    for rows_group in groups.values():
        for start in range(0, len(rows_group), _BULK_CHUNK):
            chunk = rows_group[start : start + _BULK_CHUNK]
            bridge.upsert(table, chunk, on_conflict="owner_id,date")  # type: ignore[arg-type]
            written += len(chunk)
    return {"written": written, "skipped": skipped[:20], "skipped_count": len(skipped)}


@mcp.tool()
def bulk_upsert_recovery_metrics(rows: list[dict]) -> dict:
    """Backfill many days of Whoop/recovery history at once (e.g. from Rodney's
    monthly Whoop export ZIP). Each row: {"date": "YYYY-MM-DD"} plus any of
    recovery_pct, strain, sleep_hours, sleep_performance_pct, hrv_ms,
    resting_hr, active_energy_kcal, steps, notes, source (default 'whoop').
    One row per day, upserted on (owner_id, date) -- re-imports are safe."""
    try:
        return _bulk_upsert("recovery_metrics", rows, _RECOVERY_KEYS, "whoop")
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def bulk_upsert_body_metrics(rows: list[dict]) -> dict:
    """Backfill many days of scale history at once (Renpho export, spreadsheet,
    etc.). Each row: {"date": "YYYY-MM-DD"} plus any of weight_kg,
    body_fat_pct, muscle_mass_kg, notes, source (default 'renpho').
    One row per day, upserted on (owner_id, date) -- re-imports are safe."""
    try:
        return _bulk_upsert("body_metrics", rows, _BODY_KEYS, "renpho")
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def log_nutrition(
    name: str,
    calories: int,
    protein_g: float = 0,
    carbs_g: float = 0,
    fat_g: float = 0,
    meal: str = "snack",
    date: str | None = None,
) -> dict:
    """Log a food entry. meal is one of breakfast/lunch/dinner/snack/shake."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "date": date or _today(),
            "meal": meal,
            "name": name,
            "calories": calories,
            "protein_g": protein_g,
            "carbs_g": carbs_g,
            "fat_g": fat_g,
        }
        return _first(bridge.insert("nutrition_logs", row))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def log_cardio(
    kind: str,
    duration_min: float,
    distance_km: float = 0,
    avg_hr: int = 0,
    calories: int = 0,
    date: str | None = None,
    notes: str = "",
) -> dict:
    """Log a cardio session. kind: run/bike/row/swim/walk/hike/stairs/elliptical/hiit/other."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "date": date or _today(),
            "kind": kind,
            "duration_min": duration_min,
            "distance_km": distance_km,
            "avg_hr": avg_hr,
            "calories": calories,
            "notes": notes,
        }
        return _first(bridge.insert("cardio_sessions", row))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def log_sauna(duration_min: float, temperature_c: int = 90, rounds: int = 1, date: str | None = None) -> dict:
    """Log a sauna session."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "date": date or _today(),
            "duration_min": duration_min,
            "temperature_c": temperature_c,
            "rounds": rounds,
            "notes": "",
        }
        return _first(bridge.insert("sauna_sessions", row))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def log_completed_workout(name: str, sets: list[dict], date: str | None = None, notes: str = "") -> dict:
    """Log a full completed workout in one call (e.g. dictated after the session).

    Each item in `sets`: {"exercise": "Barbell Bench Press", "weight_kg": 100,
    "reps": 8, "set_number": 1 (optional), "is_warmup": false (optional)}.
    Exercise names are matched case-insensitively against the library; unknown
    names are created under muscle_group 'other'.
    """
    try:
        owner = bridge.discover_owner_id()
        day = date or _today()
        workout = _first(bridge.insert("workouts", {
            "owner_id": owner,
            "date": day,
            "name": name,
            "status": "completed",
            "started_at": None,
            "completed_at": dt.datetime.now(dt.UTC).isoformat(),
            "notes": notes,
        }))
        library = bridge.select("exercises", "select=id,name&deleted_at=is.null", limit=1000)
        by_name = {e["name"].lower(): e["id"] for e in library} if isinstance(library, list) else {}
        counters: dict[str, int] = {}
        created = []
        for s in sets:
            ex_name = str(s.get("exercise", "")).strip()
            key = ex_name.lower()
            if key not in by_name:
                ex = _first(bridge.insert("exercises", {
                    "owner_id": owner,
                    "name": ex_name,
                    "muscle_group": "other",
                }))
                by_name[key] = ex["id"]
            counters[key] = counters.get(key, 0) + 1
            created.append(_first(bridge.insert("workout_sets", {
                "owner_id": owner,
                "workout_id": workout["id"],
                "exercise_id": by_name[key],
                "set_number": int(s.get("set_number") or counters[key]),
                "weight_kg": float(s.get("weight_kg") or 0),
                "reps": int(s.get("reps") or 0),
                "is_warmup": bool(s.get("is_warmup") or False),
                "done": True,
            })))
        return {"workout": workout, "sets_logged": len(created)}
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


# ── Chat channel (agent_messages) ───────────────────────────────────────────

@mcp.tool()
def list_agent_messages(status: str = "unread", limit: int = 20) -> list[dict]:
    """List messages in the Kobe channel. status: unread, processed, or all."""
    try:
        q = "select=*&deleted_at=is.null&order=created_at.desc"
        if status != "all":
            q = f"select=*&status=eq.{status}&deleted_at=is.null&order=created_at.desc"
        return bridge.select("agent_messages", q, limit=limit)
    except bridge.FitnessBridgeError as e:
        return [{"error": str(e)}]


@mcp.tool()
def send_agent_message(body: str, linked_date: str | None = None) -> dict:
    """Post a message from Kobe into the app's Kobe screen."""
    try:
        row = {
            "owner_id": bridge.discover_owner_id(),
            "sender_type": "agent",
            "sender_label": "Kobe",
            "body": body,
            "status": "unread",
            "linked_date": linked_date,
        }
        return _first(bridge.insert("agent_messages", row))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


@mcp.tool()
def mark_agent_message_processed(message_id: str) -> dict:
    """Mark a message from Rodney as processed after acting on it."""
    try:
        return _first(bridge.patch_row("agent_messages", message_id, {"status": "processed"}))
    except bridge.FitnessBridgeError as e:
        return {"error": str(e)}


if __name__ == "__main__":
    mcp.run()
