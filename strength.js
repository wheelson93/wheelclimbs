/* Wheel Climbs — strength & mobility page. Reads strength.json (written nightly by sync_strava.py). */
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  let S;
  try { S = await (await fetch('strength.json', { cache: 'no-cache' })).json(); } catch { S = { sessions: [], bodyweight_kg: 81.2 }; }
  const BW = S.bodyweight_kg || 81.2;
  const LB = 2.20462;
  const DAY = 864e5, today = new Date();
  const dt = (d) => new Date(d + 'T12:00:00');
  const fmtDate = (d) => dt(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const iso = d3.timeFormat('%Y-%m-%d');
  const lb = (kg) => Math.round(kg * LB);
  const signed = (kg) => (kg > 0 ? '+' : kg < 0 ? '−' : '') + (kg ? Math.abs(lb(kg)) + ' lb' : 'bodyweight');
  const e1rm = (load, reps) => load * (1 + Math.min(reps, 12) / 30);
  const sessions = (S.sessions || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const E = sessions.flatMap((s) => (s.entries || []).map((e) => ({ ...e, date: s.date, sid: s.id })));
  const by = d3.group(E, (e) => e.key);
  const of = (k, f = () => true) => (by.get(k) || []).filter(f);
  $('#updated').textContent = S.updated ? fmtDate(S.updated) : '—';
  $('#bw').textContent = `${lb(BW)} lb`;

  // ---------- benchmarks ----------
  // Each returns {p: 0..1 progress toward the goal, hit, best: text, date}
  const bestBy = (list, f) => list.reduce((m, e) => (m == null || f(e) > f(m) ? e : m), null);
  const reps = (k, goal, f) => () => {
    const b = bestBy(of(k, f), (e) => e.reps || 0);
    return b && { p: b.reps / goal, hit: b.reps >= goal, best: `${b.reps}${b.per_side ? '/side' : ''}${b.added_kg > 0 ? ' at ' + signed(b.added_kg) : ''}`, date: b.date };
  };
  const hold = (k, goal) => () => {
    const b = bestBy(of(k), (e) => e.secs || 0);
    return b && { p: b.secs / goal, hit: b.secs >= goal, best: `${Math.round(b.secs)} s${b.per_side ? '/side' : ''}`, date: b.date };
  };
  const loaded = (k, kg, r) => () => {
    const list = of(k, (e) => e.load_kg && e.reps);
    const b = bestBy(list, (e) => e1rm(e.load_kg, e.reps));
    return b && { p: e1rm(b.load_kg, b.reps) / e1rm(kg, r), hit: b.load_kg >= kg && b.reps >= r, best: `${b.load_kg} kg × ${b.reps}${b.per_side ? '/side' : ''}`, date: b.date };
  };
  const BM = [
    { cat: 'Fingers & pull', label: 'Hangboard', goal: `10 s on a 20 mm edge at +${lb(0.3 * BW)}–${lb(0.4 * BW)} lb`, f: () => {
      const list = of('hang', (e) => e.grip !== 'f3' && (e.secs || 0) >= 10 && (!e.edge_mm || e.edge_mm <= 20));
      const b = bestBy(list, (e) => e.added_kg || 0);
      if (!b) return of('hang').length ? { p: 0, best: 'only bigger edges / shorter hangs so far', date: of('hang')[0].date } : null;
      const tot = BW + (b.added_kg || 0);
      return { p: (tot / BW - 1) / 0.35, hit: b.added_kg >= 0.3 * BW, best: `${signed(b.added_kg || 0)}${b.edge_mm ? ' · ' + b.edge_mm + ' mm' : ''}`, date: b.date };
    } },
    { cat: 'Fingers & pull', label: 'Pull-up', goal: `12–15 strict, or one rep at +${lb(0.5 * BW)} lb`, f: () => {
      const bwList = of('pullup', (e) => (e.added_kg || 0) >= -0.5 && e.reps);
      const r = bestBy(bwList, (e) => e.reps || 0);
      const w = bestBy(of('pullup', (e) => e.added_kg > 0 && e.reps), (e) => e1rm(BW + e.added_kg, e.reps));
      if (!r && !w) return null;
      const pr = r ? r.reps / 12 : 0, pw = w ? (e1rm(BW + w.added_kg, w.reps) - BW) / (0.5 * BW) : 0;
      const txt = [r && `${r.reps} reps`, w && `${signed(w.added_kg)} × ${w.reps}`].filter(Boolean).join(' · ');
      return { p: Math.max(pr, pw), hit: pr >= 1 || pw >= 1, best: txt, date: [r, w].filter(Boolean).map((x) => x.date).sort().pop() };
    } },
    { cat: 'Push', label: 'Ring dips', goal: '10–15 strict', f: reps('ring_dip', 10) },
    { cat: 'Push', label: 'Overhead press', goal: '24 kg × 5 per arm', f: loaded('ohp', 24, 5) },
    { cat: 'Push', label: 'Push-ups', goal: '20+ with good form', f: reps('pushup', 20) },
    { cat: 'Core', label: 'L-sit (rings)', goal: '30 s hold', f: hold('lsit', 30) },
    { cat: 'Core', label: 'Ab wheel', goal: '10 kneeling rollouts · stretch: standing', f: () => {
      const r = reps('abwheel', 10, (e) => e.variant !== 'standing')();
      const st = bestBy(of('abwheel', (e) => e.variant === 'standing'), (e) => e.reps || 0);
      if (!r && !st) return null;
      const out = r || { p: 1, hit: true, best: '', date: st.date };
      if (st) { out.best = [out.best, `standing ${st.reps}`].filter(Boolean).join(' · '); out.stretch = true; }
      return out;
    } },
    { cat: 'Core', label: 'Toes-to-bar', goal: '10 strict', f: reps('t2b', 10) },
    { cat: 'Core', label: 'Side plank', goal: '45 s per side', f: hold('side_plank', 45) },
    { cat: 'Core', label: 'Back extension hold', goal: '60 s', f: hold('back_ext', 60) },
    { cat: 'Legs', label: 'Pistol squat', goal: '5 per leg', f: reps('pistol', 5) },
    { cat: 'Legs', label: 'Single-leg RDL', goal: '24 kg × 8 per side', f: loaded('srdl', 24, 8) },
    { cat: 'Legs', label: 'Hamstring curl', goal: '15 two-legged · stretch: 8 single-leg/side', f: () => {
      const d = bestBy(of('ham_curl', (e) => e.variant !== 'single'), (e) => e.reps || 0);
      const s1 = bestBy(of('ham_curl', (e) => e.variant === 'single'), (e) => e.reps || 0);
      if (!d && !s1) return null;
      const p = Math.max(d ? d.reps / 15 : 0, s1 ? Math.min(1, 0.6 + s1.reps / 20) : 0);
      return { p, hit: (d && d.reps >= 15) || (s1 && s1.reps >= 8), stretch: s1 && s1.reps >= 8,
        best: [d && `${d.reps} two-legged`, s1 && `${s1.reps}/side single`].filter(Boolean).join(' · '), date: [d, s1].filter(Boolean).map((x) => x.date).sort().pop() };
    } },
    { cat: 'Legs', label: 'Cossack squat', goal: '16 kg × 8 per side, heel flat', f: loaded('cossack', 16, 8) },
  ];
  const results = BM.map((b) => ({ ...b, r: b.f() }));
  const bm = $('#bm');
  d3.groups(results, (b) => b.cat).forEach(([cat, items]) => {
    const g = el('div', 'bm-group'); g.append(el('h3', null, cat));
    items.forEach((b) => {
      const row = el('div', 'tg-row bm-row');
      const bl = el('div', 'bl'); const left = el('span'); left.append(el('b', null, b.label), el('span', 'bm-goal', b.goal));
      const right = el('span', null, b.r ? b.r.best : 'not logged');
      if (b.r && b.r.hit) right.append(el('span', 'badge ok', b.r.stretch ? 'stretch ✓' : 'goal ✓'));
      bl.append(left, right);
      const tr = el('div', 'track'); const fl = el('div', 'fillb');
      fl.style.width = `${Math.max(b.r ? 3 : 0, Math.min(100, 100 * (b.r ? b.r.p : 0)))}%`;
      fl.style.background = `var(${b.r && b.r.hit ? '--ok' : '--c0'})`;
      tr.append(fl); row.append(bl, tr);
      if (b.r && b.r.date) row.append(el('div', 'bm-when', `last best ${fmtDate(b.r.date)}`));
      g.append(row);
    });
    bm.append(g);
  });

  // ---------- tests (max hang, 2-rep-max pull-up, 60% repeaters, side split) ----------
  const TESTS = [
    { key: 'hang_test', f: (e) => e.grip !== 'f3', label: 'Max hang · half crimp', how: '7 s on 20 mm, most weight held', v: (e) => e.added_kg, show: (e) => `${signed(e.added_kg)} · ${Math.round((100 * (BW + e.added_kg)) / BW)}% of bodyweight${e.edge_mm && e.edge_mm !== 20 ? ' · ' + e.edge_mm + ' mm' : ''}`, d: (x) => `${x > 0 ? '+' : '−'}${Math.abs(lb(x))} lb`, train: (e) => `Train max hangs at about ${signed(0.85 * (BW + e.added_kg) - BW)} (85%).` },
    { key: 'hang_test', f: (e) => e.grip === 'f3', label: 'Max hang · front-three open', how: '7 s on 20 mm, most weight held', v: (e) => e.added_kg, show: (e) => `${signed(e.added_kg)} · ${Math.round((100 * (BW + e.added_kg)) / BW)}% of bodyweight`, d: (x) => `${x > 0 ? '+' : '−'}${Math.abs(lb(x))} lb` },
    { key: 'pull_test', label: '2-rep-max pull-up', how: 'heaviest weight for 2 clean reps', v: (e) => e.added_kg, show: (e) => `${signed(e.added_kg)} × 2`, d: (x) => `${x > 0 ? '+' : '−'}${Math.abs(lb(x))} lb` },
    { key: 'repeater_test', label: '60% repeaters', how: '7 s on / 3 s off at 60% of max hang, reps to failure', v: (e) => e.reps, show: (e) => `${e.reps} reps`, d: (x) => `${x > 0 ? '+' : '−'}${Math.abs(x)} reps` },
    { key: 'side_split', label: 'Side split', how: 'foot-to-foot span, measured the same way each time', v: (e) => e.cm, show: (e) => `${e.cm} cm`, d: (x) => `${x > 0 ? '+' : '−'}${Math.abs(x)} cm` },
  ];
  const tl = $('#test-list');
  let lastTestDate = null;
  TESTS.forEach((t) => {
    const list = of(t.key, t.f).filter((e) => t.v(e) != null).sort((a, b) => (a.date < b.date ? 1 : -1));
    const [cur, prev] = list;
    if (cur && (!lastTestDate || cur.date > lastTestDate)) lastTestDate = cur.date;
    const row = el('div', 'ld-row');
    const l = el('div'); l.append(el('div', null, t.label), el('div', 'm', t.how));
    const r = el('div', 'n');
    if (!cur) r.append(el('span', 'm', 'not tested'));
    else {
      r.append(el('div', null, t.show(cur)));
      r.append(el('div', 'm', fmtDate(cur.date) + (prev ? ` · ${t.d(t.v(cur) - t.v(prev))} since ${fmtDate(prev.date)}` : '')));
      if (t.train) r.append(el('div', 'm', t.train(cur)));
    }
    row.append(l, r); tl.append(row);
  });
  const nextTest = (window.WC && WC.testWeeks || []).find((w) => w >= iso(d3.timeMonday(today)));
  $('#testdue').append(el('span', 'badge' + (nextTest && nextTest === iso(d3.timeMonday(today)) ? ' due' : ''), nextTest && nextTest === iso(d3.timeMonday(today)) ? 'test week' : 'next test'),
    document.createTextNode(nextTest ? ` Week of ${fmtDate(nextTest)}. ${lastTestDate ? 'Last tested ' + fmtDate(lastTestDate) + '.' : 'No baseline yet; the first test sets your starting loads.'}` : ' No more test weeks in the plan.'));

  // ---------- mobility ----------
  const MOB = [
    { key: 'high_step', label: 'High step', goal: 'Foot to hip height or above, standing tall', show: (e) => (e.pass ? 'pass' : e.pass === false ? 'not yet' : e.cm ? `${e.cm} cm` : '—'), ok: (e) => e.pass === true },
    { key: 'pancake', label: 'Pancake', goal: 'Chest to floor (track cm to go)', show: (e) => (e.cm != null ? `${e.cm} cm to floor` : e.pass ? 'chest down' : '—'), ok: (e) => e.cm === 0 || e.pass === true, alt: 'frog' },
    { key: 'overhead_reach', label: 'Overhead reach', goal: 'Both arms to the floor lying down, ribs down', show: (e) => (e.pass ? 'pass' : e.pass === false ? 'not yet' : '—'), ok: (e) => e.pass === true },
    { key: 'toe_touch', label: 'Toe touch', goal: 'Straight legs, palms flat', show: (e) => e.level_name || (e.pass ? 'palms' : e.cm != null ? `${e.cm} cm` : '—'), ok: (e) => e.level === 3 || e.pass === true },
  ];
  const mob = $('#mob');
  let lastMob = null;
  MOB.forEach((m) => {
    const list = of(m.key).concat(m.alt ? of(m.alt) : []).sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = list[0], first = list[list.length - 1];
    if (latest && (!lastMob || latest.date > lastMob)) lastMob = latest.date;
    const row = el('div', 'ld-row');
    const l = el('div'); l.append(el('div', null, m.label), el('div', 'm', m.goal));
    const r = el('div', 'n');
    if (!latest) r.append(el('span', 'm', 'not tested'));
    else {
      r.append(el('div', null, m.show(latest)));
      if (m.ok(latest)) r.lastChild.append(el('span', 'badge ok', '✓'));
      let sub = fmtDate(latest.date);
      if (m.key === 'pancake' && first !== latest && first.cm != null && latest.cm != null) sub += ` · ${first.cm - latest.cm >= 0 ? '−' : '+'}${Math.abs(first.cm - latest.cm)} cm since ${fmtDate(first.date)}`;
      r.append(el('div', 'm', sub));
    }
    row.append(l, r); mob.append(row);
  });
  const due = !lastMob || (today - dt(lastMob)) / DAY > 30;
  const md = $('#mobdue');
  md.append(el('span', 'badge' + (due ? ' due' : ' ok'), due ? 'check due' : 'up to date'),
    document.createTextNode(lastMob ? ` Last checked ${fmtDate(lastMob)}. ${due ? 'Run all four after a warm-up and log them in one session.' : 'Next check in about ' + Math.ceil(30 - (today - dt(lastMob)) / DAY) + ' days.'}` : ' No checks logged yet. Do all four after a warm-up and add a line for each, like "pancake 25cm".'));

  // ---------- tiles + lede ----------
  const since = (days) => sessions.filter((s) => (today - dt(s.date)) / DAY <= days);
  const s28 = since(28);
  const sets28 = d3.sum(s28.flatMap((s) => s.entries || []), (e) => e.sets || 1);
  const hits = results.filter((b) => b.r && b.r.hit).length, logged = results.filter((b) => b.r).length;
  const hang = results[0].r;
  const tiles = [
    ['Sessions', s28.length, 'Last 4 weeks'],
    ['Working sets', sets28 || '—', 'Last 4 weeks'],
    ['Benchmarks hit', `${hits} of ${BM.length}`, `${logged} logged so far`],
    ['Hangboard best', hang && hang.best && !/only/.test(hang.best) ? hang.best.split(' · ')[0] : '—', '10 s on ≤20 mm'],
    ['Mobility check', lastMob ? fmtDate(lastMob) : '—', due ? 'Due' : 'Monthly'],
  ];
  $('#tiles').replaceChildren(...tiles.map(([l, v, s]) => { const t = el('div', 'tile'); t.append(el('div', 'lab', l), el('div', 'num', v), el('div', 'sub', s)); return t; }));
  const parsed = sessions.filter((s) => (s.entries || []).length);
  $('#lede').textContent = parsed.length
    ? `${parsed.length} logged session${parsed.length > 1 ? 's' : ''} since ${fmtDate(parsed[parsed.length - 1].date)}. ${hits} of ${BM.length} benchmarks met.`
    : `${sessions.length} strength sessions on Strava, but no exercises logged yet. Add them to the description (see How to log) and the benchmarks fill in overnight.`;

  // ---------- sessions ----------
  const fmtEntry = (e) => {
    const load = e.load_kg ? `${e.load_kg} kg` : e.added_kg ? signed(e.added_kg) : '';
    const dose = e.secs != null ? `${e.sets && e.sets > 1 ? e.sets + '×' : ''}${Math.round(e.secs)}s` : e.reps != null ? `${e.sets && e.sets > 1 ? e.sets + '×' : ''}${e.reps}` : '';
    const mobv = e.cat === 'mobility' ? (e.cm != null ? `${e.cm} cm` : e.level_name || (e.pass ? 'pass' : e.pass === false ? 'not yet' : '')) : '';
    return [e.name + (e.variant && e.variant !== 'double' && e.variant !== 'kneeling' ? ` (${e.variant})` : ''), e.edge_mm ? e.edge_mm + ' mm' : '', load, dose + (e.per_side ? '/side' : ''), mobv].filter(Boolean).join(' ');
  };
  const sess = $('#sess');
  if (!sessions.length) sess.append(el('div', 'empty', 'No strength sessions yet.'));
  sessions.slice(0, 8).forEach((s) => {
    const row = el('div', 'ss-row');
    const h = el('div', 'ss-h'); h.append(el('b', null, s.name), el('span', 'm', `${fmtDate(s.date)} · ${Math.round(s.minutes || 0)} min`));
    row.append(h);
    const es = s.entries || [];
    if (es.length) { const chips = el('div', 'ss-chips'); es.forEach((e) => chips.append(el('span', 'ss-chip c-' + e.cat, fmtEntry(e)))); row.append(chips); }
    else row.append(el('div', 'm', 'entries' in s ? 'No exercises in the description.' : 'Not read yet (next nightly sync).'));
    if ((s.skipped || []).length) row.append(el('div', 'ss-skip', `Couldn't read: ${s.skipped.join(' · ')}`));
    sess.append(row);
  });

  // ---------- weekly volume ----------
  const CATS = [['pull', '--c0', 'Fingers & pull'], ['push', '--c1', 'Push'], ['core', '--c3', 'Core'], ['legs', '--c2', 'Legs'], ['mobility', '--c4', 'Mobility'], ['other', '--muted', 'Other']];
  $('#vol-legend').replaceChildren(...CATS.map(([, c, n]) => { const s = el('span'); const sw = el('i', 'sw'); sw.style.background = `var(${c})`; s.append(sw, document.createTextNode(n)); return s; }));
  (function vol() {
    const box = $('#vol-chart'); const tip = box.querySelector('.tip');
    const W = box.clientWidth || 420, H = 200, m = { t: 18, r: 6, b: 22, l: 28 };
    const end = d3.timeMonday.ceil(today), start = d3.timeMonday.offset(end, -12);
    const weeks = d3.timeMonday.range(start, end);
    const rows = weeks.map((w) => {
      const ss = sessions.filter((s) => d3.timeMonday(dt(s.date)).getTime() === w.getTime());
      const o = { w, n: ss.length };
      CATS.forEach(([k]) => (o[k] = d3.sum(ss.flatMap((s) => s.entries || []).filter((e) => e.cat === k), (e) => e.sets || 1)));
      return o;
    });
    const stack = d3.stack().keys(CATS.map((c) => c[0]))(rows);
    const x = d3.scaleBand(weeks, [m.l, W - m.r]).padding(0.25);
    const ymax = d3.max(rows, (r) => d3.sum(CATS, ([k]) => r[k])) || 10;
    const y = d3.scaleLinear().domain([0, ymax]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r))).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('line').attr('stroke', css('--line')));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(weeks.filter((_, i) => i % 3 === 0)).tickFormat(d3.timeFormat('%b %-d')).tickSize(0)).call((g) => g.select('.domain').remove());
    stack.forEach((s, i) => svg.append('g').style('fill', `var(${CATS[i][1]})`).selectAll('rect').data(s).join('rect')
      .attr('x', (d) => x(d.data.w)).attr('width', x.bandwidth()).attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]))).attr('rx', 2));
    svg.append('g').selectAll('text').data(rows.filter((r) => r.n)).join('text').attr('x', (r) => x(r.w) + x.bandwidth() / 2)
      .attr('y', (r) => y(d3.sum(CATS, ([k]) => r[k])) - 4).attr('text-anchor', 'middle').style('font-size', '11px').style('fill', css('--muted')).text((r) => r.n);
    svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.w) - 2).attr('width', x.bandwidth() + 4).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev, r) => {
        tip.replaceChildren(el('div', 't', `Week of ${d3.timeFormat('%b %-d')(r.w)} · ${r.n} session${r.n === 1 ? '' : 's'}`), ...CATS.filter(([k]) => r[k]).map(([k, c, n]) => { const ln = el('div', 'ln'); const sw = el('i', 'sw'); sw.style.background = `var(${c})`; ln.append(sw, document.createTextNode(`${n}: ${r[k]} sets`)); return ln; }));
        tip.style.display = 'block'; const [px] = d3.pointer(ev, box); tip.style.left = Math.min(px + 12, box.clientWidth - 180) + 'px'; tip.style.top = '8px';
      }).on('pointerleave', () => (tip.style.display = 'none'));
  })();

  // ---------- weekly effort (session RPE × minutes) ----------
  (async function effort() {
    const box = $('#eff-chart'); const tip = box.querySelector('.tip');
    let A = null;
    try { A = await (await fetch('aerobic.json', { cache: 'no-cache' })).json(); } catch { A = null; }
    const items = A ? [...(A.activities || []).map((a) => ({ date: a.date, min: a.moving_min || 0, rpe: a.rpe })), ...(A.sessions || []).map((s) => ({ date: s.date, min: s.minutes || 0, rpe: s.rpe }))] : [];
    const W = box.clientWidth || 420, H = 200, m = { t: 22, r: 6, b: 22, l: 40 };
    const end = d3.timeMonday.ceil(today), start = d3.timeMonday.offset(end, -12);
    const weeks = d3.timeMonday.range(start, end);
    const inWeek = (w) => items.filter((a) => d3.timeMonday(dt(a.date)).getTime() === w.getTime());
    const rows = weeks.map((w) => { const xs = inWeek(w); const rated = xs.filter((a) => a.rpe); return { w, load: Math.round(d3.sum(rated, (a) => a.rpe * a.min)), rated: rated.length, all: xs.length }; });
    rows.forEach((r, i) => { const prev = rows.slice(Math.max(0, i - 4), i).filter((p) => p.rated); const avg = prev.length >= 3 ? d3.mean(prev, (p) => p.load) : 0; r.avg = avg; r.flag = avg > 0 && r.load > 1.3 * avg; });
    const ratedTotal = d3.sum(rows, (r) => r.rated), allTotal = d3.sum(rows, (r) => r.all);
    if (!ratedTotal) { box.append(el('div', 'empty', 'No effort ratings yet. Add a line like "rpe 7" to your Strava activities and this fills in after the nightly sync.')); $('#eff-note').textContent = ''; return; }
    const x = d3.scaleBand(weeks, [m.l, W - m.r]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.load) || 100]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r))).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('line').attr('stroke', css('--line')));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickValues(weeks.filter((_, i) => i % 3 === 0)).tickFormat(d3.timeFormat('%b %-d')).tickSize(0)).call((g) => g.select('.domain').remove());
    svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.w)).attr('width', x.bandwidth()).attr('y', (r) => y(r.load)).attr('height', (r) => Math.max(0, y(0) - y(r.load))).attr('rx', 2)
      .style('fill', (r) => (r.flag ? css('--c0') : css('--c1')));
    svg.append('g').selectAll('text').data(rows.filter((r) => r.flag)).join('text').attr('x', (r) => x(r.w) + x.bandwidth() / 2).attr('y', (r) => y(r.load) - 5)
      .attr('text-anchor', 'middle').style('font-size', '11px').style('font-weight', 700).style('fill', css('--c0')).text('▲');
    svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.w) - 2).attr('width', x.bandwidth() + 4).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev, r) => {
        tip.replaceChildren(el('div', 't', `Week of ${d3.timeFormat('%b %-d')(r.w)}`), el('div', 'ln', `Effort load ${r.load.toLocaleString()}`), el('div', 'ln', `${r.rated} of ${r.all} sessions rated`),
          ...(r.avg ? [el('div', 'ln', `4-week average before: ${Math.round(r.avg).toLocaleString()}${r.flag ? ' · big jump' : ''}`)] : []));
        tip.style.display = 'block'; const [px] = d3.pointer(ev, box); tip.style.left = Math.min(px + 12, box.clientWidth - 180) + 'px'; tip.style.top = '8px';
      }).on('pointerleave', () => (tip.style.display = 'none'));
    $('#eff-note').textContent = `${ratedTotal} of ${allTotal} sessions in the last 12 weeks have an effort rating. Unrated sessions aren't counted, so rate them all for a fair comparison.`;
  })();

  // ---------- exercise history ----------
  const pick = $('#hist-pick');
  const keys = [...by.keys()].filter((k) => !MOB.some((m) => m.key === k) && !TESTS.some((t) => t.key === k)).sort((a, b) => by.get(b).length - by.get(a).length);
  const metric = (k) => {
    const list = by.get(k);
    if (list.some((e) => e.load_kg && e.reps)) return { name: 'Estimated 1-rep max', unit: 'kg', f: (e) => (e.load_kg && e.reps ? e1rm(e.load_kg, e.reps) : null) };
    if (list.some((e) => e.added_kg && e.added_kg !== 0)) return { name: 'Added weight', unit: 'lb', f: (e) => (e.added_kg != null ? lb(e.added_kg) : null) };
    if (list.some((e) => e.secs)) return { name: 'Longest hold', unit: 's', f: (e) => e.secs || null };
    return { name: 'Most reps in a set', unit: 'reps', f: (e) => e.reps || null };
  };
  function drawHist(k) {
    const box = $('#hist-chart'); box.querySelectorAll('svg,.empty').forEach((n) => n.remove());
    if (!k) { box.append(el('div', 'empty', 'Log a few sessions and pick an exercise here to see the trend.')); return; }
    const M = metric(k);
    const pts = d3.rollups(by.get(k), (v) => d3.max(v, M.f), (e) => e.date).filter(([, v]) => v != null).map(([d, v]) => ({ d: dt(d), v })).sort((a, b) => a.d - b.d);
    $('#hist-note').textContent = `${M.name} per session (${M.unit}).`;
    const W = box.clientWidth || 420, H = 200, m = { t: 14, r: 10, b: 22, l: 34 };
    const x = pts.length > 1 ? d3.scaleTime(d3.extent(pts, (p) => p.d), [m.l, W - m.r]) : d3.scaleTime([d3.timeDay.offset(pts[0].d, -7), d3.timeDay.offset(pts[0].d, 7)], [m.l, W - m.r]);
    const y = d3.scaleLinear().domain([d3.min(pts, (p) => p.v) > 0 ? d3.min(pts, (p) => p.v) * 0.8 : d3.min(pts, (p) => p.v), d3.max(pts, (p) => p.v) * 1.1 || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r))).call((g) => g.select('.domain').remove()).call((g) => g.selectAll('line').attr('stroke', css('--line')));
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat('%b %-d')).tickSize(0)).call((g) => g.select('.domain').remove());
    svg.append('path').datum(pts).attr('fill', 'none').style('stroke', css('--c0')).attr('stroke-width', 2).attr('d', d3.line((p) => x(p.d), (p) => y(p.v)));
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.d)).attr('cy', (p) => y(p.v)).attr('r', 4).style('fill', css('--c0'))
      .append('title').text((p) => `${d3.timeFormat('%b %-d')(p.d)}: ${Math.round(p.v * 10) / 10} ${M.unit}`);
  }
  if (keys.length) {
    keys.forEach((k) => { const o = el('option', null, by.get(k)[0].name); o.value = k; pick.append(o); });
    pick.addEventListener('change', () => drawHist(pick.value));
    drawHist(keys[0]);
  } else { pick.hidden = true; drawHist(null); }

  $('#copyex').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#logex').textContent); $('#copyex').textContent = 'Copied'; } catch { $('#copyex').textContent = 'Select and copy the box above'; }
  });
})();
