/**
 * Own exercise list. Structurally an ExerciseTemplate plus the exact English Hevy title; src/shared must not import from src/coach.
 * `aliases` are further exact titles under which the very same exercise (same movement, same equipment) is logged.
 */
/** An open question about a logged title: is it the same as an existing exercise, or a new one? Not an exercise yet. */
export type ExerciseProposal = { forTitle: string; kind: 'same' | 'new'; targetId?: string; reason: string; atMs: number };

export type Exercise = {
  id: string; title: string; type: string; primaryMuscle: string; equipment: string; hevyTitle?: string; aliases?: string[];
  secondaryMuscles?: string[];
  /** German, own text. */
  description?: string;
  /** Set to 'own' when the description comes from a user overlay record, so a base entry does not carry the base-catalog credit. */
  descriptionSource?: 'own';
  source?: 'pandafit' | 'fedb' | 'ai' | 'user';
  fedbId?: string;
  /** The base catalog's English instructions, kept as source for the German guides (fedb-descriptions-de.json); never shown. */
  instructionsEn?: string[];
  proposal?: ExerciseProposal;
};

const x = (id: string, title: string, type: string, primaryMuscle: string, equipment: string, hevyTitle?: string, aliases?: string[]): Exercise =>
  ({ id, title, type, primaryMuscle, equipment, ...(hevyTitle ? { hevyTitle } : {}), ...(aliases ? { aliases } : {}) });

