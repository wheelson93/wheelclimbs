/* Wheel Climbs — static dashboard built from a Mountain Project tick export.
   To update: replace ticks.csv with a fresh MP export (same columns). */
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const fmt = d3.format(',');
  const state = { year: null };
  const listeners = [];
  const onChange = (fn) => { listeners.push(fn); fn(); };
  const setYear = (y) => { state.year = y; listeners.forEach((f) => f()); };

  // ---------- load ----------
  const [tRes, todoRes] = await Promise.all([fetch('ticks.csv'), fetch('todo.json')]);
  const ticks = d3.csvParse(await tRes.text());
  const todo = await todoRes.json();
  const lm = tRes.headers.get('last-modified');
  const routeId = (u) => { const m = String(u || '').match(/route\/(\d+)/); return m ? m[1] : null; };

  // ---------- tidy ----------
  const clean = ticks.map((t, i) => {
    const code = Number(t['Rating Code']);
    const rt = t['Route Type'] || '';
    const type = rt.includes('Boulder') ? 'Boulder' : rt.includes('Ice') ? 'Ice' : rt.startsWith('Trad') ? 'Trad' : rt.startsWith('Sport') ? 'Sport' : 'Other';
    const st = t.Style || '', ls = t['Lead Style'] || '';
    const sent = st === 'Lead' && ['Onsight', 'Flash', 'Redpoint', 'Pinkpoint'].includes(ls);
    const ascent = st === 'Lead' ? (['Onsight', 'Flash'].includes(ls) ? 'Onsight / flash' : ['Redpoint', 'Pinkpoint'].includes(ls) ? 'Redpoint' : ls ? 'Lead, fell or hung' : 'Style not logged')
      : (st === 'TR' || st === 'Follow') ? 'Toprope / follow' : 'Style not logged';
    const roped = (type === 'Sport' || type === 'Trad') && code < 10000;
    const bucket = !roped ? null : code < 2000 ? '5.7 and under' : code < 2300 ? '5.8' : code < 2600 ? '5.9' : code <= 3000 ? '5.10a/b' : code < 3600 ? '5.10c/d' : code <= 5100 ? '5.11a/b' : code < 5600 ? '5.11c/d' : '5.12';
    const parts = (t.Location || '').split(' > ');
    return {
      id: i, date: t.Date, year: Number(String(t.Date).slice(0, 4)), route: t.Route, rating: t.Rating, code,
      type, roped, ascent, sent, bucket, pitches: Number(t.Pitches) || 1,
      area: parts[2] || parts[1] || parts[0] || '', crag: parts[parts.length - 1] || '', url: t.URL, rid: routeId(t.URL),
    };
  });
  const sentRoped = clean.filter((d) => d.roped && d.sent);
  const best = (a) => a.reduce((m, d) => (!m || d.code > m.code ? d : m), null);
  const ys = clean.map((d) => d.year);
  const firstYear = d3.min(ys), lastYear = d3.max(ys);

  // ---------- summary ----------
  const h = best(sentRoped);
  const rb = best(sentRoped.filter((d) => d.year === lastYear));
  const leads = clean.filter((d) => ['Onsight / flash', 'Redpoint', 'Lead, fell or hung'].includes(d.ascent));
  const l12 = sentRoped.filter((d) => d.code >= 5600).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const summary = {
    total: fmt(clean.length), first_year: firstYear, last_year: lastYear,
    hardest: h?.rating, hardest_route: h?.route, hardest_year: h?.year,
    hard_sends: sentRoped.filter((d) => d.code >= 4600).length,
    onsight_pct: leads.length ? Math.round((100 * leads.filter((d) => d.ascent === 'Onsight / flash').length) / leads.length) + '%' : '—',
    latest_n: clean.filter((d) => d.year === lastYear).length,
    recent_best: rb ? `${rb.rating}, ${rb.route}` : '—',
    last12_route: l12?.route, last12_year: l12?.year,
  };
  document.querySelectorAll('[data-f]').forEach((n) => { const v = summary[n.dataset.f]; n.textContent = v != null ? String(v) : '—'; });
  $('#updated').textContent = lm ? new Date(lm).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : (clean[0]?.date || '—');

  // ---------- shared helpers ----------
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const ascents = ['Onsight / flash', 'Redpoint', 'Lead, fell or hung', 'Toprope / follow', 'Style not logged'];
  const aColor = (a) => ['--c0', '--c2', '--c3', '--c1', '--c4'][ascents.indexOf(a)] || '--c4';
  const tip = (box, ev, nodes) => {
    const t = box.querySelector('.tip'); t.replaceChildren(...nodes); t.style.display = 'block';
    const b = box.getBoundingClientRect();
    let x = ev.clientX - b.left + 12, y = ev.clientY - b.top + 12;
    if (x + t.offsetWidth > b.width) x = ev.clientX - b.left - t.offsetWidth - 12;
    if (x < 0) x = 0;
    if (y + t.offsetHeight > b.height) y = Math.max(0, ev.clientY - b.top - t.offsetHeight - 12);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  };
  const hide = (box) => { box.querySelector('.tip').style.display = 'none'; };
  const line = (color, label) => { const l = el('div', 'ln'); if (color) { const s = el('span', 'sw'); s.style.background = `var(${color})`; l.append(s); } l.append(label); return l; };
  const legend = (node, items, round) => node.replaceChildren(...items.map(([c, n]) => { const s = el('span'); const w = el('span', 'sw'); w.style.background = `var(${c})`; if (round) w.style.borderRadius = '50%'; s.append(w, n); return s; }));
  const axisStyle = (g) => { g.selectAll('line').style('stroke', css('--grid')); g.select('.domain').remove(); g.attr('font-size', null).attr('font-family', null); };
  const segment = (id, fn) => document.querySelectorAll(`#${id} button`).forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll(`#${id} button`).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fn(b.dataset.v);
  }));
  const clearSvg = (box) => box.querySelectorAll(':scope > svg').forEach((n) => n.remove());
  const redrawers = [];
  let rw; window.addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => redrawers.forEach((f) => f()), 120); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => redrawers.forEach((f) => f()));

  // ---------- targets ----------
  (function () {
    const tiers = [['5.11a/b', 4600, 5100, 2], ['5.10c/d', 3100, 3500, 4], ['5.10a/b', 2600, 3000, 8]];
    const win = sentRoped.filter((d) => d.date >= '2026-10-01' && d.date <= '2027-02-28');
    const box = $('#target-chart');
    tiers.forEach(([tier, lo, hi, target]) => {
      const r = [...new Set(win.filter((d) => d.code >= lo && d.code <= hi).map((d) => d.route))];
      const row = el('div', 'tg-row'); const bl = el('div', 'bl');
      bl.append(el('span', null, tier), el('span', null, `${r.length} of ${target}${r.length >= target ? ' ✓' : ''}`));
      const pips = el('div', 'pips');
      for (let i = 0; i < Math.max(target, r.length); i++) { const p = el('div', 'pip'); if (i < r.length) p.style.background = r.length >= target ? 'var(--ok)' : 'var(--c0)'; pips.append(p); }
      row.append(bl, pips); if (r.length) row.append(el('div', 'tg-routes', r.join(', '))); box.append(row);
    });
  })();

  // ---------- to-do ----------
  (function () {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const rows = todo.map((t) => {
      const id = routeId(t.url);
      const hits = clean.filter((d) => (id && d.rid === id) || norm(d.route) === norm(t.route) || norm(d.route).startsWith(norm(t.route) + 'aka'));
      return { ...t, status: hits.some((d) => d.sent) ? 'Sent' : hits.length ? 'Tried' : 'To do' };
    });
    let area = 'Clear Creek', disc = 'Sport';
    const box = $('#todo-list'), cnt = $('#todo-count');
    function draw() {
      const r = rows.filter((d) => d.canyon === area && d.discipline === disc).sort((a, b) => a.code - b.code || b.stars - a.stars);
      cnt.textContent = `${r.filter((d) => d.status === 'Sent').length} of ${r.length} sent`;
      box.replaceChildren(...(r.length ? r.map((d) => {
        const safe = /^https?:\/\//.test(d.url || '');
        const row = el(safe ? 'a' : 'div', 'td-row' + (d.status === 'Sent' ? ' sent' : ''));
        if (safe) { row.href = d.url; row.target = '_blank'; row.rel = 'noopener'; }
        const dot = el('div', 'td-dot');
        if (d.status === 'Sent') { dot.style.background = 'var(--c0)'; dot.style.borderColor = 'var(--c0)'; }
        else if (d.status === 'Tried') dot.style.borderColor = 'var(--c3)';
        const main = el('div', 'td-main');
        main.append(el('div', 'td-name', d.route), el('div', 'td-meta', `${d.wall} · ${d.type} · ${d.stars}★${d.status === 'Tried' ? ' · tried' : ''}`));
        row.append(dot, main, el('div', 'td-grade', d.rating));
        return row;
      }) : [el('div', 'empty', 'Nothing on the list here.')]));
    }
    segment('todo-disc', (v) => { disc = v; draw(); });
    segment('todo-area', (v) => { area = v; draw(); });
    draw();
  })();

  // ---------- ticks by year ----------
  (function () {
    const box = $('#year-chart');
    let metric = 'ticks';
    const keys = [['Sport', '--c0', 'Sport'], ['Trad', '--c1', 'Trad'], ['other', '--c4', 'Bouldering & ice']];
    legend($('#year-legend'), keys.map(([, c, n]) => [c, n]));
    const rows = d3.range(firstYear, lastYear + 1).map((y) => {
      const r = clean.filter((d) => d.year === y);
      const o = { year: y };
      keys.forEach(([k]) => {
        const g = r.filter((d) => (k === 'other' ? d.type !== 'Sport' && d.type !== 'Trad' : d.type === k));
        o['ticks_' + k] = g.length; o['pitches_' + k] = d3.sum(g, (d) => d.pitches);
      });
      o.ticks_total = r.length; o.pitches_total = d3.sum(r, (d) => d.pitches);
      return o;
    });
    function draw() {
      clearSvg(box);
      const W = box.clientWidth || 640, H = 260, pre = metric + '_';
      const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
      const y = d3.scaleLinear([0, d3.max(rows, (d) => d[pre + 'total']) || 1], [H - 24, 8]).nice();
      const ml = 34;
      const x = d3.scaleBand(rows.map((d) => d.year), [ml, W - 4]).padding(0.22);
      const ga = svg.append('g').attr('transform', `translate(${ml - 6},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - ml - 2)).tickFormat(fmt));
      axisStyle(ga); ga.selectAll('line').attr('transform', 'translate(6,0)');
      const bw = x.bandwidth(), step = bw < 14 ? 2 : 1, short = bw < 30;
      const gx = svg.append('g').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).tickSize(0).tickFormat((v, i) => (i % step ? '' : short ? "'" + String(v).slice(2) : v)));
      axisStyle(gx); gx.selectAll('text').attr('dy', '1em');
      const stack = d3.stack().keys(keys.map(([k]) => pre + k))(rows);
      stack.forEach((s, i) => svg.append('g').selectAll('rect').data(s).join('rect')
        .attr('x', (d) => x(d.data.year)).attr('width', bw)
        .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1]) - (d[1] > d[0] ? 1 : 0)))
        .attr('rx', Math.min(3, bw / 4)).style('fill', `var(${keys[i][1]})`)
        .attr('opacity', (d) => (state.year && d.data.year !== state.year ? 0.3 : 1)));
      svg.append('g').selectAll('rect').data(rows).join('rect')
        .attr('x', (d) => x(d.year) - (x.step() - bw) / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 22)
        .attr('fill', 'transparent').style('cursor', 'pointer')
        .on('pointermove', (ev, d) => tip(box, ev, [el('div', 't', String(d.year)), ...keys.map(([k, c, n]) => line(c, `${n}: ${fmt(d[pre + k])}`)), line(null, `Total: ${fmt(d[pre + 'total'])}`)]))
        .on('pointerleave', () => hide(box))
        .on('click', (ev, d) => setYear(state.year === d.year ? null : d.year));
    }
    segment('year-metric', (v) => { metric = v; draw(); });
    redrawers.push(draw); onChange(draw);
  })();

  // ---------- progression ----------
  (function () {
    const box = $('#prog-chart'), chip = $('#year-chip');
    chip.addEventListener('click', () => setYear(null));
    legend($('#prog-legend'), ascents.map((a) => [aColor(a), a]), true);
    const G = [['5.2', 1200], ['5.6', 1600], ['5.7', 1800], ['5.8', 2100], ['5.9', 2400], ['5.10a', 2600], ['5.10b', 2900], ['5.10c', 3200], ['5.10d', 3500], ['5.11a', 4600], ['5.11b', 4900], ['5.11c', 5200], ['5.11d', 5500], ['5.12a', 6600], ['5.12b', 6900], ['5.12c', 7200]];
    const gi = d3.scaleLinear(G.map((g) => g[1]), G.map((g, i) => i)).clamp(true);
    const pts = clean.filter((d) => d.roped).map((d) => ({ ...d, dt: new Date(d.date + 'T12:00:00Z') }));
    const by = {}; sentRoped.forEach((d) => { if (!by[d.year] || d.code > by[d.year].code) by[d.year] = d; });
    const maxLine = Object.values(by).sort((a, b) => a.year - b.year).map((d) => ({ ...d, dt: new Date(Date.UTC(d.year, 6, 1)) }));
    function draw() {
      clearSvg(box); hide(box);
      chip.hidden = !state.year; chip.textContent = state.year ? `Showing ${state.year} ×` : '';
      const W = box.clientWidth || 640, H = 340, every = W < 520 ? 2 : 1, ml = 46;
      const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
      const yi = d3.scaleLinear([0, G.length - 1], [H - 26, 10]);
      const ext = d3.extent(pts, (d) => d.dt);
      const x = d3.scaleUtc([d3.utcYear.floor(ext[0]), d3.utcYear.ceil(ext[1])], [ml, W - 8]);
      G.forEach((g, i) => {
        if (i % every && i !== G.length - 1) return;
        svg.append('line').attr('x1', ml).attr('x2', W - 8).attr('y1', yi(i)).attr('y2', yi(i)).style('stroke', css('--grid'));
        svg.append('text').attr('x', ml - 8).attr('y', yi(i)).attr('dy', '0.32em').attr('text-anchor', 'end').text(g[0]);
      });
      const gx = svg.append('g').attr('transform', `translate(0,${H - 22})`).call(d3.axisBottom(x).ticks(W < 520 ? 4 : 8).tickSize(0).tickFormat(d3.utcFormat(W < 520 ? "'%y" : '%Y')));
      axisStyle(gx); gx.selectAll('text').attr('dy', '1em');
      svg.append('path').datum(maxLine).attr('fill', 'none').style('stroke', css('--fg')).attr('stroke-opacity', 0.5).attr('stroke-width', 2).attr('stroke-linejoin', 'round')
        .attr('d', d3.line().x((d) => x(d.dt)).y((d) => yi(gi(d.code))));
      const xy = pts.map((d, i) => [x(d.dt), yi(gi(d.code)) + ((i % 5) - 2) * 1.6]);
      svg.append('g').selectAll('circle').data(pts).join('circle')
        .attr('cx', (d, i) => xy[i][0]).attr('cy', (d, i) => xy[i][1]).attr('r', 4.5)
        .style('fill', (d) => `var(${aColor(d.ascent)})`).attr('fill-opacity', (d) => (state.year && d.year !== state.year ? 0.12 : 0.85))
        .style('stroke', css('--panel')).attr('stroke-width', 1);
      const del = d3.Delaunay.from(xy);
      const ring = svg.append('circle').attr('r', 7).attr('fill', 'none').style('stroke', css('--fg')).attr('stroke-width', 1.5).style('display', 'none');
      const near = (ev) => { const [mx, my] = d3.pointer(ev); const i = del.find(mx, my); return i != null && Math.hypot(xy[i][0] - mx, xy[i][1] - my) <= 30 ? i : null; };
      svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml).attr('height', H - 22).attr('fill', 'transparent')
        .on('pointermove', (ev) => {
          const i = near(ev); if (i == null) { ring.style('display', 'none'); hide(box); return; }
          const d = pts[i]; ring.style('display', null).attr('cx', xy[i][0]).attr('cy', xy[i][1]);
          tip(box, ev, [el('div', 't', d3.utcFormat('%b %-d, %Y')(d.dt)), line(aColor(d.ascent), `${d.route} · ${d.rating}`), line(null, `${d.ascent} · ${d.type}`), line(null, d.crag)]);
        })
        .on('pointerleave', () => { ring.style('display', 'none'); hide(box); })
        .on('click', (ev) => { const i = near(ev); if (i != null) setYear(state.year === pts[i].year ? null : pts[i].year); });
    }
    redrawers.push(draw); onChange(draw);
  })();

  // ---------- pyramid & areas ----------
  const bars = (box, rows, color) => box.replaceChildren(...rows.map(([label, n, of]) => {
    const max = d3.max(rows, (r) => r[2]) || 1;
    const row = el('div', 'bar-row'), bl = el('div', 'bl');
    bl.append(el('span', null, label), el('span', null, `${n} clean of ${of}`));
    const tr = el('div', 'track'); tr.style.width = Math.max(2, (100 * of) / max) + '%';
    const f = el('div', 'fillb'); f.style.background = `var(${color})`; f.style.width = of ? (100 * n) / of + '%' : '0';
    tr.append(f); row.append(bl, tr); return row;
  }));
  (function () {
    const bands = ['5.12', '5.11c/d', '5.11a/b', '5.10c/d', '5.10a/b', '5.9', '5.8', '5.7 and under'];
    const draw = (t) => bars($('#pyr-chart'), bands.map((b) => {
      const r = clean.filter((d) => d.roped && d.bucket === b && (t === 'all' || d.type === t));
      return [b, r.filter((d) => d.sent).length, r.length];
    }), '--c0');
    segment('pyr-type', draw); draw('all');
  })();
  (function () {
    const m = d3.rollups(clean, (v) => [v.filter((d) => d.sent).length, v.length], (d) => d.area).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8);
    bars($('#area-chart'), m.map(([a, [s, n]]) => [a, s, n]), '--c1');
  })();

  // ---------- tick table ----------
  (function () {
    const tb = $('#tick-table tbody'), q = $('#tick-q'), chip = $('#tick-chip'), count = $('#tick-count');
    let key = 'date', dir = -1;
    q.addEventListener('input', draw);
    chip.addEventListener('click', () => setYear(null));
    document.querySelectorAll('#tick-table th button').forEach((b) => b.addEventListener('click', () => {
      if (key === b.dataset.k) dir = -dir; else { key = b.dataset.k; dir = key === 'date' || key === 'code' ? -1 : 1; }
      draw();
    }));
    function draw() {
      chip.hidden = !state.year; chip.textContent = state.year ? `${state.year} ×` : '';
      const s = q.value.trim().toLowerCase();
      const rows = clean.filter((d) => (!state.year || d.year === state.year) && (!s || [d.route, d.rating, d.crag, d.area, d.ascent, d.type, d.date].join(' ').toLowerCase().includes(s)))
        .sort((a, b) => { const va = a[key], vb = b[key]; return (typeof va === 'number' ? (va - vb) : String(va).localeCompare(String(vb))) * dir || (a.date < b.date ? 1 : -1); });
      count.textContent = fmt(rows.length) + ' shown';
      tb.replaceChildren(...rows.map((d) => {
        const tr = document.createElement('tr');
        tr.append(el('td', 'dt', d.date));
        const rt = el('td');
        if (/^https:\/\//.test(d.url || '')) { const a = el('a', null, d.route); a.href = d.url; a.target = '_blank'; a.rel = 'noopener'; rt.append(a); } else rt.textContent = d.route;
        tr.append(rt, el('td', null, d.rating), el('td', null, d.ascent), el('td', 'hide-sm', d.type), el('td', 'hide-sm', d.crag));
        return tr;
      }));
    }
    onChange(draw);
  })();
})();
