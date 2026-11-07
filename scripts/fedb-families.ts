/**
 * Keyword table for the movement family of a base-catalog (free-exercise-db) entry, matched on the English source name.
 * First match wins, so the order matters: specific and unwanted cases come before the general ones. No match is `other`.
 * Olympic lifts, plyometrics, drags, neck, forearm and carry-over odds and ends stay `other` on purpose: a family means
 * "a variant of one familiar movement".
 */
const TABLE: [family: string, pattern: RegExp][] = [
  ['rear-delt', /rear[- ](delt|lateral)|reverse fl|back fl|face pull|pull apart|bent over.*lateral|low-pulley side lateral|row to neck|straight raises on incline/],
  ['other', /jerk|snatch|clean(?! grip)|muscle[- ]up|throw|slam|\bhops?\b|\bbound\b|sprint|skip|\bleap\b|flip|\bstones?\b|\bkeg\b|sandbag|log lift|\btire\b|sledgehammer|battling|climb|upright|turkish|thruster|\bjump(?! squat)|kick(?!back)|\bdrags?\b(?! curl)|wrist|finger|pronation|supination|pinch|hand squeeze|neck (exercise|resistance)|head harness|pullover|external rotation|internal rotation/],
  ['carry', /farmer|yoke walk|\bcarry\b/],
  ['shrug', /shrug/],
  ['hip-thrust', /glute bridge|hip bridge|butt lift|hip lift|hip thrust/],
  ['calf', /\bcalf\b|calves|donkey/],
  ['leg-press', /leg press/],
  ['leg-curl', /leg curl|hamstring curl|glute[- ]ham raise|hamstring slides/],
  ['leg-extension', /leg extension/],
  ['hinge', /deadlift|good mornings?|stiff[- ]legs?|rack pulls?|pull[- ]?through|romanian|kettlebell swing/],
  ['lunge', /lunge|split squat|step[- ]?ups?|bulgarian/],
  ['squat', /squat|sissy/],
  ['overhead-press', /handstand/],
  ['push-up', /push[- ]?ups?|pushups|body-up/],
  ['dip', /\bdips?\b/],
  ['fly', /\bfl(y|ye|yes|ies)\b|cross[- ]?over/],
  ['core', /crunch|sit[- ]?ups?|rollout|knee\/hip raise|hip raise|leg raise|pull-in|leg tucks?|side bend|oblique|twist|wood chop|cable lift|cocoon|plank|windmill|pike|fallout|pallof|bottoms up|butt-ups|elbow to knee|heel touch|jackknife|otis|spell caster|spider crawl|landmine 180/],
  ['triceps', /tricep|skull ?crusher|jm press|tate press|chain handle extension|dip machine/],
  ['curl', /curl/],
  ['incline-press', /incline.*(press|bench(?! pull))/],
  ['bench-press', /bench press|floor press|chest press|neck press|guillotine|board press|pin press|chain press|svend|close-grip.*press|decline.*press|dumbbell bench|bench with/],
  ['lateral-raise', /lateral|crucifix|power partials|deltoid raise|^dumbbell raise/],
  ['overhead-press', /press/],
  ['pulldown', /pull-?down|incline pushdown/],
  ['pull-up', /pull[- ]?ups?|pullup|\bchins?\b/],
  ['row', /\brows?\b|t-bar|shotgun|bench pull/],
];

/** The family id for an English exercise name. */
export function familyFromName(name: string): string {
  const n = name.toLowerCase();
  return TABLE.find(([, re]) => re.test(n))?.[0] ?? 'other';
}
