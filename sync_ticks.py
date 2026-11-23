"""Pull the Mountain Project tick export and merge it into ticks.csv.

Runs nightly from .github/workflows/sync-ticks.yml. The profile comes from the
MP_PROFILE repo variable (e.g. "user/123456789/will-cohen").

- Private notes and personal star ratings are dropped before anything is saved.
- Ticks already in ticks.csv are kept even if they aren't on Mountain Project
  (so hand-added ticks survive); exact duplicates are not added twice.
"""
import csv, io, os, re, sys, urllib.request
from collections import Counter

COLS = ["Date", "Route", "Rating", "URL", "Pitches", "Location", "Style", "Lead Style", "Route Type", "Rating Code"]
profile = os.environ.get("MP_PROFILE", "").strip().strip("/")
profile = re.sub(r"^https?://(www\.)?mountainproject\.com/", "", profile)
profile = re.sub(r"/ticks$|/tick-export$", "", profile)
if not re.match(r"^user/\d+/[\w-]+$", profile):
    sys.exit(f"MP_PROFILE should look like user/123456789/your-name, got: {profile!r}")

url = f"https://www.mountainproject.com/{profile}/tick-export"
req = urllib.request.Request(url, headers={"User-Agent": "wheelclimbs-sync (github.com/wheelson93/wheelclimbs)"})
raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8-sig")
fresh = list(csv.DictReader(io.StringIO(raw)))
if not fresh or "Rating Code" not in fresh[0]:
    sys.exit("Export came back empty or in an unexpected format; leaving ticks.csv alone.")

def tidy(r):
    out = {c: (r.get(c) or "").strip() for c in COLS}
    m = re.search(r"route/(\d+)", out["URL"])
    if m:
        out["URL"] = f"https://www.mountainproject.com/route/{m.group(1)}"
    return out

key = lambda r: (r["Date"], r["URL"] or r["Route"], r["Style"], r["Lead Style"])
with open("ticks.csv", encoding="utf-8") as f:
    existing = [tidy(r) for r in csv.DictReader(f)]
fresh = [tidy(r) for r in fresh]

# Multiset union: keep the larger count of each identical tick from either side.
have, new = Counter(map(key, existing)), Counter(map(key, fresh))
merged = list(existing)
for r in fresh:
    k = key(r)
    if new[k] > have[k]:
        merged.append(r)
        have[k] += 1
merged.sort(key=lambda r: r["Date"], reverse=True)

buf = io.StringIO()
w = csv.DictWriter(buf, fieldnames=COLS, lineterminator="\n")
w.writeheader(); w.writerows(merged)
with open("ticks.csv", "w", encoding="utf-8") as f:
    f.write(buf.getvalue())
print(f"MP export: {len(fresh)} ticks · site now has {len(merged)} ({len(merged) - len(existing)} new)")