/** hevyTitle is the exact English Hevy name that linkHevyTemplates matches on. */
export const EXERCISES: Exercise[] = [
  x('pf-squat', 'Kniebeuge', 'weight_reps', 'quadriceps', 'barbell', 'Squat (Barbell)'),
  x('pf-front-squat', 'Frontkniebeuge', 'weight_reps', 'quadriceps', 'barbell', 'Front Squat'),
  x('pf-goblet-squat', 'Goblet-Kniebeuge', 'weight_reps', 'quadriceps', 'dumbbell', 'Goblet Squat'),
  x('pf-bulgarian-split-squat', 'Bulgarische Kniebeuge', 'weight_reps', 'quadriceps', 'dumbbell', 'Bulgarian Split Squat (Dumbbell)'),
  x('pf-split-squat', 'Ausfallschritt statisch', 'weight_reps', 'quadriceps', 'dumbbell', 'Split Squat (Dumbbell)'),
  x('pf-lunge', 'Ausfallschritt', 'weight_reps', 'quadriceps', 'dumbbell', 'Lunge (Dumbbell)'),
  x('pf-walking-lunge', 'Gehender Ausfallschritt', 'weight_reps', 'quadriceps', 'dumbbell', 'Walking Lunge (Dumbbell)'),
  x('pf-reverse-lunge', 'Rückwärts-Ausfallschritt', 'weight_reps', 'quadriceps', 'dumbbell', 'Reverse Lunge (Dumbbell)'),
  x('pf-step-up', 'Step-up', 'weight_reps', 'quadriceps', 'dumbbell', 'Dumbbell Step Up'),
  x('pf-leg-press', 'Beinpresse', 'weight_reps', 'quadriceps', 'machine', 'Leg Press (Machine)'),
  x('pf-hack-squat', 'Hackenschmidt-Kniebeuge', 'weight_reps', 'quadriceps', 'machine', 'Hack Squat (Machine)'),
  x('pf-leg-extension', 'Beinstrecker', 'weight_reps', 'quadriceps', 'machine', 'Leg Extension (Machine)'),
  x('pf-leg-curl-lying', 'Beinbeuger liegend', 'weight_reps', 'hamstrings', 'machine', 'Lying Leg Curl (Machine)'),
  x('pf-leg-curl-seated', 'Beinbeuger sitzend', 'weight_reps', 'hamstrings', 'machine', 'Seated Leg Curl (Machine)'),
  x('pf-deadlift', 'Kreuzheben', 'weight_reps', 'lower_back', 'barbell', 'Deadlift (Barbell)'),
  x('pf-romanian-deadlift', 'Rumänisches Kreuzheben', 'weight_reps', 'hamstrings', 'barbell', 'Romanian Deadlift (Barbell)'),
  x('pf-rdl-dumbbell', 'Rumänisches Kreuzheben mit Kurzhanteln', 'weight_reps', 'hamstrings', 'dumbbell', 'Romanian Deadlift (Dumbbell)'),
  x('pf-single-leg-rdl', 'Einbeiniges Kreuzheben', 'weight_reps', 'hamstrings', 'dumbbell', 'Single Leg Romanian Deadlift (Dumbbell)'),
  x('pf-sumo-deadlift', 'Sumo-Kreuzheben', 'weight_reps', 'glutes', 'barbell', 'Sumo Deadlift'),
  x('pf-trap-bar-deadlift', 'Kreuzheben mit Trap-Bar', 'weight_reps', 'quadriceps', 'other', 'Deadlift (Trap bar)'),
  x('pf-good-morning', 'Good Morning', 'weight_reps', 'hamstrings', 'barbell', 'Good Morning (Barbell)'),
  x('pf-hip-thrust', 'Hip Thrust', 'weight_reps', 'glutes', 'barbell', 'Hip Thrust (Barbell)'),
  x('pf-glute-bridge', 'Beckenheben', 'weight_reps', 'glutes', 'barbell', 'Glute Bridge (Barbell)'),
  x('pf-glute-bridge-bw', 'Beckenheben ohne Gewicht', 'reps_only', 'glutes', 'none', 'Glute Bridge'),
  x('pf-cable-kickback', 'Gesäß-Kickback am Kabel', 'weight_reps', 'glutes', 'machine', 'Standing Cable Glute Kickbacks'),
  x('pf-hip-abduction', 'Abduktorenmaschine', 'weight_reps', 'abductors', 'machine', 'Hip Abduction (Machine)'),
  x('pf-hip-adduction', 'Adduktorenmaschine', 'weight_reps', 'adductors', 'machine', 'Hip Adduction (Machine)'),
  x('pf-calf-raise-standing', 'Wadenheben stehend', 'weight_reps', 'calves', 'machine', 'Standing Calf Raise (Machine)'),
  x('pf-calf-raise-seated', 'Wadenheben sitzend', 'weight_reps', 'calves', 'machine', 'Seated Calf Raise'),
  x('pf-calf-raise-bw', 'Wadenheben ohne Gewicht', 'reps_only', 'calves', 'none', 'Standing Calf Raise'),
  x('pf-bench-press', 'Bankdrücken', 'weight_reps', 'chest', 'barbell', 'Bench Press (Barbell)'),
  x('pf-incline-bench-press', 'Schrägbankdrücken', 'weight_reps', 'chest', 'barbell', 'Incline Bench Press (Barbell)'),
  x('pf-bench-press-db', 'Bankdrücken mit Kurzhanteln', 'weight_reps', 'chest', 'dumbbell', 'Bench Press (Dumbbell)'),
  x('pf-incline-press-db', 'Schrägbankdrücken mit Kurzhanteln', 'weight_reps', 'chest', 'dumbbell', 'Incline Bench Press (Dumbbell)'),
  x('pf-chest-press-machine', 'Brustpresse', 'weight_reps', 'chest', 'machine', 'Chest Press (Machine)'),
  x('pf-chest-fly-db', 'Fliegende mit Kurzhanteln', 'weight_reps', 'chest', 'dumbbell', 'Chest Fly (Dumbbell)'),
  x('pf-pec-deck', 'Butterfly', 'weight_reps', 'chest', 'machine', 'Butterfly (Pec Deck)'),
  x('pf-cable-crossover', 'Kabelzug Crossover', 'weight_reps', 'chest', 'machine', 'Cable Fly Crossovers'),
  x('pf-push-up', 'Liegestütze', 'reps_only', 'chest', 'none', 'Push Up'),
  x('pf-push-up-knee', 'Liegestütze auf den Knien', 'reps_only', 'chest', 'none', 'Kneeling Push Up'),
  x('pf-push-up-weighted', 'Liegestütze mit Gewicht', 'bodyweight_weighted', 'chest', 'other', 'Push Up (Weighted)'),
  x('pf-dip', 'Dips', 'reps_only', 'triceps', 'none', 'Triceps Dip', ['Dip']),
  x('pf-dip-weighted', 'Dips mit Zusatzgewicht', 'bodyweight_weighted', 'chest', 'other', 'Chest Dip (Weighted)'),
  x('pf-dip-assisted', 'Dips mit Unterstützung', 'bodyweight_assisted', 'chest', 'machine', 'Chest Dip (Assisted)'),
  x('pf-overhead-press', 'Schulterdrücken mit der Langhantel', 'weight_reps', 'shoulders', 'barbell', 'Overhead Press (Barbell)'),
  x('pf-shoulder-press-db', 'Schulterdrücken mit Kurzhanteln', 'weight_reps', 'shoulders', 'dumbbell', 'Shoulder Press (Dumbbell)'),
  x('pf-shoulder-press-machine', 'Schulterpresse', 'weight_reps', 'shoulders', 'machine', 'Shoulder Press (Machine Plates)'),
  x('pf-arnold-press', 'Arnold-Drücken', 'weight_reps', 'shoulders', 'dumbbell', 'Arnold Press (Dumbbell)'),
  x('pf-lateral-raise', 'Seitheben', 'weight_reps', 'shoulders', 'dumbbell', 'Lateral Raise (Dumbbell)'),
  x('pf-lateral-raise-cable', 'Seitheben am Kabel', 'weight_reps', 'shoulders', 'machine', 'Lateral Raise (Cable)'),
  x('pf-front-raise', 'Frontheben', 'weight_reps', 'shoulders', 'dumbbell', 'Front Raise (Dumbbell)'),
  x('pf-rear-delt-fly', 'Reverse Flys mit Kurzhanteln', 'weight_reps', 'shoulders', 'dumbbell', 'Rear Delt Reverse Fly (Dumbbell)'),
  x('pf-rear-delt-fly-machine', 'Reverse Butterfly an der Maschine', 'weight_reps', 'shoulders', 'machine', 'Rear Delt Reverse Fly (Machine)'),
  x('pf-bent-over-lateral-raise-cable', 'Vorgebeugtes Seitheben am Kabel', 'weight_reps', 'shoulders', 'machine', 'Bent Over Lateral Raise (Cable)'),
  x('pf-face-pull', 'Face Pull', 'weight_reps', 'shoulders', 'machine', 'Face Pull'),
  x('pf-upright-row', 'Aufrechtes Rudern', 'weight_reps', 'shoulders', 'barbell', 'Upright Row (Barbell)'),
  x('pf-shrug', 'Schulterheben', 'weight_reps', 'traps', 'dumbbell', 'Shrug (Dumbbell)'),
  x('pf-pull-up', 'Klimmzug', 'reps_only', 'lats', 'none', 'Pull Up'),
  x('pf-pull-up-weighted', 'Klimmzug mit Zusatzgewicht', 'bodyweight_weighted', 'lats', 'other', 'Pull Up (Weighted)'),
  x('pf-pull-up-assisted', 'Klimmzug mit Unterstützung', 'bodyweight_assisted', 'lats', 'machine', 'Pull Up (Assisted)'),
  x('pf-chin-up', 'Klimmzug im Untergriff', 'reps_only', 'lats', 'none', 'Chin Up'),
  x('pf-lat-pulldown', 'Latzug', 'weight_reps', 'lats', 'machine', 'Lat Pulldown (Cable)'),
  x('pf-lat-pulldown-close', 'Latzug eng', 'weight_reps', 'lats', 'machine', 'Lat Pulldown - Close Grip (Cable)'),
  x('pf-straight-arm-pulldown', 'Gestreckter Latzug', 'weight_reps', 'lats', 'machine', 'Straight Arm Lat Pulldown (Cable)'),
  x('pf-bent-over-row', 'Langhantelrudern vorgebeugt', 'weight_reps', 'upper_back', 'barbell', 'Bent Over Row (Barbell)'),
  x('pf-pendlay-row', 'Pendlay-Rudern', 'weight_reps', 'upper_back', 'barbell', 'Pendlay Row (Barbell)'),
  x('pf-one-arm-row', 'Einarmiges Kurzhantelrudern', 'weight_reps', 'lats', 'dumbbell', 'Dumbbell Row', ['Single Arm Dumbbell Row']),
  x('pf-seated-row-cable', 'Rudern am Kabel sitzend', 'weight_reps', 'upper_back', 'machine', 'Seated Cable Row - Bar Grip'),
  x('pf-seated-row-cable-v', 'Rudern am Kabel mit V-Griff', 'weight_reps', 'upper_back', 'machine', 'Seated Cable Row - V Grip (Cable)'),
  x('pf-seated-row-cable-close', 'Rudern am Kabel eng', 'weight_reps', 'upper_back', 'machine', 'Seated Cable Row (Close Grip)'),
  x('pf-seated-row-machine', 'Rudern sitzend an der Maschine', 'weight_reps', 'upper_back', 'machine', 'Seated Row (Machine)'),
  x('pf-t-bar-row', 'T-Bar-Rudern', 'weight_reps', 'upper_back', 'barbell', 'T Bar Row'),
  x('pf-row-machine', 'Rudermaschine', 'weight_reps', 'upper_back', 'machine', 'Iso-Lateral Row (Machine)'),
  x('pf-chest-supported-row', 'Rudern brustgestützt', 'weight_reps', 'upper_back', 'dumbbell', 'Chest Supported Incline Row (Dumbbell)'),
  x('pf-inverted-row', 'Körperrudern', 'reps_only', 'upper_back', 'none', 'Inverted Row'),
  x('pf-back-extension', 'Rückenstrecker', 'reps_only', 'lower_back', 'none', 'Back Extension (Hyperextension)'),
  x('pf-back-extension-weighted', 'Rückenstrecker mit Gewicht', 'weight_reps', 'lower_back', 'other', 'Back Extension (Weighted Hyperextension)'),
  x('pf-bicep-curl-bb', 'Langhantelcurl', 'weight_reps', 'biceps', 'barbell', 'Bicep Curl (Barbell)'),
  x('pf-bicep-curl-db', 'Kurzhantelcurl', 'weight_reps', 'biceps', 'dumbbell', 'Bicep Curl (Dumbbell)'),
  x('pf-hammer-curl', 'Hammercurl', 'weight_reps', 'biceps', 'dumbbell', 'Hammer Curl (Dumbbell)'),
  x('pf-incline-curl', 'Schrägbankcurl', 'weight_reps', 'biceps', 'dumbbell', 'Seated Incline Curl (Dumbbell)'),
  x('pf-preacher-curl', 'Scott-Curl', 'weight_reps', 'biceps', 'barbell', 'Preacher Curl (Barbell)'),
  x('pf-cable-curl', 'Curl am Kabel', 'weight_reps', 'biceps', 'machine', 'Bicep Curl (Cable)', ['Cable Curl']),
  x('pf-behind-back-curl-cable', 'Curl hinter dem Rücken am Kabel', 'weight_reps', 'biceps', 'machine', 'Behind the Back Curl (Cable)'),
  x('pf-triceps-pushdown', 'Trizepsdrücken am Kabel', 'weight_reps', 'triceps', 'machine', 'Triceps Pushdown'),
  x('pf-triceps-rope', 'Trizepsdrücken mit Seil', 'weight_reps', 'triceps', 'machine', 'Triceps Rope Pushdown'),
  x('pf-skullcrusher', 'Stirndrücken', 'weight_reps', 'triceps', 'barbell', 'Skullcrusher (Barbell)'),
  x('pf-overhead-triceps', 'Trizepsstrecken über Kopf', 'weight_reps', 'triceps', 'dumbbell', 'Triceps Extension (Dumbbell)'),
  x('pf-overhead-triceps-cable', 'Trizepsstrecken über Kopf am Kabel', 'weight_reps', 'triceps', 'machine', 'Overhead Triceps Extension (Cable)'),
  x('pf-close-grip-bench', 'Enges Bankdrücken', 'weight_reps', 'triceps', 'barbell', 'Bench Press - Close Grip (Barbell)'),
  x('pf-bench-dip', 'Dips an der Bank', 'reps_only', 'triceps', 'none', 'Bench Dip'),
  x('pf-wrist-curl', 'Handgelenkscurl', 'weight_reps', 'forearms', 'barbell', 'Seated Wrist Curl (Barbell)'),
  x('pf-farmers-walk', 'Farmers Walk', 'short_distance_weight', 'forearms', 'dumbbell', 'Farmers Walk'),
  x('pf-crunch', 'Crunch', 'reps_only', 'abdominals', 'none', 'Crunch'),
  x('pf-crunch-cable', 'Crunch am Kabel', 'weight_reps', 'abdominals', 'machine', 'Cable Crunch'),
  x('pf-sit-up', 'Sit-up', 'reps_only', 'abdominals', 'none', 'Sit Up'),
  x('pf-leg-raise-hanging', 'Beinheben hängend', 'reps_only', 'abdominals', 'none', 'Hanging Leg Raise'),
  x('pf-leg-raise-lying', 'Beinheben liegend', 'reps_only', 'abdominals', 'none', 'Lying Leg Raise'),
  x('pf-russian-twist', 'Russian Twist', 'reps_only', 'abdominals', 'none', 'Russian Twist (Bodyweight)'),
  x('pf-bicycle-crunch', 'Fahrrad-Crunch', 'reps_only', 'abdominals', 'none', 'Bicycle Crunch'),
  x('pf-ab-wheel', 'Bauchroller', 'reps_only', 'abdominals', 'other'),
  x('pf-plank', 'Unterarmstütz', 'duration', 'abdominals', 'none', 'Plank'),
  x('pf-side-plank', 'Seitstütz', 'duration', 'abdominals', 'none', 'Side Plank'),
  x('pf-dead-bug', 'Dead Bug', 'reps_only', 'abdominals', 'none', 'Dead Bug'),
  x('pf-bird-dog', 'Bird Dog', 'reps_only', 'lower_back', 'none', 'Bird Dog'),
  x('pf-mountain-climber', 'Bergsteiger', 'reps_only', 'abdominals', 'none', 'Mountain Climber'),
  x('pf-pallof-press', 'Pallof Press', 'weight_reps', 'abdominals', 'machine', 'Cable Core Pallof Press'),
  x('pf-wall-sit', 'Wandsitzen', 'duration', 'quadriceps', 'none', 'Wall Sit'),
  x('pf-dead-hang', 'Hängen an der Stange', 'duration', 'lats', 'none', 'Dead Hang'),
  x('pf-burpee', 'Burpee', 'reps_only', 'full_body', 'none', 'Burpee'),
  x('pf-kettlebell-swing', 'Kettlebell Swing', 'weight_reps', 'glutes', 'kettlebell', 'Kettlebell Swing'),
  x('pf-turkish-get-up', 'Türkisches Aufstehen', 'weight_reps', 'full_body', 'kettlebell', 'Kettlebell Turkish Get Up'),
  x('pf-clean-press', 'Umsetzen und Drücken', 'weight_reps', 'full_body', 'barbell', 'Clean and Press'),
  x('pf-box-jump', 'Kastensprung', 'reps_only', 'quadriceps', 'other', 'Box Jump'),
  x('pf-jump-squat', 'Sprunghocke', 'reps_only', 'quadriceps', 'none', 'Jump Squat'),
  x('pf-squat-bw', 'Kniebeuge ohne Gewicht', 'reps_only', 'quadriceps', 'none', 'Squat (Bodyweight)'),
  x('pf-pistol-squat', 'Pistol Squat', 'reps_only', 'quadriceps', 'none', 'Pistol Squat'),
  x('pf-sled-push', 'Schlitten schieben', 'short_distance_weight', 'quadriceps', 'other', 'Sled Push'),
  x('pf-rowing-machine', 'Rudergerät', 'distance_duration', 'cardio', 'machine', 'Rowing Machine'),
  x('pf-running', 'Laufen', 'distance_duration', 'cardio', 'machine'),
  x('pf-stairs', 'Treppensteiger', 'floors_duration', 'cardio', 'machine'),
  x('pf-walking', 'Gehen', 'steps_duration', 'cardio', 'none', 'Walking'),
];

