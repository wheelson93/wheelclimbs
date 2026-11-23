/* Wheel Climbs — the year plan, shared by the This week, Goals and Climbing pages.
   Built on a periodized structure: two training cycles (Exum Ridge in July, then a 5.12 in the fall),
   each running prep → base → build → taper → peak → recover, in 4-week mesocycles of
   3 training weeks + 1 deload week, with a test week every 8–12 weeks.
   Edit dates here and every page follows. Phase dates should start on a Monday. */
window.WC = {
  goals: {
    exum: { name: 'Exum Ridge, Grand Teton', short: 'Exum', date: '2027-07-24', note: 'Late July (exact date TBD). Stretch: Casual Route on Longs Peak.' },
    g512: { name: 'Back to 5.12', short: '5.12', date: '2027-11-15', note: 'A clean lead of a 5.12a by mid-November, most likely a Clear Creek project.' },
  },
  // type: prep | base | build | taper | peak | recover. cycle: which goal the phase serves.
  phases: [
    { key: 'fall', type: 'base', cycle: 'now', name: 'Fall · own 5.10', from: '2026-09-01', to: '2026-11-29', climbs: 2, aerCap: 300,
      focus: 'Finish Free Willie and rack up 5.10b–d onsights while building an aerobic base.' },
    { key: 'prep1', type: 'prep', cycle: 'exum', name: 'Prep · test and ramp up', from: '2026-11-30', to: '2026-12-13', climbs: 2, aerCap: 300,
      focus: 'Get used to the hangboard again with easy density hangs, climb lots of moderate terrain, and run the baseline tests in week 2.' },
    { key: 'base1', type: 'base', cycle: 'exum', name: 'Base 1 · fingers + aerobic base', from: '2026-12-14', to: '2027-03-07', climbs: 3, aerCap: 330,
      focus: 'Max hangs and strength intervals for finger and pulling strength, extended boulders for power endurance, steady zone 2 with a weekly long day.' },
    { key: 'base2', type: 'base', cycle: 'exum', name: 'Base 2 · 5.11 volume + vert', from: '2027-03-08', to: '2027-05-30', climbs: 2, aerCap: 450,
      focus: '5.11 redpoints outside, route endurance (10 on / 10 off), and long days with a pack building toward 4,000 ft.' },
    { key: 'build1', type: 'build', cycle: 'exum', name: 'Build · alpine', from: '2027-05-31', to: '2027-07-11', climbs: 2, aerCap: 660, longShare: 0.6,
      focus: 'Goal-specific: big mountain days (6–10 h, 4,000–6,000 ft), fast trad multipitch, one gym day a week to hold 5.11.' },
    { key: 'taper1', type: 'taper', cycle: 'exum', name: 'Taper · Exum', from: '2027-07-12', to: '2027-07-23', climbs: 2, aerCap: 300, longShare: 0.5,
      focus: 'Cut volume, keep a little intensity, sleep. Short mountain days and easy climbing only.' },
    { key: 'peak1', type: 'peak', cycle: 'exum', name: 'Peak · Exum Ridge', from: '2027-07-24', to: '2027-08-01', climbs: 1, aerCap: 300,
      focus: 'The Exum Ridge on the Grand Teton, and Longs if it goes. No training, just the climbing.' },
    { key: 'rec1', type: 'recover', cycle: 'exum', name: 'Recover', from: '2027-08-02', to: '2027-08-15', climbs: 2, aerCap: 180,
      focus: 'Easy, unstructured climbing and walks. Let the alpine season settle before the next build.' },
    { key: 'base3', type: 'base', cycle: '512', name: 'Base 3 · strength + power endurance', from: '2027-08-16', to: '2027-09-12', climbs: 3, aerCap: 240,
      focus: 'Retest, then max hangs, board or strength intervals and extended boulders. Stack 5.11 redpoints and pick the project.' },
    { key: 'build2', type: 'build', cycle: '512', name: 'Build · route-specific', from: '2027-09-13', to: '2027-10-10', climbs: 3, aerCap: 210,
      focus: 'Train the project\'s style: limit boulders on similar holds and angles, 4×4s and route doubles, burns on the project.' },
    { key: 'taper2', type: 'taper', cycle: '512', name: 'Taper · 5.12', from: '2027-10-11', to: '2027-10-17', climbs: 2, aerCap: 150,
      focus: 'Short, sharp sessions and plenty of rest before the send window.' },
    { key: 'peak2', type: 'peak', cycle: '512', name: 'Peak · 5.12a project', from: '2027-10-18', to: '2027-11-30', climbs: 3, aerCap: 180,
      focus: 'Project days on fresh skin and fingers, two or three good burns each. Gym work only to stay sharp.' },
  ],
  // Mondays of the weeks with the full test session (max hang, 2-rep-max pull-up, 60% repeaters, side split).
  testWeeks: ['2026-12-07', '2027-03-01', '2027-05-24', '2027-08-16'],
};
WC.phaseOn = function (isoDate) {
  const ps = WC.phases;
  return ps.find((p) => isoDate >= p.from && isoDate <= p.to) || (isoDate < ps[0].from ? ps[0] : ps[ps.length - 1]);
};
// Week-level detail: which week of the phase, deload (every 4th week of base/build, unless a taper or peak follows), test week.
WC.weekInfo = function (mondayIso) {
  const p = WC.phaseOn(mondayIso);
  const d = (x) => new Date(x + 'T12:00:00');
  const weekNo = Math.floor((d(mondayIso) - d(p.from)) / (7 * 864e5)) + 1;
  const weeks = Math.round((d(p.to) - d(p.from)) / (7 * 864e5) + 1 / 7);
  const next = WC.phases[WC.phases.indexOf(p) + 1];
  const isLast = weekNo >= weeks;
  const deload = ['base', 'build'].includes(p.type) && p.cycle !== 'now' && weekNo % 4 === 0 && !(isLast && next && ['taper', 'peak'].includes(next.type));
  return { phase: p, weekNo: Math.max(1, weekNo), weeks: Math.max(1, weeks), deload, test: WC.testWeeks.includes(mondayIso) };
};
WC.TYPE_LABEL = { prep: 'Prep', base: 'Base', build: 'Build', taper: 'Taper', peak: 'Peak', recover: 'Recover' };
