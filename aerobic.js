/* Wheel Climbs — aerobic page. Reads aerobic.json (written nightly by sync_strava.py). */
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const D = await (await fetch('aerobic.json', { cache: 'no-cache' })).json();
  const T = D.thresholds;
  const acts = D.activities.map((a) => ({ ...a, dt: new Date(a.date + 'T12:00:00') })).sort((a, b) => a.dt - b.dt);
  const today = new Date();
  const DAY = 864e5;
  const fmtDate = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const hrs = (m) => (m / 60).toFixed(m < 600 ? 1 : 0);
  const SPORTS = [['Run', '--c0', 'Run'], ['Hike', '--c2', 'Hike / trail'], ['Walk', '--c4', 'Walk'], ['Other', '--c1', 'Stairs / other']];
  const bucket = (s) => (s === 'Run' || s === 'VirtualRun' ? 'Run' : s === 'Hike' || s === 'TrailRun' || s === 'Alpine' ? 'Hike' : s === 'Walk' ? 'Walk' : 'Other');
  const mins = (a) => a.moving_min || a.elapsed_min;
  $('#updated').textContent = fmtDate(new Date(D.updated + 'T12:00:00'));
  document.querySelectorAll('.aetv').forEach((n) => (n.textContent = T.aet));

  // ---- tiles ----
  const since = (days) => acts.filter((a) => today - a.dt <= days * DAY);
  const last12 = since(84);
  const crs = acts.filter((a) => a.vert_ft >= 300 && a.moving_min > 0 && /Hike|TrailRun/.test(a.sport)).map((a) => ({ ...a, cr: a.vert_ft / (a.moving_min / 60) }));
  const bestCr = d3.max(crs.filter((a) => today - a.dt <= 365 * DAY), (a) => a.cr);
  const z2 = d3.sum(last12, (a) => (a.zones_min ? a.zones_min[1] : 0));
  const tiles = [
    ['Aerobic hours', hrs(d3.sum(last12, mins)), 'Last 12 weeks'],
    ['Vert climbed', d3.format(',')(d3.sum(last12, (a) => a.vert_ft)) + ' ft', 'Last 12 weeks'],
    ['Zone 2 time', Math.round(z2) + ' min', `${T.aet - 15}–${T.aet} bpm, last 12 wks`],
    ['Best climb rate', bestCr ? Math.round(bestCr) + ' ft/hr' : '—', 'Last 12 months'],
    ['Active weeks', `${new Set(last12.map((a) => d3.timeMonday(a.dt).getTime())).size} of 12`, 'With any aerobic session'],
  ];
  $('#tiles').replaceChildren(...tiles.map(([l, v, s]) => { const t = el('div', 'tile'); t.append(el('div', 'lab', l), el('div', 'num', v), el('div', 'sub', s)); return t; }));

  // ---- thresholds ----
  const gap = Math.round((100 * (T.ant - T.aet)) / T.ant);
  const thr = $('#thr');
  [['Aerobic (AeT)', T.aet, T.aet_range, T.aet_measured], ['Anaerobic (AnT)', T.ant, T.ant_range, T.ant_measured]].forEach(([l, v, r, m]) => {
    const t = el('div', 't'); const lab = el('div', 'lab', l); lab.append(el('span', 'badge' + (m ? ' ok' : ''), m ? 'measured' : 'estimate'));
    t.append(lab, el('div', 'v', v), el('div', 'r', `likely ${r[0]}–${r[1]} bpm`)); thr.append(t);
  });
  $('#gapnote').textContent = `AeT sits ${gap}% below AnT. A gap over ~10% means aerobic base is the limiter, so most training time belongs at or just under ${T.aet} bpm, not in the ${T.aet + 1}–${T.ant - 1} “gray zone”. ${T.aet_measured ? '' : T.aet_basis}`;
  (function hrbar() {
    const box = $('#hrbar'); box.replaceChildren();
    const W = box.clientWidth || 400, H = 56, lo = 90, hi = T.max_hr_est || 190;
    const x = d3.scaleLinear([lo, hi], [4, W - 4]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const bands = [[lo, T.aet - 15, '--c4', 'Recovery'], [T.aet - 15, T.aet, '--c2', 'Zone 2'], [T.aet, T.ant, '--c3', 'Gray zone'], [T.ant, hi, '--c0', 'Above AnT']];
    bands.forEach(([a, b, c, n]) => {
      svg.append('rect').attr('x', x(a)).attr('y', 8).attr('width', Math.max(0, x(b) - x(a) - 1)).attr('height', 16).attr('rx', 3).style('fill', `var(${c})`).attr('opacity', 0.85);
      if (x(b) - x(a) > 54) svg.append('text').attr('x', (x(a) + x(b)) / 2).attr('y', 40).attr('text-anchor', 'middle').text(n);
    });
    [[T.aet, 'AeT'], [T.ant, 'AnT']].forEach(([v, n]) => {
      svg.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 4).attr('y2', 28).style('stroke', css('--fg')).attr('stroke-width', 2);
      svg.append('text').attr('x', x(v)).attr('y', 54).attr('text-anchor', 'middle').style('fill', css('--fg')).style('font-weight', 600).text(`${n} ${v}`);
    });
  })();

  // ---- drift test + retest ----
  const tests = (D.drift_tests || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const lt = tests[0];
  const box = $('#driftlast');
  if (lt) {
    const pass = lt.pa_hr_drift_pct <= 5;
    const h = el('div', 'lab'); h.textContent = `Latest: ${fmtDate(new Date(lt.date + 'T12:00:00'))} · ${lt.name}`;
    h.append(el('span', 'badge' + (pass ? ' ok' : ' due'), lt.pa_hr_drift_pct > 5 ? 'over 5%' : lt.pa_hr_drift_pct >= 3.5 ? 'at AeT' : 'under 3.5%'));
    const dl = el('dl', 'dl');
    [['Steady segment', `${lt.steady_min} min`], ['HR first → second half', `${lt.hr1} → ${lt.hr2} bpm`], ['Pace:HR drift', `${lt.pa_hr_drift_pct}%`]].forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v)));
    box.append(h, dl, el('p', 'note', lt.verdict));
  } else box.append(el('p', 'empty', 'No drift test yet.'));
  const T_ = D.thresholds || {}; const RETEST_WEEKS = T_.ant && T_.aet && (T_.ant - T_.aet) / T_.ant > 0.10 ? 4 : 6;
  const due = lt ? new Date(new Date(lt.date + 'T12:00:00').getTime() + RETEST_WEEKS * 7 * DAY) : today;
  const overdue = due <= today;
  const informal = !lt || lt.protocol !== 'test';
  const rt = $('#retest');
  rt.append(el('b', null, overdue ? 'Retest: due now' : `Retest: ${fmtDate(due)}`));
  rt.append(document.createTextNode(overdue
    ? ` — ${informal ? 'the last check was an informal run, so do a proper 60-min test this week' : `last test was ${Math.round((today - due) / DAY / 7 + RETEST_WEEKS)} weeks ago`}. Start around ${lt && lt.pa_hr_drift_pct >= 5 ? T.aet : T.aet + 3} bpm.`
    : ` (every ${RETEST_WEEKS} weeks while base building). Target ${T.aet} bpm.`));

  // ---- weekly volume ----
  (function () {
    const vb = $('#vol-chart'); let metric = 'hours';
    legendFill($('#vol-legend'), SPORTS.map(([, c, n]) => [c, n]));
    const weeks = d3.timeMonday.range(d3.timeMonday.offset(d3.timeMonday(today), -25), d3.timeMonday.offset(d3.timeMonday(today), 1));
    const rows = weeks.map((w) => {
      const r = acts.filter((a) => d3.timeMonday(a.dt).getTime() === w.getTime());
      const o = { w, vert: d3.sum(r, (a) => a.vert_ft), n: r.length };
      SPORTS.forEach(([k]) => { const g = r.filter((a) => bucket(a.sport) === k); o['hours_' + k] = d3.sum(g, mins) / 60; o['vert_' + k] = d3.sum(g, (a) => a.vert_ft); });
      o.hours = d3.sum(SPORTS, ([k]) => o['hours_' + k]); return o;
    });
    function draw() {
      vb.querySelectorAll('svg').forEach((n) => n.remove());
      const W = vb.clientWidth || 640, H = 240, ml = 36;
      const svg = d3.select(vb).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
      const keys = SPORTS.map(([k]) => metric + '_' + k);
      const max = d3.max(rows, (r) => d3.sum(keys, (k) => r[k])) || 1;
      const y = d3.scaleLinear([0, Math.min(max, metric === 'hours' ? 12 : 1e9)], [H - 24, 8]).nice().clamp(true);
      const x = d3.scaleBand(rows.map((r) => r.w), [ml, W - 4]).padding(0.2);
      const ga = svg.append('g').attr('transform', `translate(${ml - 6},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml)).tickFormat(metric === 'hours' ? (v) => v + 'h' : d3.format('~s')));
      ga.select('.domain').remove(); ga.selectAll('line').style('stroke', css('--grid')).attr('transform', 'translate(6,0)');
      const step = x.bandwidth() < 18 ? 4 : 2;
      const gx = svg.append('g').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).tickSize(0).tickFormat((d, i) => (i % step ? '' : d3.timeFormat('%b %-d')(d))));
      gx.select('.domain').remove(); gx.selectAll('text').attr('dy', '1em');
      d3.stack().keys(keys)(rows).forEach((s, i) => svg.append('g').selectAll('rect').data(s).join('rect')
        .attr('x', (d) => x(d.data.w)).attr('width', x.bandwidth()).attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]) - (d[1] > d[0] ? 1 : 0)))
        .attr('rx', 2).style('fill', `var(${SPORTS[i][1]})`));
      svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (d) => x(d.w)).attr('width', x.step()).attr('y', 0).attr('height', H - 22).attr('fill', 'transparent')
        .on('pointermove', (ev, d) => tip(vb, ev, [el('div', 't', 'Week of ' + d3.timeFormat('%b %-d')(d.w)), line(null, `${d.hours.toFixed(1)} h · ${d3.format(',')(d.vert)} ft · ${d.n} sessions`)]))
        .on('pointerleave', () => hide(vb));
    }
    seg('vol-metric', (v) => { metric = v; draw(); });
    draw(); window.addEventListener('resize', debounce(draw));
  })();

  // ---- intensity mix ----
  (function () {
    const Z = [['--c4', 'Recovery'], ['--c2', 'Zone 2 (base)'], ['--c3', 'Gray zone'], ['--c0', 'Above AnT']];
    legendFill($('#int-legend'), Z);
    const rows = acts.filter((a) => a.zones_min).slice(-10).reverse();
    const max = d3.max(rows, (a) => d3.sum(a.zones_min)) || 1;
    const tot = [0, 0, 0, 0]; rows.forEach((a) => a.zones_min.forEach((v, i) => (tot[i] += v)));
    const box = $('#int-chart');
    rows.forEach((a) => {
      const r = el('div', 'int-row'); r.append(el('div', 'lb', `${d3.timeFormat('%b %-d')(a.dt)} · ${a.sport.replace('TrailRun', 'Trail')}`));
      const bar = el('div', 'int-bar'); bar.style.width = (100 * d3.sum(a.zones_min)) / max + '%';
      a.zones_min.forEach((v, i) => { if (!v) return; const s = el('div'); s.style.width = (100 * v) / d3.sum(a.zones_min) + '%'; s.style.background = `var(${Z[i][0]})`; s.title = `${Z[i][1]}: ${Math.round(v)} min`; bar.append(s); });
      r.append(bar); box.append(r);
    });
    const train = tot[1] + tot[2] + tot[3];
    if (train) box.append(el('p', 'note', `Of training time (excluding recovery), ${Math.round((100 * tot[1]) / train)}% was in Zone 2 and ${Math.round((100 * tot[2]) / train)}% in the gray zone. Easy runs are landing above AeT. Slow down or walk the hills to keep them under ${T.aet}.`));
  })();

  // ---- climbing rate ----
  (function () {
    const b = $('#cr-chart');
    function draw() {
      b.querySelectorAll('svg').forEach((n) => n.remove());
      if (!crs.length) { b.append(el('p', 'empty', 'No qualifying hikes yet.')); return; }
      const W = b.clientWidth || 400, H = 220, ml = 44;
      const svg = d3.select(b).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
      const x = d3.scaleTime(d3.extent(crs, (a) => a.dt), [ml + 6, W - 26]).nice();
      const y = d3.scaleLinear([0, d3.max(crs, (a) => a.cr) * 1.1], [H - 24, 8]).nice();
      const ga = svg.append('g').attr('transform', `translate(${ml - 6},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml)).tickFormat(d3.format(',')));
      ga.select('.domain').remove(); ga.selectAll('line').style('stroke', css('--grid')).attr('transform', 'translate(6,0)');
      const gx = svg.append('g').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(W < 500 ? 3 : 6).tickSize(0));
      gx.select('.domain').remove(); gx.selectAll('text').attr('dy', '1em');
      svg.append('g').selectAll('circle').data(crs).join('circle').attr('cx', (a) => x(a.dt)).attr('cy', (a) => y(a.cr)).attr('r', (a) => 3 + Math.sqrt(a.vert_ft) / 12)
        .style('fill', 'var(--c2)').attr('fill-opacity', 0.75).style('stroke', css('--panel'))
        .on('pointermove', (ev, a) => tip(b, ev, [el('div', 't', fmtDate(a.dt)), line(null, `${Math.round(a.cr)} ft/hr · ${d3.format(',')(a.vert_ft)} ft in ${hrs(a.moving_min)} h`), line(null, a.name)]))
        .on('pointerleave', () => hide(b));
    }
    draw(); window.addEventListener('resize', debounce(draw));
  })();

  // ---- long days ----
  (function () {
    const top = acts.slice().sort((a, b) => b.elapsed_min - a.elapsed_min).slice(0, 6);
    $('#long-list').replaceChildren(...top.map((a) => {
      const r = el('a', 'ld-row'); r.href = `https://www.strava.com/activities/${a.id}`; r.target = '_blank'; r.rel = 'noopener'; r.style.textDecoration = 'none';
      const l = el('div'); l.append(el('div', null, a.name), el('div', 'm', `${fmtDate(a.dt)} · ${a.sport}`));
      const h = a.elapsed_min >= 120 ? `${(a.elapsed_min / 60).toFixed(1)} h` : `${Math.round(a.elapsed_min)} min`;
      r.append(l, el('div', 'n', `${h}${a.vert_ft ? ' · ' + d3.format(',')(a.vert_ft) + ' ft' : a.mi ? ' · ' + a.mi.toFixed(1) + ' mi' : ''}`));
      return r;
    }));
  })();

  // ---- consistency heatmap ----
  (function () {
    const start = d3.timeMonday.offset(d3.timeMonday(today), -25);
    const byDay = d3.rollup(acts, (v) => d3.sum(v, mins), (a) => d3.timeDay(a.dt).getTime());
    const days = d3.timeDay.range(start, d3.timeDay.offset(today, 1));
    const c = d3.scaleSequential([0, 120], (t) => d3.interpolate(css('--track'), css('--c2'))(Math.min(1, 0.25 + t * 0.75))).clamp(true);
    const box = el('div', 'heat');
    days.forEach((d) => { const m = byDay.get(d.getTime()) || 0; const n = el('div'); if (m) n.style.background = c(m); n.title = `${d3.timeFormat('%a %b %-d')(d)}${m ? ' · ' + Math.round(m) + ' min' : ''}`; box.append(n); });
    $('#heat').replaceChildren(box);
    const active = new Set(acts.filter((a) => a.dt >= start).map((a) => d3.timeDay(a.dt).getTime())).size;
    $('#heat').append(el('p', 'note', `${active} aerobic days in 26 weeks. Base building works best at 3–5 days a week.`));
  })();

  // ---- lede ----
  const lastA = acts[acts.length - 1];
  $('#lede').textContent = `AeT ≈ ${T.aet} bpm, AnT ≈ ${T.ant} bpm. ${d3.format(',')(Math.round(d3.sum(since(365), mins) / 60))} aerobic hours and ${d3.format(',')(d3.sum(since(365), (a) => a.vert_ft))} ft of vert in the last year. Last session: ${lastA.name}, ${fmtDate(lastA.dt)}.`;

  // ---- helpers ----
  function tip(box, ev, nodes) {
    const t = box.querySelector('.tip'); t.replaceChildren(...nodes); t.style.display = 'block';
    const b = box.getBoundingClientRect(); let x = ev.clientX - b.left + 12, y = ev.clientY - b.top + 12;
    if (x + t.offsetWidth > b.width) x = ev.clientX - b.left - t.offsetWidth - 12; if (x < 0) x = 0;
    if (y + t.offsetHeight > b.height) y = Math.max(0, ev.clientY - b.top - t.offsetHeight - 12);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hide(box) { box.querySelector('.tip').style.display = 'none'; }
  function line(c, text) { const l = el('div', 'ln'); if (c) { const s = el('span', 'sw'); s.style.background = `var(${c})`; l.append(s); } l.append(text); return l; }
  function legendFill(node, items) { node.replaceChildren(...items.map(([c, n]) => { const s = el('span'); const w = el('span', 'sw'); w.style.background = `var(${c})`; s.append(w, n); return s; })); }
  function seg(id, fn) { document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener('click', () => { document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v); })); }
  function debounce(f) { let t; return () => { clearTimeout(t); t = setTimeout(f, 150); }; }
})();
