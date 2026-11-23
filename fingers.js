/* Wheel Climbs — hangboard prescriptions for each phase and week.
   Hangboard only (no lifts) so the shoulders stay engaged. Half crimp is the main grip, front-three open
   drag the second; both use the same hang lengths, effort and 3 min rest between sets.
   Session names match the workouts in the training app, so they can be run from its timer. */
WC.FB = {
  tiers: {
    foundation: { s: 30, name: 'Foundation', eff: 'moderate: finish each hang with about 10 s to spare' },
    strength:   { s: 10, name: 'Strength',   eff: 'hard: you could hold about 3 s longer' },
    max:        { s: 7,  name: 'Max',        eff: 'hard: 1–2 s left in the tank' },
    peak:       { s: 5,  name: 'Peak',       eff: 'maximal: nothing left at 5 s' },
    easy:       { s: 7,  name: 'Easy',       eff: 'easy, about 5/10' },
  },
};
// Which tier this week, and how many sets of each grip. Strength (10 s) → Max (7 s) → Peak (5 s) through the year;
// deload weeks and maintenance phases drop to Easy.
WC.fingers = function (phaseKey, wk) {
  const block = Math.ceil(wk.weekNo / 4);
  if (wk.deload) return { tier: 'easy', half: 6, f3: 4 };
  switch (phaseKey) {
    case 'prep1': return { tier: 'foundation', half: 6, f3: 4, f3tier: 'easy' };
    case 'base1': return block === 1 ? { tier: 'strength', half: 5, f3: 3 } : { tier: 'max', half: 5, f3: 3 };
    case 'base2': return { tier: 'max', half: 4, f3: 2 };
    case 'build1': return { tier: 'easy', half: 6, f3: 4 };
    case 'base3': return { tier: 'strength', half: 5, f3: 3 };
    case 'build2': return wk.weekNo <= 2 ? { tier: 'max', half: 5, f3: 3 } : { tier: 'peak', half: 4, f3: 4 };
    case 'taper2': case 'peak2': return { tier: 'easy', half: 4, f3: 2 };
    default: return null;
  }
};
// One line of plain text for the session card.
WC.fingerText = function (f) {
  if (!f) return '';
  const T = WC.FB.tiers, t = T[f.tier], t3 = T[f.f3tier || f.tier];
  const warm = ['easy', 'foundation'].includes(f.tier) ? '' : 'Recruitment hangs to warm up (half crimp 5 s × 6, building from very easy to challenging, 2 min rest). ';
  const app = `Half 4 – Hang – ${t.name}` + (f.f3 ? `, F3 Open – Hang – ${t3.name}` : '');
  const sets = `half crimp ${f.half} × ${t.s} s${f.f3 ? `, then front-three open ${f.f3} × ${t3.s} s${f.f3tier ? ' easy' : ''}` : ''}`;
  return `Hangboard first (${app}). ${warm}${sets[0].toUpperCase() + sets.slice(1)} on 20 mm, 3 min rest, ${t.eff}. `
    + `Log: “half crimp hang 20mm +Xlb ${f.half}x${t.s}s”${f.f3 ? ` and “f3 open hang 20mm +Xlb ${f.f3}x${t3.s}s”` : ''}.`;
};
