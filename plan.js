/* Wheel Climbs — weekly plan. Built in the browser from aerobic.json + ticks.csv. */
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const [D, tickText, AV, ST] = await Promise.all([
    fetch('aerobic.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('ticks.csv', { cache: 'no-cache' }).then((r) => r.text()),
    fetch('availability.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('strength.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const T = D.thresholds;
  const DAY = 864e5;
  const iso = (d) => d3.timeFormat('%Y-%m-%d')(d);
  const today = d3.timeDay(new Date());
  const monday = d3.timeMonday(today);
  const days = d3.range(7).map((i) => d3.timeDay.offset(monday, i));
  const ticks = d3.csvParse(tickText);
  const acts = D.activities || [];
  const sessions = D.sessions || [];
  const z2lo = T.aet - 15, z2hi = T.aet;
  $('#updated').textContent = d3.timeFormat('%b %-d, %Y')(new Date(D.updated + 'T12:00:00'));

  // ---------- phase ----------
  const PHASES = WC.phases;
  const dt = (x) => new Date(x + 'T12:00:00');
  const phase = WC.phaseOn(iso(today));
  const nextPhase = PHASES[PHASES.indexOf(phase) + 1] || phase;

  // ---------- recent load ----------
  const within = (dateStr, from, to) => dateStr >= iso(from) && dateStr < iso(to);
  const fourAgo = d3.timeWeek.offset(monday, -4);
  const aerMin4 = d3.sum(acts.filter((a) => within(a.date, fourAgo, monday)), (a) => a.moving_min || 0) / 4;
  const climbDates = new Set([...sessions.filter((s) => s.sport === 'RockClimbing').map((s) => s.date), ...ticks.map((t) => t.Date)]);
  const climbs4 = [...climbDates].filter((d) => within(d, fourAgo, monday)).length / 4;
  const round15 = (m) => Math.round(m / 15) * 15;
  const aerTarget = Math.min(phase.aerCap || 360, Math.max(90, round15(aerMin4 * 1.2)));
  const midMin = Math.max(40, round15(aerTarget * (1 - (phase.longShare || 0.6))));
  const longMin = Math.max(60, aerTarget - midMin);
  const vertTarget = Math.round((longMin / 60) * 600 / 100) * 100;
  const lastTest = (D.drift_tests || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const testDue = !lastTest || lastTest.protocol !== 'test' || (today - new Date(lastTest.date + 'T12:00:00')) / DAY >= 42;
  const climbTarget = phase.climbs || 2;
  const easeIn = climbs4 < 1;

  // ---------- templates (Mon..Sun) ----------
  const Z2 = (min, extra) => ({ kind: 'aerobic', title: 'Zone 2', detail: `${min} min at ${z2lo}–${z2hi} bpm. Incline walk, stair stepper or easy trail. Walk the hills if HR climbs past ${z2hi}.${extra ? ' ' + extra : ''}`, min });
  const DRIFT = { kind: 'drift', title: 'Drift test', detail: `15 min warm-up, then 60 min at one steady pace starting around ${T.aet} bpm on a flat loop or treadmill at 1%. Name it “Drift test” in Strava and the site scores it overnight.`, min: 75 };
  const LONG = { kind: 'aerobic', title: 'Long day', detail: `${Math.floor(longMin / 60)}h${longMin % 60 ? ' ' + (longMin % 60) + 'm' : ''} hike with ~${vertTarget.toLocaleString()} ft of vert, mostly under ${z2hi} bpm. North Table, Galbraith or Mt Falcon all work close to home.`, min: longMin };
  const REST = (t, det) => ({ kind: 'rest', title: t || 'Rest', detail: det || 'Off, or an easy walk. Good day for mobility: hips, shoulders, fingers.' });
  // Strength: pick the two areas trained least recently (from strength.json), so the benchmarks move evenly.
  const fingersOnWall = ['winter', 'rebuild'].includes(phase.key);
  const AREAS = {
    pull: ['fingers + pull', fingersOnWall ? 'weighted pull-ups 4×3–5 (or 3×max strict), ring rows 3×10' : 'hangboard 6×10 s on 20 mm, weighted pull-ups 4×3–5'],
    push: ['push', 'ring dips 3×max, KB overhead press 3×5/arm, push-ups 2×max'],
    core: ['core', 'L-sit 4×max hold, ab wheel 3×8–10, side plank 2×45 s/side, back extension 2×60 s'],
    legs: ['legs', 'cossack squat 3×8/side, single-leg RDL 3×8/side, ham curl 3×12–15, pistol 3×3–5/leg'],
  };
  const lastDone = {};
  ((ST && ST.sessions) || []).forEach((x) => (x.entries || []).forEach((e) => { if (AREAS[e.cat] && (!lastDone[e.cat] || x.date > lastDone[e.cat])) lastDone[e.cat] = x.date; }));
  const focus = Object.keys(AREAS).sort((a, b) => (lastDone[a] || '0').localeCompare(lastDone[b] || '0')).slice(0, 2);
  const KB = { kind: 'strength', title: `Strength · ${focus.map((k) => AREAS[k][0]).join(' + ')}`,
    detail: `~40 min. ${focus.map((k) => AREAS[k][1].replace(/^./, (c) => c.toUpperCase())).join(". ")}. Put each exercise on its own line in the Strava description so it counts toward the benchmarks.` };
  let climb = {
    fall: [{ kind: 'climb', title: 'Gym routes', detail: easeIn ? '6–8 routes 5.9–5.10c, lead if you can. Focus on clipping rhythm and taking a few practice falls.' : '8–10 routes, 5.10a–5.11a. Lead, onsight style; take a couple of practice falls.' },
           { kind: 'climb', title: 'Outdoor climbing', detail: 'Free Willie: 2–3 burns max, rested. Fill the day with 5.10b–d onsights (to-do list on the Climbing tab). Gym route volume if the weather is bad.' }],
    winter: [{ kind: 'climb', title: 'Limit bouldering + hangboard', detail: 'Warm up well, then 4–6 problems near your max with full 3–4 min rests. Finish with hangboard: 6 × 10 s on a 20 mm edge, 3 min rest.' },
             { kind: 'climb', title: 'Limit bouldering', detail: 'Same as Tuesday but stop when the quality drops. Skip it if fingers are sore.' },
             { kind: 'climb', title: 'Sunny-day redpoint', detail: 'Clear Creek or Golden Cliffs: a 5.11a/b redpoint. Gym routes (5.10+ to 5.11) if it is cold or snowy.' }],
    spring: [{ kind: 'climb', title: 'Gym routes · power endurance', detail: '4×4s on 5.10 routes, or 3 laps on a hard 5.11 with 5 min rest.' },
             { kind: 'climb', title: 'Outdoor 5.11 redpoints', detail: 'Clear Creek 5.11a–c. Two routes worked, one sent is a good day.' }],
    alpine: [{ kind: 'climb', title: 'Gym routes · hold 5.11', detail: '8–10 routes 5.10c–5.11b, plus a few 4×4s. Keeps the sport fitness while the mountain days take over.' },
             { kind: 'climb', title: 'Trad multipitch', detail: 'Eldo, Lumpy Ridge or Boulder Canyon 5.6–5.8 multipitch. Move fast: quick transitions, simul-climb easy ground, approach shoes on easy pitches. Treat it as Exum practice.' }],
    exum: [{ kind: 'climb', title: 'Easy gym session', detail: 'Short and easy, 5.9–5.10. Stay loose; nothing that leaves you sore.' },
           { kind: 'climb', title: 'Mountain day', detail: 'Exum, or an easy alpine warm-up in the week before. In the last 7 days keep everything short and sleep a lot.' }],
    project: [{ kind: 'climb', title: 'Gym bouldering', detail: 'Moves like the project: steep pulls, crimps. Short, high quality.' },
              { kind: 'climb', title: 'Project day', detail: 'Warm up thoroughly, then 2–3 burns on the 5.12a. Rest and stop while still fresh.' }],
  };
  climb.rebuild = climb.winter;
  climb.volume = climb.spring;
  climb = climb[phase.key] || climb.fall;
  // ---------- schedule around work (availability.json from the calendar) ----------
  const LONG_ = LONG, TEST = testDue ? DRIFT : Z2(midMin);
  const sessionsWanted = climb.length === 3
    ? [['out', climb[2], true], ['test', TEST, false], ['long', LONG_, false], ['c1', climb[0], true], ['c2', climb[1], true], ['kb', KB, false]]
    : [['out', climb[1], true], ['test', TEST, false], ['long', LONG_, false], ['c1', climb[0], true], ['kb', KB, false]];
  // how well each session fits each kind of day (0 = not allowed)
  const FIT = {
    out:  { open: 10, afternoon: 4 },
    long: { open: 9, afternoon: 6 },
    test: { open: 8, morning: 9, afternoon: 7, evening: 3 },
    c1:   { evening: 8, afternoon: 8, open: 6, morning: 4 },
    c2:   { evening: 8, afternoon: 8, open: 6, morning: 4 },
    kb:   { evening: 9, afternoon: 7, open: 5, morning: 6 },
  };
  const avail = days.map((d) => (AV && AV.days && AV.days[iso(d)]) || (AV && iso(d) <= AV.through ? 'open' : null));
  const known = avail.every((a) => a);
  let plan, unplaced = [];
  if (known) {
    plan = days.map((d, i) => (avail[i] === 'recover' ? REST('Recovery', 'Sleep first. If you feel good later, a 20–30 min easy walk is plenty; no training.') : avail[i] === 'none' ? REST('No training window', 'Long day at work. Nothing planned.') : null));
    const hardOn = new Set();
    for (const [key, sess, hard] of sessionsWanted) {
      let best = -1, bestScore = 0;
      days.forEach((d, i) => {
        if (plan[i]) return;
        if (d < today) return;
        let sc = FIT[key][avail[i]] || 0;
        if (!sc) return;
        if (hard && (hardOn.has(i - 1) || hardOn.has(i + 1))) return;
        if (key === 'long' && hardOn.has(i - 1)) sc -= 2;
        if (sc > bestScore) { bestScore = sc; best = i; }
      });
      if (best >= 0) { plan[best] = sess; if (hard) hardOn.add(best); }
      else unplaced.push(sess.title);
    }
    plan = plan.map((p, i) => p || REST(avail[i] === 'evening' ? 'Rest (work day)' : 'Rest / easy'));
  } else if (climb.length === 3) plan = [REST(), climb[0], TEST, KB, climb[1], climb[2], LONG];
  else plan = [REST(), climb[0], TEST, KB, REST('Rest / easy'), climb[1], LONG];
  const AVLAB = { open: 'Open day', afternoon: 'Afternoon free', evening: 'Evening only', morning: 'Morning only', recover: 'Recovery', none: 'No window' };

  const weekAer = d3.sum(plan, (p) => (p.kind === 'aerobic' || p.kind === 'drift' ? p.min : 0));

  // ---------- what actually happened this week ----------
  const onDay = (d) => {
    const s = iso(d);
    return {
      aerobic: acts.filter((a) => a.date === s),
      drift: acts.filter((a) => a.date === s && /drift/i.test(a.name)),
      climb: [...sessions.filter((x) => x.date === s && x.sport === 'RockClimbing'), ...ticks.filter((t) => t.Date === s).slice(0, 1)],
      strength: sessions.filter((x) => x.date === s && x.sport !== 'RockClimbing'),
    };
  };
  const weekActs = days.map(onDay);
  const doneAer = d3.sum(weekActs, (w) => d3.sum(w.aerobic, (a) => a.moving_min || a.elapsed_min || 0));
  const doneClimb = weekActs.filter((w) => w.climb.length).length;
  const doneStr = weekActs.filter((w) => w.strength.length).length;
  const doneLong = weekActs.some((w) => w.aerobic.some((a) => (a.moving_min || 0) >= longMin * 0.8));

  // ---------- header + tiles ----------
  $('#phase-eyebrow').textContent = phase.name;
  $('#week-title').textContent = `Week of ${d3.timeFormat('%b %-d')(monday)}`;
  $('#focus').textContent = phase.focus;
  const tile = (l, v, s, ok) => { const t = el('div', 'tile'); t.append(el('div', 'lab', l), el('div', 'num' + (ok ? ' ok' : ''), v), el('div', 'sub', s)); return t; };
  $('#targets').replaceChildren(
    tile('Aerobic', `${Math.round(doneAer)} / ${weekAer} min`, `Mostly ${z2lo}–${z2hi} bpm`, doneAer >= weekAer),
    tile('Climbing days', `${doneClimb} / ${climbTarget}`, climb.length === 3 ? 'Limit bouldering + rock' : 'Gym + outdoor', doneClimb >= climbTarget),
    tile('Strength', `${doneStr} / 1`, focus.map((k) => AREAS[k][0]).join(' + '), doneStr >= 1),
    tile('Long day', doneLong ? 'Done' : `${Math.round(longMin / 6) / 10} h`, `~${vertTarget.toLocaleString()} ft vert`, doneLong),
    tile(testDue ? 'Drift test' : 'Next drift test', testDue ? 'Due' : d3.timeFormat('%b %-d')(new Date(new Date(lastTest.date + 'T12:00:00').getTime() + 42 * DAY)), testDue ? 'Wednesday slot' : 'Every 6 weeks', false),
  );

  // ---------- day list ----------
  const list = $('#day-list');
  days.forEach((d, i) => {
    const p = plan[i], w = weekActs[i];
    const hit = p.kind === 'rest' ? null : (w[p.kind] || []).length ? w[p.kind] : p.kind === 'drift' && w.aerobic.length ? w.aerobic : null;
    const anyOther = !hit && p.kind !== 'rest' && (w.aerobic.length || w.climb.length || w.strength.length);
    const status = hit ? 'done' : +d === +today ? 'today' : d < today ? (p.kind === 'rest' ? 'rest' : anyOther ? 'swapped' : 'missed') : 'up';
    const row = el('div', 'pl-row ' + status + (p.kind === 'rest' ? ' is-rest' : ''));
    const left = el('div', 'pl-day'); left.append(el('div', 'dn', d3.timeFormat('%a')(d)), el('div', 'dd', d3.timeFormat('%-d')(d)));
    if (known) left.append(el('div', 'av av-' + avail[i], AVLAB[avail[i]]));
    const main = el('div', 'pl-main');
    const h = el('div', 'pl-title'); h.append(el('span', 'k k-' + p.kind), document.createTextNode(p.title));
    main.append(h, el('div', 'pl-detail', p.detail));
    const logged = [...w.aerobic, ...w.climb, ...w.strength];
    if (logged.length) main.append(el('div', 'pl-log', 'Logged: ' + logged.map((a) => (a.name || a.Route) + (a.moving_min ? ` (${Math.round(a.moving_min)} min)` : a.minutes ? ` (${Math.round(a.minutes)} min)` : '')).join(' · ')));
    const badge = { done: '✓ done', today: 'today', missed: 'missed', swapped: 'swapped', rest: '', up: '' }[status];
    const r = el('div', 'pl-status'); if (badge) r.append(el('span', 'badge ' + (status === 'done' ? 'ok' : status === 'today' ? 'due' : ''), badge));
    row.append(left, main, r); list.append(row);
  });

  // ---------- why ----------
  const why = [
    `Aerobic target is ${weekAer} min${testDue ? ' (the drift test adds to the usual ' + aerTarget + ')' : ''}: your last 4 weeks averaged ${Math.round(aerMin4)} min/week. The plan adds about 20% (with a 90-min floor) so the base grows without a jump that leaves you flat for climbing.`,
    `Zone 2 is capped at ${z2hi} bpm, your estimated aerobic threshold. Most of your recent runs sat in the gray zone above it, so slow down here; this is where the base gets built.`,
    testDue ? `Wednesday is a drift test, not ordinary zone 2: your last check was ${lastTest ? (lastTest.protocol === 'test' ? 'over 6 weeks ago' : 'an informal run in ' + d3.timeFormat('%B')(new Date(lastTest.date + 'T12:00:00'))) : 'never'}, and a measured threshold makes every zone on this page accurate.` : `No drift test this week; the next one is 6 weeks after the last.`,
    easeIn ? `Climbing has been light (${climbs4.toFixed(1)} days/week lately), so the gym day is a volume-and-falling session rather than a max effort.` : `You've been climbing about ${climbs4.toFixed(1)} days/week, so the plan holds two quality days with rest between.`,
    (dt(phase.to) - today) / DAY < 10 && nextPhase !== phase ? `This is the last stretch of ${phase.name.split(' · ')[1]}. ${nextPhase.name} starts ${d3.timeFormat('%b %-d')(dt(nextPhase.from))}.` : `Next phase: ${nextPhase.name}, from ${d3.timeFormat('%b %-d')(dt(nextPhase.from))}. Goals: ${WC.goals.exum.short} in July, ${WC.goals.g512.short} by mid-November.`,
  ];
  if (known) why.unshift(`Scheduled around your work calendar: ${avail.filter((a) => a === 'open').length} open day${avail.filter((a) => a === 'open').length === 1 ? '' : 's'} this week, so ${unplaced.length ? 'some sessions didn\'t fit: ' + unplaced.join(', ') + '. Do them if a day opens up, or let them go; the week still counts' : 'everything fits'}. Nothing lands on a recovery day, and hard climbing days aren't back to back.`);
  else why.unshift('No work schedule loaded for this week yet, so this is the default layout. Move sessions around shifts as needed.');
  $('#why-list').replaceChildren(...why.map((t) => el('li', null, t)));

  // ---------- phase strip ----------
  const strip = el('div', 'phases-strip');
  PHASES.filter((p) => p.to >= iso(today)).forEach((p) => {
    const s = el('div', 'ph' + (p === phase ? ' on' : ''));
    s.append(el('div', 'pn', p.name.split(' · ')[1]), el('div', 'pd', p.name.split(' · ')[0]));
    strip.append(s);
  });
  $('#phase-strip').replaceChildren(strip);
})();