/** Built-ins that are exactly the same exercise as an entry of the base catalog (same movement, same equipment); the base entry is then left out. */
const FEDB_LINKS: Record<string, string> = {
  'pf-bicep-curl-bb': 'fedb-barbell-curl',
  'pf-deadlift': 'fedb-barbell-deadlift',
  'pf-squat': 'fedb-barbell-squat',
  'pf-hip-thrust': 'fedb-barbell-hip-thrust',
  'pf-glute-bridge': 'fedb-barbell-glute-bridge',
  'pf-bench-dip': 'fedb-bench-dips',
  'pf-bent-over-row': 'fedb-bent-over-barbell-row',
  'pf-pec-deck': 'fedb-butterfly',
  'pf-cable-crossover': 'fedb-cable-crossover',
  'pf-crunch-cable': 'fedb-cable-crunch',
  'pf-chin-up': 'fedb-chin-up',
  'pf-clean-press': 'fedb-clean-and-press',
  'pf-close-grip-bench': 'fedb-close-grip-barbell-bench-press',
  'pf-dead-bug': 'fedb-dead-bug',
  'pf-bench-press-db': 'fedb-dumbbell-bench-press',
  'pf-bicep-curl-db': 'fedb-dumbbell-bicep-curl',
  'pf-chest-fly-db': 'fedb-dumbbell-flyes',
  'pf-shoulder-press-db': 'fedb-dumbbell-shoulder-press',
  'pf-shrug': 'fedb-dumbbell-shrug',
  'pf-face-pull': 'fedb-face-pull',
  'pf-overhead-press': 'fedb-barbell-shoulder-press',
  'pf-step-up': 'fedb-dumbbell-step-ups',
  'pf-arnold-press': 'fedb-arnold-dumbbell-press',
  'pf-incline-bench-press': 'fedb-barbell-incline-bench-press-medium-grip',
  'pf-bench-press': 'fedb-barbell-bench-press-medium-grip',
  'pf-lunge': 'fedb-dumbbell-lunges',
  'pf-crunch': 'fedb-crunches',
  'pf-squat-bw': 'fedb-bodyweight-squat',
  'pf-bicycle-crunch': 'fedb-air-bike',
  'pf-ab-wheel': 'fedb-ab-roller',
  'pf-reverse-lunge': 'fedb-dumbbell-rear-lunge',
  'pf-chest-supported-row': 'fedb-dumbbell-incline-row',
  'pf-front-squat': 'fedb-front-barbell-squat',
  'pf-front-raise': 'fedb-front-dumbbell-raise',
  'pf-good-morning': 'fedb-good-morning',
  'pf-hack-squat': 'fedb-hack-squat',
  'pf-hammer-curl': 'fedb-hammer-curls',
  'pf-leg-raise-hanging': 'fedb-hanging-leg-raise',
  'pf-incline-curl': 'fedb-incline-dumbbell-curl',
  'pf-incline-press-db': 'fedb-incline-dumbbell-press',
  'pf-inverted-row': 'fedb-inverted-row',
  'pf-leg-extension': 'fedb-leg-extensions',
  'pf-leg-press': 'fedb-leg-press',
  'pf-leg-curl-lying': 'fedb-lying-leg-curls',
  'pf-chest-press-machine': 'fedb-machine-bench-press',
  'pf-mountain-climber': 'fedb-mountain-climbers',
  'pf-one-arm-row': 'fedb-one-arm-dumbbell-row',
  'pf-pallof-press': 'fedb-pallof-press',
  'pf-plank': 'fedb-plank',
  'pf-preacher-curl': 'fedb-preacher-curl',
  'pf-pull-up': 'fedb-pullups',
  'pf-push-up': 'fedb-pushups',
  'pf-romanian-deadlift': 'fedb-romanian-deadlift',
  'pf-russian-twist': 'fedb-russian-twist',
  'pf-calf-raise-seated': 'fedb-seated-calf-raise',
  'pf-leg-curl-seated': 'fedb-seated-leg-curl',
  'pf-seated-row-cable': 'fedb-seated-cable-rows',
  'pf-lateral-raise': 'fedb-side-lateral-raise',
  'pf-sit-up': 'fedb-sit-up',
  'pf-sled-push': 'fedb-sled-push',
  'pf-calf-raise-standing': 'fedb-standing-calf-raises',
  'pf-sumo-deadlift': 'fedb-sumo-deadlift',
  'pf-trap-bar-deadlift': 'fedb-trap-bar-deadlift',
  'pf-triceps-pushdown': 'fedb-triceps-pushdown',
  'pf-triceps-rope': 'fedb-triceps-pushdown-rope-attachment',
  'pf-hip-abduction': 'fedb-thigh-abductor',
  'pf-hip-adduction': 'fedb-thigh-adductor',
  'pf-upright-row': 'fedb-upright-barbell-row',
  'pf-lat-pulldown': 'fedb-wide-grip-lat-pulldown',
  'pf-straight-arm-pulldown': 'fedb-straight-arm-pulldown',
  'pf-split-squat': 'fedb-split-squat-with-dumbbells',
  'pf-side-plank': 'fedb-side-bridge',
  'pf-rear-delt-fly-machine': 'fedb-reverse-machine-flyes',
  'pf-rear-delt-fly': 'fedb-reverse-flyes',
  'pf-pull-up-weighted': 'fedb-weighted-pull-ups',
  'pf-t-bar-row': 'fedb-t-bar-row-with-handle',
  'pf-back-extension': 'fedb-hyperextensions-back-extensions',
  'pf-cable-curl': 'fedb-standing-biceps-cable-curl',
  'pf-dip': 'fedb-dips-triceps-version',
};
for (const e of EXERCISES) { const f = FEDB_LINKS[e.id]; if (f) e.fedbId = f; }

