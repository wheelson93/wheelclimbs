"""Parse strength / hangboard / mobility lines from a Strava activity description.

One exercise per line:  name, load, sets x reps
  swing, 24kg, 5x10
  ring dips, bw, 3x8
  hang, 20mm, +10lb, 6x10s
  pull-ups, +25lb, 3x5
  L-sit, 3x20s
  cossack squat, 16kg, 3x8/side
  ham curl single, 3x8/side
  pancake 25cm           (mobility checks: distance, pass/fail or a level)
  high step pass
  toe touch palms
Commas are optional. Lines that don't look like an exercise are ignored.
"""
import re

KG_PER_LB = 0.45359237

# key, display name, category, kind, alias regex
# kind: "bw"  = bodyweight move (unsigned load means added weight)
#       "ext" = external load (kettlebell etc.)
#       "test"= mobility check
CATALOG = [
    # Lattice-style tests (logged in a test week). Must come before the general exercises they resemble.
    ("hang_test", "Max hang test", "test", "bw", r"max\s*hang\s*test|\bhang\s*test\b|\bmht\b"),
    ("pull_test", "2RM pull-up test", "test", "bw", r"\b2\s*rm\b|pull[\s-]?ups?\s*test"),
    ("repeater_test", "Repeater test", "test", "bw", r"\brepeaters?\s*test\b|\brepeaters?\b"),
    ("box_test", "Box step test", "test", "bw", r"\bbox\s*step\s*test\b"),
    ("side_split", "Side split", "mobility", "test", r"\bside\s*split"),
    ("hang", "Hangboard", "pull", "bw", r"\bhang(board|s|ing)?\b|max\s*hang|\bedge\b"),
    ("pullup", "Pull-up", "pull", "bw", r"\b(pull|chin)[\s-]?ups?\b"),
    ("ring_row", "Ring row", "pull", "bw", r"\b(ring|trx|inverted)\s*rows?\b"),
    ("face_pull", "Face pull", "other", "ext", r"\bface\s*pulls?\b"),
    ("ring_dip", "Ring dip", "push", "bw", r"\bdips?\b"),
    ("ohp", "Overhead press", "push", "ext", r"\b(overhead|military|kb|kettlebell|strict|shoulder|arnold|push)\s*press\b|\bohp\b"),
    ("pushup", "Push-up", "push", "bw", r"\b(push|press)[\s-]?ups?\b"),
    ("lsit", "L-sit", "core", "bw", r"\bl[\s-]?sit\b"),
    ("abwheel", "Ab wheel", "core", "bw", r"\bab\s*wheel|\brollouts?\b"),
    ("t2b", "Toes-to-bar", "core", "bw", r"\btoes[\s-]*to[\s-]*bar\b|\bt2b\b|\bttb\b"),
    ("side_plank", "Side plank", "core", "bw", r"\bside\s*planks?\b"),
    ("hollow", "Hollow body hold", "core", "bw", r"\bhollow\b"),
    ("copenhagen", "Copenhagen plank", "core", "bw", r"\bcopenhagen\b"),
    ("negative", "Pull-up negative", "pull", "bw", r"\bnegatives?\b"),
    ("low_row", "Low row", "pull", "ext", r"\b(low|db|dumbbell|bent[\s-]*over)\s*rows?\b"),
    ("lock_off", "Lock-off", "pull", "bw", r"\block[\s-]*offs?\b"),
    ("engage", "Scap engagement", "pull", "bw", r"\bengagement\b|\bactivations?\b"),
    ("bench", "Bench / chest press", "push", "ext", r"\b(bench|chest|incline)\s*press\b"),
    ("shoulder", "Shoulder accessory", "push", "ext", r"\bshrugs?\b|\b(shoulder|prone)\s*rotations?\b|\bfly(es)?\b|\biyt\b"),
    ("leg_raise", "Hanging leg raise", "core", "bw", r"\bleg\s*raises?\b|\blever\s*raises?\b|\bwindow\s*wipers?\b"),
    ("crunch", "Crunch / V-sit", "core", "bw", r"\bcrunch(es)?\b|\bv[\s-]?(sits?|ups?)\b|\bboat\b|\b(kb|kettlebell)\s*twists?\b"),
    ("plank", "Plank", "core", "bw", r"\bplanks?\b"),
    ("back_ext", "Back extension", "core", "bw", r"\bback\s*ext(ension)?s?\b|\bsuperman\b|\breverse\s*hyper"),
    ("pistol", "Pistol squat", "legs", "bw", r"\bpistols?\b"),
    ("srdl", "Single-leg RDL", "legs", "ext", r"\b(single|one|1)[\s-]*leg(ged)?\s*(rdl|romanian|deadlift)|\bsl\s*rdl\b"),
    ("ham_curl", "Hamstring curl", "legs", "bw", r"\b(ham(string)?|leg|slider|ring|trx|nordic)\s*curls?\b"),
    ("deadlift", "Deadlift / rack pull", "legs", "ext", r"\bdead\s*lifts?\b|\brack\s*pulls?\b"),
    ("squat", "Barbell squat", "legs", "ext", r"\b(back|front|overhead)\s*squats?\b"),
    ("jump", "Jumps", "legs", "bw", r"\bjumps?\b|\bcmj\b"),
    ("forearm", "Forearm", "other", "ext", r"\broller\b|\b(flexor|extensor|wrist)\s*curls?\b"),
    ("cossack", "Cossack squat", "legs", "ext", r"\bcossacks?\b"),
    ("swing", "KB swing", "legs", "ext", r"\bswings?\b"),
    ("getup", "Get-up", "core", "ext", r"\b(turkish\s*)?get[\s-]?ups?\b|\btgu\b"),
    ("goblet", "Goblet squat", "legs", "ext", r"\bgoblet"),
    ("high_step", "High step", "mobility", "test", r"\bhigh\s*step\b"),
    ("pancake", "Pancake", "mobility", "test", r"\bpancake\b|\bstraddle\b"),
    ("frog", "Frog", "mobility", "test", r"\bfrog\b"),
    ("overhead_reach", "Overhead reach", "mobility", "test", r"\boverhead\s*reach\b|\bshoulder\s*flexion\b"),
    ("toe_touch", "Toe touch", "mobility", "test", r"\btoe\s*touch\b|\bforward\s*fold\b"),
]
_CAT = [(k, n, c, kind, re.compile(rx, re.I)) for k, n, c, kind, rx in CATALOG]

