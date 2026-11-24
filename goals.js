/* Wheel Climbs — goals page: Exum Ridge (July) and back to 5.12 (late fall). Reads phases.js + the nightly data files. */
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const get = (u, kind) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r[kind]() : null)).catch(() => null);
  const [A, tickText, S] = await Promise.all([get('aerobic.json', 'json'), get('ticks.csv', 'text'), get('strength.json', 'json')]);
  const DAY = 864e5;
  const dt = (x) => new Date(x + 'T12:00:00');
  const iso = d3.timeFormat('%Y-%m-%d');
  const today = d3.timeDay(new Date());
  const tISO = iso(today);
  const fmt = d3.timeFormat('%b %-d');
  const daysTo = (x) => Math.ceil((dt(x) - today) / DAY);
  const G = WC.goals, phase = WC.phaseOn(tISO);
  const acts = (A && A.activities) || [];
  const ticks = tickText ? d3.csvParse(tickText) : [];
  const BW = (S && S.bodyweight_kg) || 81.2;

  // ---------- countdown ----------
  const left = Math.max(0, daysTo(phase.to));
  const tiles = [
    ['Exum Ridge', `${Math.max(0, daysTo(G.exum.date))} days`, `Target ${d3.timeFormat('%b %Y')(dt(G.exum.date))}`],
    ['Back to 5.12', `${Math.max(0, daysTo(G.g512.date))} days`, `By ${fmt(dt(G.g512.date))}, ${dt(G.g512.date).getFullYear()}`],
    ['Current block', phase.name.split(' · ')[1], `${left} day${left === 1 ? '' : 's'} left · ${phase.name.split(' · ')[0]}`],
  ];
  $('#countdown').replaceChildren(...tiles.map(([l, v, s]) => { const t = el('div', 'tile'); t.append(el('div', 'lab', l), el('div', 'num', v), el('div', 'sub', s)); return t; }));
  $('#lede').textContent = `${daysTo(G.exum.date)} days to the Exum and ${daysTo(G.g512.date)} to the 5.12 deadline. ${phase.focus}`;

  // ---------- timeline ----------
  (function timeline() {
    const box = $('#timeline');
    const W = box.clientWidth || 700, H = 78, m = { l: 6, r: 6 };
    const start = dt('2026-11-01'), end = dt(WC.phases[WC.phases.length - 1].to);
    const x = d3.scaleTime([start, end], [m.l, W - m.r]);
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const TC = { prep: '--c4', base: '--c1', build: '--c2', taper: '--c3', peak: '--c0', recover: '--c4' };
    WC.phases.forEach((p, i) => {
      const a = Math.max(x(dt(p.from)), m.l), b = x(d3.timeDay.offset(dt(p.to), 1));
      if (b <= m.l) return;
      svg.append('rect').attr('x', a).attr('y', 24).attr('width', Math.max(0, b - a - 2)).attr('height', 16).attr('rx', 3)
        .style('fill', `var(${TC[p.type] || '--c4'})`).attr('opacity', p === phase ? 1 : 0.55)
        .append('title').text(`${p.name}: ${fmt(dt(p.from))} – ${fmt(dt(p.to))}`);
    });
    // deload and test weeks
    for (let w = d3.timeMonday.ceil(start); w <= end; w = d3.timeWeek.offset(w, 1)) {
      const info = WC.weekInfo(iso(w));
      if (info.deload) svg.append('rect').attr('x', x(w)).attr('y', 24).attr('width', Math.max(1, x(d3.timeWeek.offset(w, 1)) - x(w) - 1)).attr('height', 16).style('fill', css('--bg')).attr('opacity', 0.55).append('title').text(`Deload week of ${fmt(w)}`);
      if (info.test) svg.append('circle').attr('cx', x(w) + 3).attr('cy', 46).attr('r', 2.5).style('fill', css('--fg')).append('title').text(`Test week of ${fmt(w)}`);
    }
    svg.append('g').attr('transform', `translate(0,${H - 18})`).call(d3.axisBottom(x).ticks(d3.timeMonth.every(W < 500 ? 2 : 1)).tickFormat(d3.timeFormat('%b')).tickSize(0))
      .call((g) => g.select('.domain').remove()).call((g) => g.selectAll('text').style('fill', css('--muted')));
    const mark = (d, label, color, y) => {
      const xx = x(dt(d));
      svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', y + 4).attr('y2', 44).style('stroke', color).attr('stroke-width', 2);
      svg.append('text').attr('x', Math.min(Math.max(xx, 30), W - 30)).attr('y', y).attr('text-anchor', 'middle').style('font-size', '11.5px').style('font-weight', 600).style('fill', color).text(label);
    };
    mark(tISO, 'Today', css('--fg'), 12);
    mark(G.exum.date, '▲ Exum', css('--c0'), 12);
    mark(G.g512.date, '5.12', css('--c0'), 12);
  })();
  $('#type-legend').replaceChildren(...[['prep', '--c4'], ['base', '--c1'], ['build', '--c2'], ['taper', '--c3'], ['peak', '--c0']].map(([t, c]) => { const sp = el('span'); const sw = el('i', 'sw'); sw.style.background = `var(${c})`; sp.append(sw, document.createTextNode(WC.TYPE_LABEL[t])); return sp; }));
  const pl = $('#phase-list');
  WC.phases.filter((p) => p.to >= tISO).forEach((p) => {
    const r = el('div', 'pl-item' + (p === phase ? ' on' : ''));
    const wks = Math.round((dt(p.to) - dt(p.from)) / (7 * DAY) + 1 / 7);
    r.append(el('div', 'pl-when', `${WC.TYPE_LABEL[p.type]} · ${fmt(dt(p.from))} – ${fmt(dt(p.to))} · ${wks} wk`), el('b', null, p.name), el('div', 'pl-focus', p.focus));
    pl.append(r);
  });

  // ---------- scoring helpers ----------
  // fraction of the end target the plan expects by a date, interpolated between anchors
  const ramp = (anchors) => { const pts = anchors.map(([d, f]) => [dt(d).getTime(), f]); const t = today.getTime();
    if (t <= pts[0][0]) return pts[0][1]; if (t >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, fa] = pts[i - 1], [b, fb] = pts[i]; return fa + ((fb - fa) * (t - a)) / (b - a); } };
  function row(list, { label, goal, value, target, frac, show, unit, sub }) {
    const need = target * frac;
    let st = 'not logged', cls = '';
    if (value != null && need < target * 0.02 && !value) st = 'starts soon';
    else if (value != null) {
      if (value >= target) { st = 'done ✓'; cls = ' ok'; }
      else if (value >= need) { st = 'on track'; cls = ' ok'; }
      else if (value >= 0.75 * need) st = 'close';
      else { st = 'behind'; cls = ' due'; }
    }
    const r = el('div', 'tg-row bm-row');
    const bl = el('div', 'bl'); const l = el('span'); l.append(el('b', null, label), el('span', 'bm-goal', goal));
    const rt = el('span', null, value == null ? '—' : show(value)); rt.append(el('span', 'badge' + cls, st));
    bl.append(l, rt);
    const tr = el('div', 'track'); const fl = el('div', 'fillb');
    fl.style.width = `${value == null ? 0 : Math.max(2, Math.min(100, (100 * value) / target))}%`;
    fl.style.background = `var(${cls === ' ok' ? '--ok' : '--c0'})`;
    const tk = el('div', 'tick'); tk.style.left = `${Math.min(100, 100 * frac)}%`; tk.title = 'Where the plan expects you today';
    tr.append(fl, tk);
    r.append(bl, tr, el('div', 'bm-when', `Checkpoint today: ${show(need)}${unit ? '' : ''}${sub ? ' · ' + sub : ''}`));
    list.append(r);
  }
  const since = (n) => iso(d3.timeDay.offset(today, -n));
  const recent = (n) => acts.filter((a) => a.date >= since(n));
  const weeks4 = acts.filter((a) => a.date >= since(28));

  // ---------- Exum ----------
  const exumRamp = [['2026-11-01', 0.3], ['2027-02-28', 0.5], ['2027-04-30', 0.75], ['2027-06-30', 1]];
  const fE = ramp(exumRamp);
  const lng = d3.max(recent(60), (a) => a.elapsed_min || a.moving_min || 0) || null;
  const bigV = d3.max(recent(60), (a) => a.vert_ft || 0) || null;
  const wkV = weeks4.length ? d3.sum(weeks4, (a) => a.vert_ft || 0) / 4 : null;
  const wkH = weeks4.length ? d3.sum(weeks4, (a) => a.moving_min || 0) / 60 / 4 : null;
  const crs = recent(90).filter((a) => a.vert_ft >= 1000 && a.moving_min > 0).map((a) => a.vert_ft / (a.moving_min / 60));
  const cr = crs.length ? d3.max(crs) : null;
  const COLS = (t) => ({ code: +t['Rating Code'] || 0, clean: t.Style === 'Lead' && ['Onsight', 'Flash', 'Redpoint', 'Pinkpoint'].includes(t['Lead Style']) });
  const mp = ticks.filter((t) => t.Date >= '2026-12-01' && /Trad/.test(t['Route Type']) && (+t.Pitches || 1) >= 2 && COLS(t).clean && COLS(t).code >= 1800).length;
  const ex = $('#exum-list');
  const hfmt = (m) => `${Math.floor(m / 60)}h${Math.round(m % 60) ? ' ' + Math.round(m % 60) + 'm' : ''}`;
  row(ex, { label: 'Longest day out', goal: '10 hours (last 60 days)', value: lng, target: 600, frac: fE, show: hfmt });
  row(ex, { label: 'Biggest vert day', goal: '5,000 ft (last 60 days)', value: bigV, target: 5000, frac: fE, show: (v) => `${d3.format(',')(Math.round(v / 10) * 10)} ft` });
  row(ex, { label: 'Weekly vert', goal: '6,000 ft/week (4-week average)', value: wkV, target: 6000, frac: fE, show: (v) => `${d3.format(',')(Math.round(v / 10) * 10)} ft` });
  row(ex, { label: 'Weekly aerobic hours', goal: '6 h/week (4-week average)', value: wkH, target: 6, frac: fE, show: (v) => `${v.toFixed(1)} h` });
  row(ex, { label: 'Climbing rate', goal: '1,200 ft/hr on 1,000+ ft days (last 90 days)', value: cr, target: 1200, frac: fE, show: (v) => `${d3.format(',')(Math.round(v / 10) * 10)} ft/hr` });
  const fMP = ramp([['2026-12-01', 0], ['2027-04-30', 0.4], ['2027-06-30', 1]]);
  row(ex, { label: 'Trad multipitch leads', goal: '8 clean leads, 5.7+, 2+ pitches, since Dec 1', value: mp, target: 8, frac: fMP, show: (v) => `${Math.round(v * 10) / 10}` });
  $('#exum-note').textContent = `${daysTo(G.exum.date)} days out. ${G.exum.note}`;

  // ---------- 5.12 ----------
  const fG = ramp([['2026-12-01', 0.3], ['2027-05-15', 0.6], ['2027-10-01', 1]]);
  const yr = ticks.filter((t) => t.Date >= since(365)).map((t) => ({ ...t, ...COLS(t) })).filter((t) => t.clean);
  const hard = d3.max(yr, (t) => t.code) || null;
  const hardRoute = hard ? yr.find((t) => t.code === hard) : null;
  const ladder = [['2027-02-28', 4600, '5.11a'], ['2027-05-15', 4900, '5.11b'], ['2027-09-30', 5200, '5.11c'], ['2027-11-15', 6600, '5.12a']];
  const passed = ladder.filter(([d]) => d <= tISO).pop(), next = ladder.find(([d]) => d > tISO);
  const codeName = (c) => { const t = ticks.find((x) => +x['Rating Code'] === c); return t ? t.Rating.split(' ')[0] : String(c); };
  const g = $('#g512-list');
  (function gradeRow() {
    const r = el('div', 'tg-row bm-row');
    const bl = el('div', 'bl'); const l = el('span'); l.append(el('b', null, 'Hardest clean lead'), el('span', 'bm-goal', 'Last 12 months · goal 5.12a'));
    const ok = passed ? hard >= passed[1] : true; // no checkpoint has passed yet
    const rt = el('span', null, hard ? `${codeName(hard)}${hardRoute ? ' · ' + hardRoute.Route.split(' aka ')[0] : ''}` : '—');
    rt.append(el('span', 'badge' + (hard >= 6600 ? ' ok' : passed ? (ok ? ' ok' : ' due') : ''), hard >= 6600 ? 'done ✓' : passed ? (ok ? 'on track' : 'behind') : `next: ${next[2]}`));
    bl.append(l, rt);
    const tr = el('div', 'track'); const fl = el('div', 'fillb');
    fl.style.width = `${hard ? Math.max(2, Math.min(100, (100 * (hard - 2600)) / (6600 - 2600))) : 0}%`;
    fl.style.background = `var(${ok ? '--ok' : '--c0'})`;
    tr.append(fl);
    r.append(bl, tr, el('div', 'bm-when', `Checkpoints: ${ladder.map(([d, , n]) => `${n} by ${fmt(dt(d))}`).join(' · ')}${next ? ` · next up: ${next[2]}` : ''}`));
    g.append(r);
  })();
  const fRP = ramp([['2026-12-01', 0], ['2027-05-15', 0.5], ['2027-09-30', 1]]);
  const r511 = ticks.filter((t) => t.Date >= '2026-12-01').map((t) => ({ ...t, ...COLS(t) })).filter((t) => t.clean && t.code >= 4600);
  const uniq511 = new Set(r511.map((t) => t.URL || t.Route)).size;
  row(g, { label: '5.11 clean leads', goal: '12 different routes before project season (since Dec 1)', value: uniq511, target: 12, frac: fRP, show: (v) => `${Math.round(v * 10) / 10}` });
  const E = ((S && S.sessions) || []).flatMap((x) => (x.entries || []).map((e) => ({ ...e, date: x.date })));
  const hangs = E.filter((e) => e.key === 'hang' && (e.secs || 0) >= 10 && (!e.edge_mm || e.edge_mm <= 20));
  const hb = hangs.length ? d3.max(hangs, (e) => e.added_kg || 0) : null;
  row(g, { label: 'Hangboard', goal: `10 s on 20 mm at +${Math.round(0.35 * BW * 2.20462)} lb (strength tab)`, value: hb == null ? null : (BW + hb) / BW - 1, target: 0.35, frac: fG, show: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * BW * 2.20462))} lb` });
  const pu = E.filter((e) => e.key === 'pullup' && e.reps && (e.added_kg || 0) >= -0.5);
  const pr = pu.length ? d3.max(pu, (e) => ((e.added_kg || 0) > 0 ? Math.max(12, (e.added_kg / (0.5 * BW)) * 12) : e.reps)) : null;
  row(g, { label: 'Pull-ups', goal: '12 strict (or the weighted equivalent)', value: pr, target: 12, frac: fG, show: (v) => `${Math.round(v)} reps` });
  const cd = new Set([...ticks.filter((t) => t.Date >= since(28)).map((t) => t.Date), ...((A && A.sessions) || []).filter((s) => s.sport === 'RockClimbing' && s.date >= since(28)).map((s) => s.date)]).size / 4;
  const fCD = ramp([['2026-11-01', 0.67], ['2027-08-01', 0.67], ['2027-09-01', 1]]);
  row(g, { label: 'Climbing days', goal: '3 per week in the fall season (4-week average)', value: cd, target: 3, frac: fCD, show: (v) => `${v.toFixed(1)}/wk` });
  $('#g512-note').textContent = `${daysTo(G.g512.date)} days out. ${G.g512.note}`;
})();
