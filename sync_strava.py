"""Nightly Strava -> aerobic.json sync for wheelclimbs.com.

Needs three repo secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
(refresh token must have activity:read_all scope).

- Adds new aerobic activities (runs, hikes, walks, stairs, etc.) with distance, time and vert.
- For activities with heart rate, buckets minutes into recovery / zone 2 / gray zone / above AnT.
- Scores any activity whose name contains "drift test" (or "AeT test") as a heart-rate drift test
  and updates the aerobic threshold from the latest one.
- Scores any activity named "threshold test" / "AnT test" (30-min all-out effort) and sets AnT
  to the average HR of the last 20 minutes.
- Reads the description of each strength / workout session and parses one exercise per line
  (see strength_log.py) into strength.json, which drives the Strength page.
Existing entries (including hand-made ones) are kept; nothing is deleted.
"""
import json, os, re, statistics, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timedelta
from strength_log import parse_description, parse_rpe

API = "https://www.strava.com/api/v3"
AEROBIC = {"Run", "TrailRun", "VirtualRun", "Walk", "Hike", "StairStepper", "Elliptical", "Snowshoe",
           "BackcountrySki", "NordicSki", "Rowing", "VirtualRow", "Swim"}
M_TO_MI, M_TO_FT = 1 / 1609.344, 3.28084
DRIFT_RE = re.compile(r"drift\s*test|aet\s*test", re.I)
ANT_RE = re.compile(r"threshold\s*test|ant\s*test|lthr", re.I)
# Treadmill/stair notes in the description: "1816 vertical", "vert 1,816", "3.7 mph", "10% incline"
_N = r"(\d{1,2},\d{3}|\d{2,5})"
VERT_RE = re.compile(_N + r"\s*(?:ft|feet|')?\s*(?:of\s+)?(?:vert(?:ical)?|gain|elev(?:ation)?)\b|\b(?:vert(?:ical)?|gain|elev(?:ation)?)\s*[:=]?\s*" + _N, re.I)
MPH_RE = re.compile(r"(\d+(?:\.\d+)?)\s*mph", re.I)
INCL_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*(?:incline|grade)?", re.I)


def parse_setting(text):
    """Vertical and treadmill setting written in an activity description."""
    out = {}
    m = VERT_RE.search(text or "")
    if m:
        ft = int((m.group(1) or m.group(2)).replace(",", ""))
        if 50 <= ft <= 20000:
            out["vert_ft"] = ft
    bits = [f"{x.group(1)} mph" for x in [MPH_RE.search(text or "")] if x] + [f"{x.group(1)}%" for x in [INCL_RE.search(text or "")] if x]
    if bits:
        out["setting"] = " · ".join(bits)
    return out


