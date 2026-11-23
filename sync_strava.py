"""Nightly Strava -> aerobic.json sync for wheelclimbs.com.

Needs three repo secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN
(refresh token must have activity:read_all scope).

- Adds new aerobic activities (runs, hikes, walks, stairs, etc.) with distance, time and vert.
- For activities with heart rate, buckets minutes into recovery / zone 2 / gray zone / above AnT.
- Scores any activity whose name contains "drift test" (or "AeT test") as a heart-rate drift test
  and updates the aerobic threshold from the latest one.
- Scores any activity named "threshold test" / "AnT test" (30-min all-out effort) and sets AnT
  to the average HR of the last 20 minutes.
Existing entries (including hand-made ones) are kept; nothing is deleted.
"""
import json, os, re, statistics, sys, time, urllib.parse, urllib.request
from datetime import date, datetime, timedelta

API = "https://www.strava.com/api/v3"
AEROBIC = {"Run", "TrailRun", "VirtualRun", "Walk", "Hike", "StairStepper", "Elliptical", "Snowshoe",
           "BackcountrySki", "NordicSki", "Rowing", "VirtualRow", "Swim"}
M_TO_MI, M_TO_FT = 1 / 1609.344, 3.28084
DRIFT_RE = re.compile(r"drift\s*test|aet\s*test", re.I)
ANT_RE = re.compile(r"threshold\s*test|ant\s*test|lthr", re.I)


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
                d = drift(st)
                if d:
                    ok = d["pa_hr_drift_pct"] < 5
                    tests[aid] = {"id": aid, "date": a["date"], "name": name, "sport": sport, "protocol": "test", **d,
                                  "verdict": (f"Passed: {d['pa_hr_drift_pct']}% drift at ~{d['start_hr']} bpm, so AeT is at least {d['start_hr']}. Next time try 3–5 bpm higher."
                                              if ok else f"Over 5%: {d['pa_hr_drift_pct']}% drift at ~{d['start_hr']} bpm, so AeT is below that. Retest ~5 bpm lower.")}
            if is_ant and hr:
                t = st["time"]
                last20 = [h for h, tt in zip(hr, t) if tt >= t[-1] - 1200]
                lthr = round(statistics.mean(last20))
                T.update(ant=lthr, ant_range=[lthr - 2, lthr + 2], ant_measured=True,
                         ant_basis=f"Measured: average HR over the last 20 min of the {a['date']} threshold test.")
            time.sleep(1)
        if aid not in known:
            new += 1
        known[aid] = a

    # Thresholds from the latest proper drift test
    proper = sorted((d for d in tests.values() if d.get("protocol") == "test"), key=lambda d: d["date"])
    if proper:
        d = proper[-1]
        if d["pa_hr_drift_pct"] < 5:
            T.update(aet=d["start_hr"], aet_range=[d["start_hr"], d["start_hr"] + 5], aet_measured=True,
                     aet_basis=f"Measured: {d['date']} drift test held {d['pa_hr_drift_pct']}% drift at {d['start_hr']} bpm.")
        else:
            est = d["start_hr"] - 5
            T.update(aet=est, aet_range=[est - 3, d["start_hr"] - 1], aet_measured=False,
                     aet_basis=f"{d['date']} drift test drifted {d['pa_hr_drift_pct']}% at {d['start_hr']} bpm, so AeT is below that; ~{est} until the next test.")

    data["activities"] = sorted(known.values(), key=lambda a: a["date"], reverse=True)
    data["sessions"] = sorted(sessions.values(), key=lambda a: a["date"], reverse=True)
    data["drift_tests"] = sorted(tests.values(), key=lambda d: d["date"], reverse=True)
    data["updated"] = date.today().isoformat()
    data["source"] = "Strava API (nightly sync)"
    with open("aerobic.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print(f"Strava: {len(raw)} activities scanned · {new} new aerobic · AeT {T['aet']} · AnT {T['ant']}")


if __name__ == "__main__":
    main()