NUM = r"(\d+(?:\.\d+)?)"
RE_LOAD = re.compile(r"([+-])?\s*" + NUM + r"\s*(kg|kgs|kilos?|lb|lbs|pounds?|#)(?![a-z])", re.I)
RE_PCT = re.compile(r"([+-])?\s*" + NUM + r"\s*%\s*(bw|body\s*weight)?", re.I)
RE_BW = re.compile(r"\b(bw|body\s*weight)\b", re.I)
RE_EDGE = re.compile(NUM + r"\s*mm\b", re.I)
RE_SETS = re.compile(r"(\d+)\s*[x×*]\s*" + NUM + r"\s*(s|sec|secs|seconds|min|mins)?(?![a-z])", re.I)
RE_LIST = re.compile(r"(?<![\d.])(\d+(?:\s*/\s*\d+){1,9})(?!\s*(?:side|leg|arm))\s*(s|sec|secs)?\b", re.I)
RE_REPS = re.compile(r"(\d+)\s*reps?\b", re.I)
RE_HOLD = re.compile(r"(?<![\d.x×])" + NUM + r"\s*(s|sec|secs|seconds)\b|(\d+):(\d\d)\b", re.I)
RE_DIST = re.compile(NUM + r"\s*(cm|in|inch|inches)\b", re.I)
RE_SIDE = re.compile(r"/\s*(side|leg|arm)|\b(per|each)\s*(side|leg|arm)\b|\bea\b|\beach\b", re.I)
RE_PASS = re.compile(r"\b(pass(ed)?|yes|y|full|flat|clean|done|achieved)\b|✓|✔", re.I)
RE_FAIL = re.compile(r"\b(fail(ed)?|no|not\s*yet|almost)\b|✗|✘", re.I)
HOLDS = {"box_test", "hang", "lsit", "side_plank", "back_ext", "hollow", "copenhagen", "plank", "lock_off", "engage"}
LEVELS = [("palms", 3), ("knuckles", 2), ("fingertips", 1), ("fingers", 1), ("toes", 1), ("shins", 0), ("ankles", 0)]