def http(url, data=None, token=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for attempt in range(3):
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(60)
                continue
            raise


def access_token():
    r = http("https://www.strava.com/oauth/token", {
        "client_id": os.environ["STRAVA_CLIENT_ID"], "client_secret": os.environ["STRAVA_CLIENT_SECRET"],
        "grant_type": "refresh_token", "refresh_token": os.environ["STRAVA_REFRESH_TOKEN"]})
    if r.get("refresh_token") and r["refresh_token"] != os.environ["STRAVA_REFRESH_TOKEN"]:
        print("::warning::Strava issued a new refresh token; update the STRAVA_REFRESH_TOKEN secret if syncs start failing.")
    return r["access_token"]


def zones_min(hr, t, aet, ant):
    z = [0.0, 0.0, 0.0, 0.0]
    for i in range(1, len(hr)):
        dt = min(t[i] - t[i - 1], 30)  # ignore pauses
        x = hr[i]
        z[0 if x < aet - 15 else 1 if x <= aet else 2 if x < ant else 3] += dt
    return [round(s / 60, 1) for s in z]


def drift(st, warmup_s=900):
    t, hr, v = st["time"], st["heartrate"], st.get("velocity_smooth")
    mv = st.get("moving") or [True] * len(t)
    idx = [i for i in range(len(t)) if t[i] >= warmup_s and mv[i] and hr[i] > 60]
    if len(idx) < 60:
        return None
    a, b = idx[: len(idx) // 2], idx[len(idx) // 2:]
    h1, h2 = statistics.mean(hr[i] for i in a), statistics.mean(hr[i] for i in b)
    out = {"steady_min": round((t[idx[-1]] - t[idx[0]]) / 60), "hr1": round(h1, 1), "hr2": round(h2, 1), "start_hr": round(h1)}
    if v and statistics.mean(v[i] for i in idx) > 0.5:  # moving test: pace:HR decoupling
        e1, e2 = statistics.mean(v[i] for i in a) / h1, statistics.mean(v[i] for i in b) / h2
        out["pa_hr_drift_pct"] = round((e1 - e2) / e1 * 100, 1)
    else:  # treadmill / stairs at fixed setting: HR drift
        out["pa_hr_drift_pct"] = round((h2 - h1) / h1 * 100, 1)
    return out


def main():
    with open("aerobic.json", encoding="utf-8") as f:
        data = json.load(f)
    T = data["thresholds"]
    known = {a["id"]: a for a in data["activities"]}
    tests = {d["id"]: d for d in data.get("drift_tests", [])}
    tok = access_token()

    after = int((datetime.now() - timedelta(days=730)).timestamp())
    page, raw = 1, []
    while True:
        batch = http(f"{API}/athlete/activities?after={after}&per_page=100&page={page}", token=tok)
        raw += batch
        if len(batch) < 100:
            break
        page += 1

    OTHER = {"RockClimbing": "climb", "WeightTraining": "strength", "Workout": "strength", "HighIntensityIntervalTraining": "strength", "Crossfit": "strength", "Yoga": "mobility"}
    sessions = {x["id"]: x for x in data.get("sessions", [])}
    new = 0
    for r in raw:
        if (r.get("sport_type") or r.get("type")) in OTHER and not DRIFT_RE.search(r.get("name", "")) and r.get("elapsed_time", 0) < 14400:
            sessions[str(r["id"])] = {"id": str(r["id"]), "date": r["start_date_local"][:10], "sport": r.get("sport_type") or r.get("type"),
                                      "name": r.get("name", ""), "minutes": round(r.get("moving_time", 0) / 60, 1)}
        sport, aid, name = r.get("sport_type") or r.get("type"), str(r["id"]), r.get("name", "")
        is_drift, is_ant = bool(DRIFT_RE.search(name)), bool(ANT_RE.search(name))
        if sport not in AEROBIC and not (is_drift or is_ant):
            continue
        a = known.get(aid, {})
        a.update({"id": aid, "date": r["start_date_local"][:10], "name": name,
                  "sport": a.get("sport") if a.get("sport") == "Alpine" else sport,
                  "mi": round(r.get("distance", 0) * M_TO_MI, 3), "moving_min": round(r.get("moving_time", 0) / 60, 1),
                  "elapsed_min": round(r.get("elapsed_time", 0) / 60, 1), "vert_ft": round(r.get("total_elevation_gain", 0) * M_TO_FT)})
        if r.get("trainer"):
            a["indoor"] = True
        if a.get("vert_desc") and a["vert_ft"] < 50:  # treadmill/stairs: Strava has no elevation, so use the vertical from the description
            a["vert_ft"] = a["vert_desc"]
        if r.get("average_heartrate"):
            a["avg_hr"] = round(r["average_heartrate"])
        need_streams = r.get("has_heartrate") and ("zones_min" not in a or ((is_drift or is_ant) and aid not in tests))
        if need_streams:
            s = http(f"{API}/activities/{aid}/streams?keys=time,heartrate,velocity_smooth,moving&key_by_type=true", token=tok)
            st = {k: v["data"] for k, v in s.items()}
            hr = st.get("heartrate") or []
            if hr and statistics.median(hr) >= 75:
                a["zones_min"] = zones_min(hr, st["time"], T["aet"], T["ant"])
            elif hr:
                a["hr_note"] = "HR looked like a sensor dropout; excluded from zone totals"
            if is_drift and hr:
                if r.get("trainer"):  # treadmill: the watch only guesses speed, so score heart-rate drift at the fixed setting
                    st.pop("velocity_smooth", None)
                d = drift(st)
                if d and d["steady_min"] < 40:
                    print(f"::notice::Drift test {aid} only had {d['steady_min']} steady min (need 40+); not scored")
                elif d:
                    p_ = d["pa_hr_drift_pct"]
                    verdict = (f"Over 5%: {p_}% drift at ~{d['start_hr']} bpm, so AeT is below that. Retest ~5 bpm lower." if p_ > 5
                               else f"Found it: {p_}% drift at ~{d['start_hr']} bpm puts your AeT right there." if p_ >= 3.5
                               else f"Under 3.5%: {p_}% drift at ~{d['start_hr']} bpm, so AeT is higher than that. Retest ~5 bpm higher.")
                    tests[aid] = {"id": aid, "date": a["date"], "name": name, "sport": sport, "protocol": "test", **d, "verdict": verdict,
                                  **({"indoor": True} if r.get("trainer") else {})}
            if is_ant and hr:
                t = st["time"]
                test30 = [h for h, tt in zip(hr, t) if tt >= t[-1] - 1800]  # the 30-min effort (recording stops at its end)
                lthr = round(statistics.mean(test30))
                T.update(ant=lthr, ant_range=[lthr - 2, lthr + 2], ant_measured=True,
                         ant_basis=f"Measured: average HR over the 30-min effort of the {a['date']} threshold test.")
            time.sleep(1)
        if aid not in known:
            new += 1
        known[aid] = a

    # Thresholds from the latest proper drift test
    proper = sorted((d for d in tests.values() if d.get("protocol") == "test"), key=lambda d: d["date"])
    if proper:
        d = proper[-1]
        if 3.5 <= d["pa_hr_drift_pct"] <= 5:
            T.update(aet=d["start_hr"], aet_range=[d["start_hr"] - 2, d["start_hr"] + 2], aet_measured=True,
                     aet_basis=f"Measured: {d['date']} drift test drifted {d['pa_hr_drift_pct']}% at {d['start_hr']} bpm, right at AeT.")
        elif d["pa_hr_drift_pct"] < 3.5:
            T.update(aet=d["start_hr"], aet_range=[d["start_hr"], d["start_hr"] + 6], aet_measured=True,
                     aet_basis=f"{d['date']} drift test held {d['pa_hr_drift_pct']}% at {d['start_hr']} bpm, so AeT is at least that; retest ~5 bpm higher.")
        else:
            est = d["start_hr"] - 5
            T.update(aet=est, aet_range=[est - 3, d["start_hr"] - 1], aet_measured=False,
                     aet_basis=f"{d['date']} drift test drifted {d['pa_hr_drift_pct']}% at {d['start_hr']} bpm, so AeT is below that; ~{est} until the next test.")

    effort_pass(list(known.values()) + list(sessions.values()), tok)
    for d in tests.values():  # show the treadmill setting on the drift-test card
        if known.get(d["id"], {}).get("setting"):
            d["setting"] = known[d["id"]]["setting"]
        if known.get(d["id"], {}).get("vert_desc"):
            d["vert_ft"] = known[d["id"]]["vert_desc"]
    data["activities"] = sorted(known.values(), key=lambda a: a["date"], reverse=True)
    data["sessions"] = sorted(sessions.values(), key=lambda a: a["date"], reverse=True)
    data["drift_tests"] = sorted(tests.values(), key=lambda d: d["date"], reverse=True)
    data["updated"] = date.today().isoformat()
    data["source"] = "Strava API (nightly sync)"
    with open("aerobic.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    sync_strength(raw, OTHER, tok)
    print(f"Strava: {len(raw)} activities scanned · {new} new aerobic · AeT {T['aet']} · AnT {T['ant']}")


def effort_pass(items, tok, days=21, cap=40):
    """Session effort (RPE 1-10) for recent activities: an 'rpe 7' line in the description,
    else Strava's own perceived-exertion slider. Also picks up vertical / treadmill settings written there. Re-read for 3 days in case it's added after the workout."""
    since = (date.today() - timedelta(days=days)).isoformat()
    fresh = (date.today() - timedelta(days=3)).isoformat()
    calls = 0
    for a in sorted(items, key=lambda x: x["date"], reverse=True):
        if a["date"] < since or calls >= cap or ("rpe_checked" in a and a["date"] < fresh):
            continue
        try:
            det = http(f"{API}/activities/{a['id']}", token=tok)
        except Exception as e:  # noqa: BLE001
            print(f"::notice::Couldn't read activity {a['id']} for effort ({e})")
            continue
        calls += 1
        desc = det.get("description") or ""
        rpe = parse_rpe(desc)
        if "mi" in a:  # aerobic activity: vertical / treadmill setting from the description
            got = parse_setting(desc)
            if "vert_ft" in got:
                a["vert_desc"] = got["vert_ft"]
                if a.get("vert_ft", 0) < 50:
                    a["vert_ft"] = got["vert_ft"]
            if "setting" in got:
                a["setting"] = got["setting"]
        pe = det.get("perceived_exertion")
        if rpe is None and isinstance(pe, (int, float)) and 1 <= pe <= 10:
            rpe = float(pe)
        if rpe is not None:
            a["rpe"] = rpe
        a["rpe_checked"] = date.today().isoformat()
        time.sleep(0.5)
    print(f"Effort: {calls} activities checked for RPE")


def sync_strength(raw, other, tok, path="strength.json"):
    """Parse exercise lines from strength-session descriptions into strength.json."""
    try:
        with open(path, encoding="utf-8") as f:
            S = json.load(f)
    except FileNotFoundError:
        S = {"bodyweight_kg": 81.2, "sessions": []}
    try:  # needs profile:read_all; falls back to the stored weight
        w = http(f"{API}/athlete", token=tok).get("weight")
        if w:
            S["bodyweight_kg"], S["bodyweight_source"] = round(w, 1), "Strava profile"
    except Exception as e:  # noqa: BLE001
        print(f"::notice::Couldn't read bodyweight from Strava ({e}); keeping {S.get('bodyweight_kg')} kg")
    bw = S.get("bodyweight_kg")
    cache = {x["id"]: x for x in S.get("sessions", [])}
    recent = (date.today() - timedelta(days=7)).isoformat()
    oldest = (date.today() - timedelta(days=365)).isoformat()
    calls = 0
    for r in raw:
        sport = r.get("sport_type") or r.get("type")
        if other.get(sport) not in ("strength", "mobility") or r.get("elapsed_time", 0) >= 14400:
            continue
        aid, d = str(r["id"]), r["start_date_local"][:10]
        x = cache.get(aid, {"id": aid})
        x.update(date=d, name=r.get("name", ""), sport=sport, minutes=round(r.get("moving_time", 0) / 60, 1))
        # Fetch the description once, and again for a week in case it's edited after the workout.
        if (("entries" not in x and d >= oldest) or d >= recent) and calls < 80:
            det = http(f"{API}/activities/{aid}", token=tok)
            calls += 1
            x["entries"], x["skipped"] = parse_description(det.get("description") or "", bw)
            time.sleep(0.5)
        cache[aid] = x
    S["sessions"] = sorted(cache.values(), key=lambda a: a["date"], reverse=True)
    S["updated"] = date.today().isoformat()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(S, f, indent=1, ensure_ascii=False)
    n = sum(len(x.get("entries", [])) for x in S["sessions"])
    print(f"Strength: {len(S['sessions'])} sessions · {n} exercise lines parsed · {calls} descriptions fetched")


if __name__ == "__main__":
    main()
