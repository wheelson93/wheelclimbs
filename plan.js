/* Wheel Climbs — weekly plan. Built in the browser from aerobic.json + ticks.csv. */
(async function () {
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const [D, tickText, AV, ST, RD] = await Promise.all([
    fetch('aerobic.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('ticks.csv', { cache: 'no-cache' }).then((r) => r.text()),
    fetch('availability.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('strength.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('readiness.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
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
  const WK = WC.weekInfo(iso(monday)); // week of phase, deload, test week
  const deload = WK.deload, testWeek = WK.test && WK.phase === phase;
  const volFactor = deload ? 0.6 : phase.type === 'taper' ? 0.6 : phase.type === 'recover' ? 0.7 : 1;

  // ---------- recent load ----------
  const within = (dateStr, from, to) => dateStr >= iso(from) && dateStr < iso(to);
  const fourAgo = d3.timeWeek.offset(monday, -4);
  const aerMin4 = d3.sum(acts.filter((a) => within(a.date, fourAgo, monday)), (a) => a.moving_min || 0) / 4;
  const climbDates = new Set([...sessions.filter((s) => s.sport === 'RockClimbing').map((s) => s.date), ...ticks.map((t) => t.Date)]);
  const climbs4 = [...climbDates].filter((d) => within(d, fourAgo, monday)).length / 4;
  const round15 = (m) => Math.round(m / 15) * 15;
  const aerTarget = round15(Math.min(phase.aerCap || 360, Math.max(90, round15(aerMin4 * 1.2))) * volFactor);
  const midMin = Math.max(40, round15(aerTarget * (1 - (phase.longShare || 0.6))));
  const longMin = Math.max(60, aerTarget - midMin);
  const vertTarget = Math.round((longMin / 60) * 600 / 100) * 100;
  const lastTest = (D.drift_tests || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const testDue = !['taper', 'peak'].includes(phase.type) && (!lastTest || lastTest.protocol !== 'test' || (today - new Date(lastTest.date + 'T12:00:00')) / DAY >= 42);
  const climbTarget = phase.climbs || 2;
  const easeIn = climbs4 < 1;

  // ---------- templates (Mon..Sun) ----------
  const Z2 = (min, extra) => ({ kind: 'aerobic', title: 'Zone 2', detail: `${min} min at ${z2lo}–${z2hi} bpm. Incline walk, stair stepper or easy trail. Walk the hills if HR climbs past ${z2hi}.${extra ? ' ' + extra : ''}`, min });
  const DRIFT = { kind: 'drift', title: 'Drift test', detail: `15 min warm-up, then 60 min at one steady pace starting around ${T.aet} bpm on a flat loop or treadmill at 1%. Name it “Drift test” in Strava and the site scores it overnight.`, min: 75 };
  const LONG = { kind: 'aerobic', title: 'Long day', detail: `${Math.floor(longMin / 60)}h${longMin % 60 ? ' ' + (longMin % 60) + 'm' : ''} hike with ~${vertTarget.toLocaleString()} ft of vert, mostly under ${z2hi} bpm. North Table, Galbraith or Mt Falcon all work close to home.`, min: longMin };
  const REST = (t, det) => ({ kind: 'rest', title: t || 'Rest', detail: det || 'Off, or an easy walk. Good day for mobility (hips, shoulders) and, if fingers feel good, the Abrahangs protocol: 10 min of 10 s hangs across grips at very easy effort, feet on the ground.' });
  // Strength: pick the two areas trained least recently (from strength.json), so the benchmarks move evenly.
  const fingersOnWall = ['prep1', 'base1', 'base2', 'base3', 'build2'].includes(phase.key);
  // Strength-day areas, built from the training app's Conditioning workouts (names match the app).
  // Base phases run 6 × 4 strength sets; build phases switch pulling to 3 × 4 max-strength negatives.
  const buildPhase = ['build1', 'build2'].includes(phase.key);
  const AREAS = {
    pull: [fingersOnWall ? 'pull' : 'fingers + pull', (fingersOnWall ? '' : 'hangboard 6×10 s on 20 mm, ')
      + 'Two Arm Engagement 4 × 10 s to warm up, then '
      + (buildPhase ? 'Negatives – Max Strength 4 × 3 (weighted, 5 s down)' : 'Pull Ups – Strength 4 × 6 (add weight once 6 are easy)')
      + ', Low Row – Strength 4 × 6'],
    push: ['push', 'Press Ups – Strength 4 × 6, Bar Dips – Strength 4 × 6, Face Pulls – Strength 4 × 6 for the shoulders'],
    core: ['core', 'Ab Wheel Roll Out 4 × 10 (kneeling, standing when easy), Hollow Body Hold 4 × 30 s, Copenhagen Plank 4 × 30 s/side'],
    legs: ['legs', 'Goblet Squat – Strength 4 × 6, Kettlebell Swings – Strength 4 × 6, TRX Hamstring Curl 4 × 6'],
  };
  const lastDone = {};
  ((ST && ST.sessions) || []).forEach((x) => (x.entries || []).forEach((e) => { if (AREAS[e.cat] && (!lastDone[e.cat] || x.date > lastDone[e.cat])) lastDone[e.cat] = x.date; }));
  const focus = Object.keys(AREAS).sort((a, b) => (lastDone[a] || '0').localeCompare(lastDone[b] || '0')).slice(0, 2);
  const KB = { kind: 'strength', title: `Strength · ${focus.map((k) => AREAS[k][0]).join(' + ')}${deload ? ' · deload' : ''}`,
    detail: `${deload ? 'Deload: 2 sets of each instead of 3–4, nothing to failure. ' : '~40 min. '}${focus.map((k) => AREAS[k][1].replace(/^./, (c) => c.toUpperCase())).join(". ")}. Finish with Heavy Roller Extensor 3 × 10 for the forearms. Put each exercise on its own line in the Strava description so it counts toward the benchmarks.` };
  // Climbing sessions per phase, named after the Lattice session library. Arrays are [c1, out] or [c1, c2, out].
  // Fingerboard work goes first in a session (before climbing); weights live on the separate strength day.
  const C = (title, detail) => ({ kind: 'climb', title, detail });
  // Hangboard block from fingers.js: tier and sets follow the phase, the week of the block and deloads.
  const FB = WC.fingerText(WC.fingers(phase.key, WK));
  // Strength and power workouts (names match the training app). Base 1 moves from submaximal to max by block.
  const SP = {
    mileage: ['boulder mileage', 'Boulder Mileage: one boulder every 3 min for up to 60 min (20 problems). Pick ones you can flash or send in 2 tries; challenging, never limit.'],
    intervals: ['strength intervals', 'Strength Intervals: 4 sets × 3 hard (not limit) boulders on the Tension, Kilter or gym wall, 5 min between sets. Every rep should go; if one fails twice, swap it.'],
    pyramid: ['boulder pyramid', 'Boulder Pyramid: 15 boulders, 2.5 min rest, climbing up through the grades to your max and back down. Two tries per boulder at most.'],
    board: ['board session', 'Board Session on the Tension or Kilter: 6 sets of 6 min, each on one hard problem with up to 3 tries, 6 min rest between sets.'],
    flash: ['flashing boulders', 'Flashing Boulders: up to 15 problems at your flash grade, one try each after a careful read, 4 min rest. Mix styles and angles.'],
    boardMax: ['board max efforts', 'Board Max Efforts on the Tension or Kilter: 60 min on problems at your absolute limit (multi-session projects welcome), full rest between goes.'],
    boulderMax: ['boulder max efforts', 'Boulder Max Efforts: 60 min on limit gym boulders that look like the project (holds, angle), full rest between goes.'],
  };
  const blk = Math.ceil(WK.weekNo / 4);
  // Aerobic base workouts (names match the training app). All on routes or circuits, never close to failure.
  const AB = {
    arcS: 'ARC Short: 10 min of continuous very easy climbing',
    arcM: 'ARC Medium: 20 min of continuous very easy climbing, no pump',
    arcL: 'ARC Long: 30 min of continuous very easy climbing, no pump',
    fiveThree: '5 On 3 Off: 3 × 5 min very easy climbing, 3 min rest',
    oneTwo: '1 On 2 Off: 10 × 1 min at moderate effort, 2 min rest',
    acMileage: 'AC Boulder Mileage: 20 very easy boulders, about one a minute, smooth and rhythmic',
  };
  // Power endurance workouts (names match the training app).
  const PE = {
    long: 'Long Boulders: one well-rehearsed ~14-move problem, 4 laps × 3 sets, hard, 5 min between sets.',
    ext: 'Extended Boulders: one ~16-move problem, 4 laps × 3 sets, hard, 5 min between sets. You should be fighting by the last lap.',
    pyramid: 'Route Pyramid: 8 routes from easy up to your hardest and back down, 10 min rest. Short on time? Stop at the top.',
    broken: 'Broken 30s: a 30-move route or circuit near your limit, split into three 10-move sections with 20 s rest between them; 4 laps, 6 min between laps.',
    doubles: 'Route Doubles: a hard route, lower off (or a short rest on the wall), then straight back up. 5 doubles, 10 min between.',
    fourx4: '4x4s: 4 boulders back to back with little or no rest, 4 sets, 5 min between sets.',
    ancap: 'AnCap Project: a boulder that copies the project\'s crux section, 6 sets at very hard effort, 5 min rest. Climb each set like a redpoint.',
  };
  const spBase1 = SP[blk === 1 ? 'intervals' : blk === 2 ? 'pyramid' : 'board'];
  const spBuild2 = SP[WK.weekNo % 2 ? 'boardMax' : 'boulderMax'];
  const HB = (sp) => C('Hangboard + ' + sp[0], `${FB} Then ${sp[1]} Plan on 75–90 min including the hangboard.`);
  let climb = {
    fall: [C('Gym routes', easeIn ? '6–8 routes 5.9–5.10c, lead if you can. Focus on clipping rhythm and taking a few practice falls.' : '8–10 routes, 5.10a–5.11a. Lead, onsight style; take a couple of practice falls.'),
           C('Outdoor climbing', 'Free Willie: 2–3 burns max, rested. Fill the day with 5.10b–d onsights (to-do list on the Climbing tab). Gym route volume if the weather is bad.')],
    prep1: [C('Hangboard + boulder mileage', `${FB} Then ${SP.mileage[1].replace('up to 60 min (20 problems)', '40–60 min')} Nothing near max in prep.`),
            C('Route mileage', `${AB.arcL} to start, then 5.9–5.10c leads outside or in the gym with a few practice falls. Stop with energy to spare.`)],
    base1: [HB(spBase1),
            C(blk === 1 ? 'Long boulders' : 'Extended boulders', `${AB.arcS} to warm up. Then ${blk === 1 ? PE.long : PE.ext} Pump yes, failing every lap no. Finish with ${AB.oneTwo}.`),
            C('Sunny-day redpoint', `Clear Creek or the Golden Cliffs: a 5.11a/b redpoint. If it's cold or snowy, gym instead: ${PE.pyramid}`)],
    base2: [HB(SP.flash),
            C('Outdoor 5.11 redpoints', `Clear Creek 5.11a–c. Two routes worked, one sent is a good day. Bad weather, gym instead: ${WK.weekNo % 2 ? PE.broken : PE.doubles}`)],
    build1: [C('Gym routes · hold 5.11', `${FB} Then ${PE.doubles} Keeps sport fitness while the mountain days take over.`),
             C('Trad multipitch', 'Eldo, Lumpy Ridge or Boulder Canyon 5.6–5.8 multipitch. Move fast: quick transitions, simul-climb easy ground, approach shoes on easy pitches. Treat it as Exum practice.')],
    taper1: [C('Easy gym session', `${AB.arcM}, then a few quality moves on 5.9–5.10. Nothing that leaves you sore.`),
             C('Short mountain day', 'An easy alpine half-day or a few easy multipitch pitches. Sleep a lot this week.')],
    peak1: [C('Exum Ridge', 'The objective. Everything else this week is rest, travel, and easy walks.')],
    rec1: [C('Open climbing', `${AB.acMileage}, then whatever sounds fun. Short session, stop fresh.`),
           C('Fun climbing day', 'Easy outdoor routes with friends. No projects, no training.')],
    base3: [HB(SP.intervals),
            C('Extended boulders', `${PE.ext} Pick a harder problem once every lap goes.`),
            C('5.11 redpoints + project scouting', 'Clear Creek 5.11s, and a look at two or three 5.12a candidates: hang the draws, work the crux, note the holds and angle.')],
    build2: [HB(spBuild2),
             (WK.weekNo <= 2 ? C('4x4s', `${PE.fourx4} You should only just get through the last set.`) : C('AnCap project', PE.ancap)),
             C('Project day', 'Work the project: rehearse sections, then 1–2 redpoint burns. Stop while still pulling well.')],
    taper2: [C('Short power session', `${FB} Then a few hard boulders, full rest, under an hour. Leave feeling strong.`),
             C('Project burns (light)', 'Warm up, one or two burns on the project, done.')],
    peak2: [C('Gym bouldering · short', `${FB} Then moves like the project, 45 min max. Quality only.`),
            C('ARC + mobility', `${AB.arcM}, then hips and shoulders. An easy day, not training.`),
            C('Project day', 'Fresh skin, warm up thoroughly, 2–3 good burns on the 5.12a. Stop while still fresh.')],
  };
  climb = climb[phase.key] || climb.fall;
  // Test week: the first hard session becomes the full test session (fresh day, no other hard climbing that day).
  if (testWeek) climb[0] = C('Test session', 'Fresh day, long warm-up with recruitment hangs. 1) Half crimp max hang (app: Half 4 – Hang – Max Test): 7 s on 20 mm, adding weight each go, up to 8 goes with 3 min rest; note the most you held. 2) Front-three open, same protocol, 4–6 goes. 3) 2-rep-max pull-up: up to 8 sets of 2, 3 min rest. 4) 60% repeaters: 60% of your two-arm half-crimp max (bodyweight plus added load), 7 s on / 3 s off until you can\'t hold; count reps (each rep is 10 s, so reps = total time ÷ 10). 5) Side split, once warm. Log each on its own line in Strava: "max hang test half 20mm +45lb", "max hang test f3 20mm +25lb", "2RM pull-up +50lb", "repeater test 24 reps", "side split 150cm".');
  // Deload week: roughly half volume, nothing to failure.
  climb.forEach((c) => (c.hard = c.title === 'Exum Ridge' || !/ARC|Open climbing|Fun climbing|Easy gym/.test(c.title)));
  if (deload) climb = climb.map((c) => c.title === 'Test session' ? c : ({ ...c, title: c.title + ' · deload', detail: `Deload week: if you're feeling run down, swap this for ${AB.fiveThree}. Otherwise about half the usual sets and nothing to failure; stop feeling fresh. ` + c.detail }));
  // ---------- schedule around work (availability.json from the calendar) ----------
  const LONG_ = LONG, TEST = testDue ? DRIFT : Z2(midMin);
  let sessionsWanted = climb.length === 3
    ? [['out', climb[2], climb[2].hard], ['test', TEST, false], ['long', LONG_, false], ['c1', climb[0], climb[0].hard], ['c2', climb[1], climb[1].hard], ['kb', KB, false]]
    : climb.length === 2 ? [['out', climb[1], climb[1].hard], ['test', TEST, false], ['long', LONG_, false], ['c1', climb[0], climb[0].hard], ['kb', KB, false]]
    : [['out', climb[0], true], ['test', TEST, false]];
  if (['taper', 'peak'].includes(phase.type)) sessionsWanted = sessionsWanted.filter(([k]) => k !== 'kb' && (phase.type !== 'peak' || k !== 'long'));
  if (phase.type === 'recover') sessionsWanted = sessionsWanted.filter(([k]) => k !== 'test');
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
  } else {
    // No calendar for this week: a default Tue/Wed/Thu/Fri/Sat/Sun layout of whatever this phase wants.
    const SLOT = { c1: 1, test: 2, kb: 3, c2: 4, out: 5, long: 6 };
    plan = days.map(() => null);
    sessionsWanted.forEach(([k, sess]) => { plan[SLOT[k]] = sess; });
    plan = plan.map((p) => p || REST('Rest / easy'));
    plan[0] = plan[0].kind === 'rest' ? REST() : plan[0];
  }
  const AVLAB = { open: 'Open day', afternoon: 'Afternoon free', evening: 'Evening only', morning: 'Morning only', recover: 'Recovery', none: 'No window' };

  // ---------- Apple Watch readiness (0–10, logged each morning by an iPhone Shortcut) ----------
  const ti = days.findIndex((d) => +d === +today);
  const rToday = RD && RD.days ? RD.days[iso(today)] : null;
  const BAND = (n) => (n >= 8 ? 'Go for it' : n >= 5 ? 'Ready' : n >= 2 ? 'Pace yourself' : 'Recover');
  let readinessNote = null;
  if (rToday != null && ti >= 0) {
    const p = plan[ti], hard = ['climb', 'drift', 'strength'].includes(p.kind) || (p.kind === 'aerobic' && p.min >= 90);
    if (rToday <= 1 && p.kind !== 'rest') {
      plan[ti] = REST('Recover', `Readiness ${rToday}/10. Rest, or a 20–30 min easy walk at most. ${p.title} moves to the next open day if one comes up.`);
      readinessNote = `Today's readiness is ${rToday}/10 (Recover), so ${p.title.toLowerCase()} came off today.`;
    } else if (rToday <= 4 && hard) {
      plan[ti] = p.kind === 'aerobic'
        ? { ...p, title: 'Shorter long day', detail: `Readiness ${rToday}/10. Cut it to about ${Math.round(p.min / 2 / 15) * 15} min, all easy, under ${z2hi} bpm.`, min: Math.round(p.min / 2 / 15) * 15 }
        : { kind: 'aerobic', title: 'Easy day', detail: `Readiness ${rToday}/10 (Pace yourself). 30–40 min easy walk or spin under ${z2lo} bpm plus 15 min of mobility. ${p.title} waits for a better day.`, min: 35 };
      readinessNote = `Today's readiness is ${rToday}/10 (Pace yourself), so ${p.title.toLowerCase()} was swapped for something easy.`;
    } else readinessNote = `Today's readiness is ${rToday}/10 (${BAND(rToday)}), so the plan stands.`;
  }

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
  $('#phase-eyebrow').textContent = `${phase.name} · week ${WK.weekNo} of ${WK.weeks}${deload ? ' · deload' : ''}${testWeek ? ' · test week' : ''}`;
  $('#week-title').textContent = `Week of ${d3.timeFormat('%b %-d')(monday)}`;
  $('#focus').textContent = phase.focus;
  const tile = (l, v, s, ok) => { const t = el('div', 'tile'); t.append(el('div', 'lab', l), el('div', 'num' + (ok ? ' ok' : ''), v), el('div', 'sub', s)); return t; };
  $('#targets').replaceChildren(
    tile('Aerobic', `${Math.round(doneAer)} / ${weekAer} min`, `Mostly ${z2lo}–${z2hi} bpm`, doneAer >= weekAer),
    tile('Climbing days', `${doneClimb} / ${climbTarget}`, climb.map((c) => c.title.split(' · ')[0].split(' + ')[0]).join(', ').slice(0, 48), doneClimb >= climbTarget),
    tile('Strength', `${doneStr} / 1`, focus.map((k) => AREAS[k][0]).join(' + '), doneStr >= 1),
    tile('Long day', doneLong ? 'Done' : `${Math.round(longMin / 6) / 10} h`, `~${vertTarget.toLocaleString()} ft vert`, doneLong),
    tile('Readiness', rToday != null ? `${rToday}/10` : '—', rToday != null ? BAND(rToday) : 'Not logged today', rToday != null && rToday >= 5),
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
  if (deload) why.unshift(`Deload week (week ${WK.weekNo} of ${phase.name.split(' · ')[0]}): the plan runs 3 building weeks then 1 lighter one. Aerobic is about 60% of normal and every session is roughly half volume, so the next block starts fresh.`);
  else if (['base', 'build'].includes(phase.type) && phase.cycle !== 'now') {
    const nextD = Math.ceil(WK.weekNo / 4) * 4;
    why.unshift(nextD > WK.weeks || (WK.weekNo === WK.weeks && ['taper', 'peak'].includes(nextPhase.type))
      ? `Week ${WK.weekNo} of ${WK.weeks} in ${phase.name.split(' · ')[0]}. ${['taper', 'peak'].includes(nextPhase.type) ? 'The taper that follows does the job of a deload.' : 'A new block starts after this one.'}`
      : `Week ${WK.weekNo} of ${WK.weeks} in ${phase.name.split(' · ')[0]}. Blocks run 3 building weeks then a lighter deload week; the next one is week ${nextD}.`);
  }
  if (testWeek) why.unshift('Test week: one session is the full test (half-crimp and front-three max hangs, 2-rep-max pull-up, 60% repeaters, side split). Do it on a rested day; the results set your hangboard loads for the next block and show up on the Strength tab.');
  if (readinessNote) why.unshift(readinessNote);
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