def _kg(v, unit):
    return round(v * KG_PER_LB, 2) if unit.lower().startswith(("lb", "pound", "#")) else round(v, 2)


def match_exercise(text):
    for k, n, c, kind, rx in _CAT:
        if rx.search(text):
            return k, n, c, kind
    return None


def parse_line(raw, bodyweight_kg=None):
    line = re.sub(r"^[\s\-•*·>]+", "", raw).strip()
    if not line or len(line) > 140 or line.lower().startswith("http"):
        return None
    m = match_exercise(line)
    has_dose = bool(RE_SETS.search(line) or RE_REPS.search(line) or RE_HOLD.search(line) or RE_LIST.search(line))
    if not m:
        if not has_dose:
            return None
        name = re.split(r",|\d", line, maxsplit=1)[0].strip(" :-")
        if not name:
            return None
        key = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        m = (key, name[:1].upper() + name[1:], "other", "ext")
    key, name, cat, kind = m
    e = {"raw": line, "key": key, "name": name, "cat": cat}
    rest = line

    if RE_SIDE.search(rest):
        e["per_side"] = True
        rest = RE_SIDE.sub(" ", rest)
    low = rest.lower()
    if key == "abwheel":
        e["variant"] = "standing" if "standing" in low else "kneeling"
    if key == "ham_curl":
        e["variant"] = "single" if re.search(r"\b(single|one|1)[\s-]*leg|\bsingle\b|\bsl\b", low) else "double"
    if key in ("hang", "hang_test"):  # grip: front-three open drag, otherwise half crimp
        e["grip"] = "f3" if re.search(r"\bf3\b|\bfront[\s-]*(3|three)\b|\bdrag\b|\b(3|three)[\s-]*finger", low) else "half"
        rest = re.sub(r"\bf3\b|\bfront[\s-]*(3|three)\b|\b(3|three)[\s-]*finger", " ", rest, flags=re.I)
    if key == "pullup" and re.search(r"\bchin", low):
        e["variant"] = "chin"

    me = RE_EDGE.search(rest)
    if me:
        e["edge_mm"] = float(me.group(1))
        rest = rest[:me.start()] + " " + rest[me.end():]

    ml = RE_LOAD.search(rest)
    if ml:
        sign, v, unit = ml.group(1), float(ml.group(2)), ml.group(3)
        kg = _kg(v, unit)
        e["unit"] = "lb" if unit.lower().startswith(("lb", "pound", "#")) else "kg"
        if kind == "bw" or sign:
            e["added_kg"] = -kg if sign == "-" else kg
        else:
            e["load_kg"] = kg
        rest = rest[:ml.start()] + " " + rest[ml.end():]
    else:
        mp = RE_PCT.search(rest)
        if mp and bodyweight_kg:
            kg = round(float(mp.group(2)) / 100 * bodyweight_kg, 2)
            e["added_kg"] = -kg if mp.group(1) == "-" else kg
            rest = rest[:mp.start()] + " " + rest[mp.end():]
    if "added_kg" not in e and "load_kg" not in e and (RE_BW.search(rest) or kind == "bw"):
        e["added_kg"] = 0.0

    ms = RE_SETS.search(rest)
    if ms:
        sets, val, u = int(ms.group(1)), float(ms.group(2)), (ms.group(3) or "").lower()
        e["sets"] = sets
        if u.startswith("min"):
            e["secs"] = val * 60
        elif u or key in HOLDS or cat == "mobility":
            e["secs"] = val  # timed holds: "6x10" on a hangboard means 10-second hangs
        else:
            e["reps"] = int(val)
        rest = rest[:ms.start()] + " " + rest[ms.end():]
    else:
        mlst = RE_LIST.search(rest)
        if mlst:
            vals = [int(x) for x in re.split(r"\s*/\s*", mlst.group(1))]
            e["sets"] = len(vals)
            if mlst.group(2):
                e["secs"] = max(vals)
            else:
                e["reps"] = max(vals)
            e["total"] = sum(vals)
            rest = rest[:mlst.start()] + " " + rest[mlst.end():]
        else:
            mr = RE_REPS.search(rest)
            if mr:
                e["sets"], e["reps"] = 1, int(mr.group(1))
                rest = rest[:mr.start()] + " " + rest[mr.end():]
    if "secs" not in e and "reps" not in e:
        mh = RE_HOLD.search(rest)
        if mh:
            e["secs"] = float(mh.group(1)) if mh.group(1) else int(mh.group(3)) * 60 + int(mh.group(4))
            e.setdefault("sets", 1)
            rest = rest[:mh.start()] + " " + rest[mh.end():]

    if "secs" not in e and "reps" not in e and cat != "mobility":
        mb = re.search(r"(?<![\d.])(\d{1,3})(?![\d.]|\s*(cm|in|mm))", rest)
        if mb:  # "ring dips 10" -> one set of 10
            v = int(mb.group(1))
            e["sets"] = 1
            e["secs" if key in HOLDS else "reps"] = v

    md = RE_DIST.search(rest)
    if md:
        v, u = float(md.group(1)), md.group(2).lower()
        e["cm"] = round(v * 2.54, 1) if u.startswith("in") else v
    if cat == "mobility":
        for word, lvl in LEVELS:
            if re.search(r"\b" + word + r"\b", low):
                e["level"], e["level_name"] = lvl, word
                break
        if RE_PASS.search(rest):
            e["pass"] = True
        elif RE_FAIL.search(rest):
            e["pass"] = False

    if cat == "test":  # tests carry their own defaults
        if key == "hang_test":
            e.setdefault("secs", 7.0)
        if key == "pull_test":
            e.setdefault("reps", 2)
        if key == "repeater_test":
            mrp = re.search(r"(\d{1,3})\s*(reps?)?\b", RE_LOAD.sub(" ", RE_PCT.sub(" ", line)))
            if "reps" not in e and mrp:
                e["reps"] = int(mrp.group(1))
            e.pop("secs", None)
            e.pop("added_kg", None)  # "60%" refers to the max-hang load, not bodyweight
        if key in ("hang_test", "pull_test") and "added_kg" not in e:
            return None
        if key == "repeater_test" and "reps" not in e:
            return None
        return e
    if cat != "mobility" and not any(k in e for k in ("reps", "secs")):
        return None  # e.g. a stray sentence that mentions "hang"
    if cat == "mobility" and not any(k in e for k in ("cm", "level", "pass", "secs", "reps")):
        return None
    if "sets" in e and "total" not in e:
        e["total"] = e["sets"] * e.get("reps", 0) if "reps" in e else None
        if e["total"] is None:
            del e["total"]
    return e


def parse_description(text, bodyweight_kg=None):
    out, skipped = [], []
    for raw in re.split(r"[\n;]+", text or ""):
        if not raw.strip():
            continue
        e = parse_line(raw, bodyweight_kg)
        if e:
            out.append(e)
        elif re.search(r"\d", raw) and not raw.strip().lower().startswith("http"):
            skipped.append(raw.strip())
    return out, skipped


if __name__ == "__main__":
    import json, sys
    print(json.dumps(parse_description(sys.stdin.read(), 81.2), indent=1))