/**
 * Hevy template id to own exercise id, matched on the exact English Hevy title or an alias. Several Hevy templates with one title
 * all link to the same own exercise. Unknown titles are ignored. The own id is the one history is kept under; to send
 * an own exercise to Hevy, look up the first Hevy id that maps to it.
 */
export function linkHevyTemplates(templates: { id: string; title: string }[]): Map<string, string> {
  const ownByTitle = new Map<string, string>();
  for (const e of EXERCISES) for (const t of [...(e.hevyTitle ? [e.hevyTitle] : []), ...(e.aliases ?? [])]) ownByTitle.set(t, e.id);
  const links = new Map<string, string>();
  for (const t of templates) {
    const own = ownByTitle.get(t.title);
    if (own) links.set(t.id, own);
  }
  return links;
}

/** Hevy shows the equipment in the app's language; the same exercise can be logged under either title. */
const EQUIPMENT_DE: Record<string, string> = { Barbell: 'Langhantel', Dumbbell: 'Kurzhantel', Machine: 'Maschine', Cable: 'Kabel', 'Smith Machine': 'Smith-Maschine', Bodyweight: 'Körpergewicht' };

/** Every title an own exercise may be logged under: German, English Hevy, Hevy and German with the Hevy equipment in German, and its aliases. */
export function exerciseTitles(e: Exercise): string[] {
  const out = [e.title];
  if (e.hevyTitle) {
    out.push(e.hevyTitle);
    const m = /^(.*)\(([^)]+)\)\s*$/.exec(e.hevyTitle);
    const de = m ? EQUIPMENT_DE[m[2]!.trim()] : undefined;
    if (m && de) out.push(`${m[1]}(${de})`, `${e.title} (${de})`);
  }
  out.push(...(e.aliases ?? []));
  return out;
}
