# wheelclimbs.com

Static climbing-training dashboard: ticks, grade pyramid, progression, the road-back-to-5.12 plan, fall/winter targets and the to-do list. No build step — plain HTML/CSS/JS with d3 from jsDelivr.

## Deploy (GitHub Pages + Cloudflare DNS)

1. Create a public repo `wheelson93/wheelclimbs` and upload everything in this folder (keep `CNAME`).
2. Repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Cloudflare DNS for wheelclimbs.com:
   - `A` records for `@` → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   - `CNAME` `www` → `wheelson93.github.io`
   - Set these to **DNS only** (grey cloud) until GitHub issues the certificate, then you can proxy if you like.
4. Back in Settings → Pages, confirm the custom domain shows wheelclimbs.com and tick **Enforce HTTPS**.

## Updating ticks

Export your ticks from Mountain Project (profile → Ticks → Export CSV) and replace `ticks.csv`. The site reads columns by name, so a raw MP export works as-is. Everything (tiles, charts, targets, to-do check-offs) recalculates on load.

Note: a raw export includes your private tick notes, and anything in this repo is public. Delete the `Notes` column first if you'd rather keep those off the web.

## Editing

- Plan text: `index.html`, the `#plan` section.
- Targets (grade bands, counts, date window): `app.js`, search `tiers`.
- To-do routes: `todo.json`.

Preview locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
