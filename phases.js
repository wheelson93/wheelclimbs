/* Wheel Climbs — the year plan, shared by the This week, Goals and Climbing pages.
   Two goals: the Exum Ridge on the Grand Teton in July 2027, and back to 5.12 by late fall 2027.
   Edit dates here and every page follows. */
window.WC = {
  goals: {
    exum: { name: 'Exum Ridge, Grand Teton', short: 'Exum', date: '2027-07-24', note: 'Late July (exact date TBD). Stretch: Casual Route on Longs Peak.' },
    g512: { name: 'Back to 5.12', short: '5.12', date: '2027-11-15', note: 'A clean lead of a 5.12a by mid-November, most likely a Clear Creek project.' },
  },
  phases: [
    { key: 'fall', name: 'Fall · own 5.10', from: '2026-09-01', to: '2026-11-30', climbs: 2, aerCap: 300,
      focus: 'Finish Free Willie and rack up 5.10b–d onsights while building an aerobic base.' },
    { key: 'winter', name: 'Winter · strength + base', from: '2026-12-01', to: '2027-02-28', climbs: 3, aerCap: 300,
      focus: 'Limit bouldering and hangboard twice a week, one strength session, steady zone 2 with a weekly long day, and sunny-day 5.11a/b redpoints.' },
    { key: 'spring', name: 'Spring · 5.11 volume + vert', from: '2027-03-01', to: '2027-04-30', climbs: 2, aerCap: 420,
      focus: '5.11a–c redpoints at Clear Creek, power endurance in the gym, and long days with a pack building toward 4,000 ft.' },
    { key: 'alpine', name: 'Early summer · alpine build', from: '2027-05-01', to: '2027-07-10', climbs: 2, aerCap: 660, longShare: 0.6,
      focus: 'Big days in the hills (6–10 h, 4,000–6,000 ft), trad multipitch for speed and efficiency, one sport day a week to hold 5.11.' },
    { key: 'exum', name: 'July · Exum', from: '2027-07-11', to: '2027-07-31', climbs: 2, aerCap: 360, longShare: 0.6,
      focus: 'Taper the week before: shorter days, easy climbing, sleep. Then the Exum Ridge, and Longs if it goes.' },
    { key: 'rebuild', name: 'August · rebuild power', from: '2027-08-01', to: '2027-08-31', climbs: 3, aerCap: 240,
      focus: 'Recover from the alpine season, then back to the hangboard and limit boulders.' },
    { key: 'volume', name: 'September · 5.11 volume', from: '2027-09-01', to: '2027-09-30', climbs: 3, aerCap: 240,
      focus: 'Stack 5.11 redpoints at Clear Creek and pick the 5.12a project.' },
    { key: 'project', name: 'Fall · 5.12a project', from: '2027-10-01', to: '2027-11-30', climbs: 3, aerCap: 180,
      focus: 'One steep, bolt-close Clear Creek 5.12a. Siege it on fresh days, two or three goes max. Aerobic work just maintains.' },
  ],
};
WC.phaseOn = function (isoDate) {
  const ps = WC.phases;
  return ps.find((p) => isoDate >= p.from && isoDate <= p.to) || (isoDate < ps[0].from ? ps[0] : ps[ps.length - 1]);
};
