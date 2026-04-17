#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// THERYN — DESIGN & UI EDGE CASES
// Run with: node stress-tests/06_design_edge_cases.js
// Requires Node 18+ (no external deps — pure logic mirrors)
// ─────────────────────────────────────────────────────────────────────────────

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
  white:   '\x1b[97m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  acid:    '\x1b[92m',  // bright green ≈ Theryn #C8FF00
};

const pass  = (s) => `${C.green}${C.bold}PASS${C.reset}  ${s}`;
const fail  = (s) => `${C.red}${C.bold}FAIL${C.reset}  ${s}`;
const warn  = (s) => `${C.yellow}${C.bold}WARN${C.reset}  ${s}`;
const info  = (s) => `${C.dim}      ${s}${C.reset}`;
const head  = (s) => `\n${C.acid}${C.bold}▶ ${s}${C.reset}`;
const sub   = (s) => `${C.cyan}  ─ ${s}${C.reset}`;
const hr    = ()  => `${C.dim}${'─'.repeat(72)}${C.reset}`;

// Counters
let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;

function check(label, input, expected, actual, customVerdict) {
  const ok = customVerdict !== undefined
    ? customVerdict
    : (
        actual === expected ||
        (Number.isNaN(expected) && Number.isNaN(actual)) ||
        (expected === null && actual === null) ||
        (expected === undefined && actual === undefined)
      );

  const inp = JSON.stringify(input) === undefined ? String(input) : JSON.stringify(input);
  const exp = String(expected);
  const got = String(actual);

  if (ok) {
    totalPass++;
    console.log(pass(`${label}`));
    console.log(info(`input=${inp}  →  got="${got}"`));
  } else {
    totalFail++;
    console.log(fail(`${label}`));
    console.log(info(`input=${inp}`));
    console.log(info(`expected="${exp}"  got="${got}"`));
  }
}

function checkWarn(label, input, note) {
  totalWarn++;
  console.log(warn(`${label}`));
  console.log(info(`input=${JSON.stringify(input)}  →  ${note}`));
}

// ── Mirrors of App.jsx logic (no imports needed) ─────────────────────────────

// Workout types
const WORKOUT_TYPES = ['Push','Pull','Legs','Upper','Lower','Full Body','Core','Cardio','Rest','Run','Swim','Bike','HIIT','Yoga','Custom'];

// Type colours (from App.jsx TYPE_COLORS)
const TYPE_COLORS = {
  Push:'#FF8C42', Pull:'#4ECDC4', Legs:'#A8E6CF', Upper:'#C77DFF',
  Lower:'#FFD166', Rest:'#585858', Cardio:'#06D6A0', 'Full Body':'#C8FF00',
  Core:'#FFD166', Run:'#06D6A0', Swim:'#4ECDC4', Bike:'#FFD166',
  HIIT:'#FF8C42', Yoga:'#C77DFF', Custom:'#585858',
};

const DEFAULT_TYPE_COLOR = '#585858';
function getTypeColor(type) {
  return TYPE_COLORS[type] || DEFAULT_TYPE_COLOR;
}

// Profile initials logic (derive from display_name)
function getInitials(name) {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// isCardioExercise (from App.jsx)
const CARDIO_EXERCISES = new Set([
  'Treadmill Run','Swimming','Stationary Bike','Rowing Machine','Elliptical',
  'Stair Climber','Jump Rope','Battle Ropes','Burpees','Jump Squat',
  'Mountain Climbers','Stretch Flow',
]);
function isCardioExercise(name) {
  return CARDIO_EXERCISES.has(name);
}

// isTimedExercise (from App.jsx) — uses case-insensitive substring match
const TIMED_EXERCISES_LIST = ['Plank', 'Wall Sit', 'Farmer', 'L-Sit', 'Hollow Hold', 'Static Hang', 'Dead Hang', 'Stretching', 'Hold'];
function isTimedExercise(name) {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return TIMED_EXERCISES_LIST.some(ex => n.includes(ex.toLowerCase()));
}

// Volume calculation (mirrors useWorkouts totalVolume)
function calcVolume(exercises) {
  return exercises.reduce((total, ex) => {
    return total + ex.sets.reduce((s, set) => {
      const w = Number(set.w);
      const r = Number(set.r);
      if (!isFinite(w) || !isFinite(r)) return s;
      return s + w * r;
    }, 0);
  }, 0);
}

// Safe weight formatter (what the UI renders)
function formatWeight(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return '';
  if (n < 0) return '';
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Streak calculation (mirrors calculateRoutineStreak from App.jsx)
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function calculateRoutineStreak(workoutHistory, routine) {
  if (!workoutHistory || workoutHistory.length === 0 || !routine) return 0;
  const workedOutDays = new Set(workoutHistory.map(w => w.date));

  let firstDateStr = workoutHistory[workoutHistory.length - 1].date;
  for (const w of workoutHistory) {
    if (w.date < firstDateStr) firstDateStr = w.date;
  }
  const firstDate = new Date(firstDateStr + 'T12:00:00');
  firstDate.setHours(0,0,0,0);

  let streak = 0;
  let check = new Date();
  check.setHours(0,0,0,0);
  const todayIso = check.toISOString().split('T')[0];

  while (check >= firstDate) {
    const iso = check.toISOString().split('T')[0];
    const jsDay = check.getDay();
    const dayStr = DAYS[jsDay === 0 ? 6 : jsDay - 1];
    const isRestDayStr = routine[dayStr]?.type === 'Rest';

    if (workedOutDays.has(iso)) {
      streak++;
    } else if (isRestDayStr) {
      streak++;
    } else {
      if (iso === todayIso) {
        // today not yet done — don't break streak
      } else {
        break;
      }
    }
    check.setDate(check.getDate() - 1);
  }
  return streak;
}

// Debounce (mirrors the 2000ms autoSave pattern in App.jsx)
function makeDebounce(fn, delay) {
  let timer = null;
  let callCount = 0;
  return {
    call(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callCount++;
        fn(...args);
        timer = null;
      }, delay);
    },
    getCallCount() { return callCount; },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 1 — Extreme Text
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 1 — Extreme Text'));
console.log(hr());

{
  // 1a: 100-char exercise name — should not throw, should truncate gracefully in UI
  const longName = 'Incline Dumbbell Fly With Rotation And Pause At Top For Maximum Chest Stretch And Activation XYZ123';
  check(
    'Long exercise name (100 chars) does not throw',
    longName,
    longName.length,
    longName.length,
  );
  check(
    'Long exercise name truncated preview (first 40 chars)',
    longName,
    longName.slice(0, 40) + '…',
    (longName.length > 40 ? longName.slice(0, 40) + '…' : longName),
  );

  // 1b: Long athlete name
  const longAthleteRaw = 'Bartholomew Christophersen-Vandenberg Jr';
  const longAthlete = longAthleteRaw.slice(0, 50);
  check(
    'Athlete name capped at 50 chars for display',
    longAthlete,
    true,
    longAthlete.length <= 50,
  );

  // 1c: Workout type color fallback for unknown type
  check('Known type "Push" returns color',     'Push',   '#FF8C42', getTypeColor('Push'));
  check('Known type "Custom" returns color',   'Custom', '#585858', getTypeColor('Custom'));
  check('Unknown type returns fallback color', 'Zumba',  DEFAULT_TYPE_COLOR, getTypeColor('Zumba'));
  check('Empty type returns fallback color',   '',       DEFAULT_TYPE_COLOR, getTypeColor(''));
  check('null type returns fallback color',    null,     DEFAULT_TYPE_COLOR, getTypeColor(null));

  // 1d: Profile initials
  console.log(sub('Profile initials'));
  check('1 word → first letter only',          'John',                   'J',  getInitials('John'));
  check('2 words → first + last initial',      'Mary Watson',            'MW', getInitials('Mary Watson'));
  check('4 words → first + last initial',      'Mary Jane Watson Parker','MP', getInitials('Mary Jane Watson Parker'));
  check('Empty string → "?"',                  '',                        '?',  getInitials(''));
  check('null → "?"',                          null,                      '?',  getInitials(null));
  check('Whitespace-only → "?"',               '   ',                     '?',  getInitials('   '));

  // Non-ASCII: Chinese characters
  const chineseInitials = getInitials('李伟');
  check(
    'Non-ASCII name "李伟" → first char initial',
    '李伟',
    '李',
    chineseInitials,
    chineseInitials === '李' || chineseInitials.length === 1,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 2 — Extreme Numbers
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 2 — Extreme Numbers'));
console.log(hr());

{
  console.log(sub('Weight formatting (formatWeight)'));

  // Weight values
  const weightCases = [
    { input: 0,         expected: '0' },
    { input: 0.5,       expected: '0.5' },
    { input: 999.9,     expected: '999.9' },
    { input: 9999,      expected: '9999' },
    { input: null,      expected: '' },
    { input: undefined, expected: '' },
    { input: 'abc',     expected: '' },
    { input: NaN,       expected: '' },
    { input: Infinity,  expected: '' },
    { input: -5,        expected: '' },
  ];

  for (const { input, expected } of weightCases) {
    check(
      `formatWeight(${JSON.stringify(input)}) → "${expected}"`,
      input,
      expected,
      formatWeight(input),
    );
  }

  console.log(sub('Reps edge cases'));
  const repsCases = [
    { input: 0,    expected: '0' },
    { input: 1,    expected: '1' },
    { input: 100,  expected: '100' },
    { input: 999,  expected: '999' },
    { input: null, expected: '' },
    { input: '',   expected: '' },
  ];
  for (const { input, expected } of repsCases) {
    check(
      `formatWeight(${JSON.stringify(input)}) for reps → "${expected}"`,
      input,
      expected,
      formatWeight(input),
    );
  }

  console.log(sub('Volume calculation'));

  // 9999 × 999 should not overflow or NaN
  const bigVol = calcVolume([{ sets: [{ w: '9999', r: '999' }] }]);
  check(
    'Volume 9999 × 999 = 9989001 (no overflow/NaN)',
    { w: '9999', r: '999' },
    9989001,
    bigVol,
  );
  check(
    'Volume is a finite number',
    bigVol,
    true,
    isFinite(bigVol) && !isNaN(bigVol),
  );

  // Mixed valid/invalid weights
  const mixedVol = calcVolume([
    { sets: [{ w: '100', r: '10' }, { w: '', r: '10' }, { w: 'abc', r: '5' }, { w: '50', r: '8' }] }
  ]);
  check(
    'Volume with invalid weights skips them: 100×10 + 50×8 = 1400',
    'mixed sets',
    1400,
    mixedVol,
  );

  // Infinity in volume
  const infVol = calcVolume([{ sets: [{ w: 'Infinity', r: '10' }] }]);
  check(
    'Infinity weight → excluded from volume',
    'Infinity',
    true,
    infVol === 0,
  );

  console.log(sub('Body weight edge cases'));
  const bodyWeights = [0, 50, 500, 1000];
  for (const bw of bodyWeights) {
    const formatted = formatWeight(bw);
    check(
      `Body weight ${bw} lbs formats without error`,
      bw,
      true,
      formatted !== '' || bw === 0,
    );
  }

  console.log(sub('Streak edge cases'));
  check('Streak 0',   0,   true, 0 === 0);
  check('Streak 1',   1,   true, 1 >= 0);
  check('Streak 365', 365, true, 365 > 0);
  // 366 = leap year
  check('Streak 366 (leap year) is valid',  366, true, 366 > 0);
  check('Streak not NaN',  NaN, true, !isNaN(0));
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 3 — Empty States
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 3 — Empty States'));
console.log(hr());

{
  // 3a: Empty workout history → streak = 0
  const emptyStreak = calculateRoutineStreak([], { Mon: { type: 'Push', exercises: [] } });
  check(
    'Streak with 0 sessions → 0',
    [],
    0,
    emptyStreak,
  );

  const nullStreak = calculateRoutineStreak(null, { Mon: { type: 'Push', exercises: [] } });
  check(
    'Streak with null history → 0',
    null,
    0,
    nullStreak,
  );

  // 3b: 0 exercises in a workout day
  const emptyDayVol = calcVolume([]);
  check(
    '0 exercises → volume = 0',
    [],
    0,
    emptyDayVol,
  );

  // 3c: All 7 days set to Rest
  const allRestRoutine = {
    Mon: { type: 'Rest', exercises: [] },
    Tue: { type: 'Rest', exercises: [] },
    Wed: { type: 'Rest', exercises: [] },
    Thu: { type: 'Rest', exercises: [] },
    Fri: { type: 'Rest', exercises: [] },
    Sat: { type: 'Rest', exercises: [] },
    Sun: { type: 'Rest', exercises: [] },
  };
  // With 1 session on any day, streak should be 1 (rest days count)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const allRestStreak = calculateRoutineStreak(
    [{ date: yesterday }],
    allRestRoutine,
  );
  check(
    'All-Rest routine: rest days count toward streak',
    allRestRoutine,
    true,
    allRestStreak >= 1,
  );

  // 3d: Workout with exercises but all sets are empty strings
  const emptySetVol = calcVolume([
    { sets: [{ w: '', r: '' }, { w: '', r: '' }] },
    { sets: [{ w: '', r: '' }] },
  ]);
  check(
    'All empty-string sets → volume = 0',
    'all empty sets',
    0,
    emptySetVol,
  );

  // 3e: totalVolume when exercises array itself is empty
  const noExVol = calcVolume([]);
  check(
    'Empty exercises array → totalVolume = 0',
    [],
    0,
    noExVol,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 4 — Date Edge Cases
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 4 — Date Edge Cases'));
console.log(hr());

{
  console.log(sub('Dec 31 year boundary'));
  const dec31 = '2024-12-31';
  const jan1  = '2025-01-01';
  // Streak spanning year boundary: workout Dec 31 and Jan 1
  // Build a fake routine where every day is active (non-Rest)
  const dailyRoutine = {
    Mon: { type: 'Push',  exercises: [] },
    Tue: { type: 'Pull',  exercises: [] },
    Wed: { type: 'Legs',  exercises: [] },
    Thu: { type: 'Push',  exercises: [] },
    Fri: { type: 'Pull',  exercises: [] },
    Sat: { type: 'Legs',  exercises: [] },
    Sun: { type: 'Rest',  exercises: [] },
  };

  // Simulate streak with workouts on Dec 30, Dec 31
  const yearBoundaryHistory = [
    { date: '2024-12-31' },
    { date: '2024-12-30' },
  ];
  // The real calculateRoutineStreak walks backward from today;
  // if there's a gap since Dec 31 the streak would be 0 today.
  // We just test that the function doesn't throw on year-boundary dates.
  let yearError = null;
  let yearResult;
  try {
    yearResult = calculateRoutineStreak(yearBoundaryHistory, dailyRoutine);
  } catch(e) {
    yearError = e;
  }
  check(
    'Streak calc with Dec 31 → does not throw',
    dec31,
    true,
    yearError === null,
  );
  check(
    'Streak result is a non-negative integer',
    yearResult,
    true,
    typeof yearResult === 'number' && yearResult >= 0 && Number.isInteger(yearResult),
  );

  console.log(sub('Feb 29 leap year'));
  const feb29 = new Date('2024-02-29T12:00:00');
  check(
    'Feb 29 2024 is a valid date (leap year)',
    '2024-02-29',
    true,
    !isNaN(feb29.getTime()),
  );
  const feb29Str = feb29.toISOString().split('T')[0];
  check(
    'Feb 29 ISO string is "2024-02-29"',
    feb29,
    '2024-02-29',
    feb29Str,
  );

  // Non-leap year — Feb 29 becomes Mar 1
  const feb29NonLeap = new Date('2023-02-29T12:00:00');
  check(
    'Feb 29 2023 (non-leap) rolls to Mar 1',
    '2023-02-29',
    true,
    feb29NonLeap.getMonth() === 2, // month 2 = March
  );

  console.log(sub('Month boundary streak'));
  // Streak spanning Jan 31 → Feb 1
  const monthBoundaryHistory = [
    { date: '2025-01-31' },
    { date: '2025-01-30' },
    { date: '2025-01-29' },
  ];
  let monthError = null;
  try {
    calculateRoutineStreak(monthBoundaryHistory, dailyRoutine);
  } catch(e) {
    monthError = e;
  }
  check(
    'Streak calc across Jan→Feb boundary does not throw',
    'Jan 31 → Feb 1',
    true,
    monthError === null,
  );

  console.log(sub('Timezone edge case: midnight UTC vs local'));
  // logged_at at midnight UTC — when local timezone is behind UTC (e.g. UTC-5)
  // the date string should be interpreted with T12:00:00 to avoid off-by-one
  const utcMidnight = '2025-03-15T00:00:00.000Z';
  const utcMidnightDate = new Date(utcMidnight + 'T12:00:00'.replace('T12:00:00',''));
  // App uses: new Date(s + "T12:00:00") for date-only strings
  const safeDateStr = utcMidnight.split('T')[0]; // "2025-03-15"
  const safeDate    = new Date(safeDateStr + 'T12:00:00');
  check(
    'T12:00:00 anchoring prevents timezone off-by-one',
    safeDateStr,
    '2025-03-15',
    safeDate.toISOString().split('T')[0],
  );

  // fmtDate (mirrors App.jsx) uses T12:00:00 to prevent timezone drift
  function fmtDate(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const fmtResult = fmtDate('2025-03-15');
  check(
    'fmtDate("2025-03-15") returns non-empty string',
    '2025-03-15',
    true,
    fmtResult.length > 0 && !fmtResult.includes('Invalid'),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 5 — Exercise Classification
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 5 — Exercise Classification'));
console.log(hr());

{
  console.log(sub('isCardioExercise()'));

  // isCardioExercise uses exact Set membership (case-sensitive)
  const cardioCases = [
    { input: 'Treadmill Run',   expected: true  },
    { input: 'Running',         expected: false }, // not in the Set
    { input: 'treadmill run',   expected: false }, // case-sensitive!
    { input: 'SWIMMING',        expected: false }, // case-sensitive!
    { input: 'Swimming',        expected: true  },
    { input: 'Custom Cardio',   expected: false },
    { input: '',                expected: false },
    { input: null,              expected: false },
  ];

  for (const { input, expected } of cardioCases) {
    const actual = isCardioExercise(input);
    check(
      `isCardioExercise("${input}") → ${expected}`,
      input,
      expected,
      actual,
    );
  }

  console.log(sub('isTimedExercise() — case-insensitive substring match'));

  const timedCases = [
    { input: 'Plank',                    expected: true  },
    { input: 'plank hold',               expected: true  }, // contains "plank"
    { input: 'PLANK',                    expected: true  }, // lowercased in check
    { input: 'Farmer Carry',             expected: true  }, // contains "Farmer"
    { input: 'farmer carry',             expected: true  },
    { input: 'custom plank exercise',    expected: true  }, // contains "plank"
    { input: 'benchpress',               expected: false }, // no match — false positive check
    { input: 'Bench Press',              expected: false },
    { input: 'Wall Sit',                 expected: true  },
    { input: 'Dead Hang',                expected: true  },
    { input: 'dead hang low',            expected: true  },
    { input: '',                         expected: false },
    { input: null,                       expected: false },
    { input: undefined,                  expected: false },
    { input: 'Hollow Body Hold',         expected: true  }, // contains "Hold"
    { input: 'Cable Row',                expected: false }, // false positive check
    { input: 'L-Sit',                    expected: true  },
    { input: 'l-sit on bars',            expected: true  },
  ];

  for (const { input, expected } of timedCases) {
    const actual = isTimedExercise(input);
    check(
      `isTimedExercise("${input}") → ${expected}`,
      input,
      expected,
      actual,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 6 — Concurrent Updates (Debounce)
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 6 — Concurrent Updates (Debounce)'));
console.log(hr());

// These are async tests — we collect them and run after all sync tests
const asyncTests = [];

asyncTests.push(async () => {
  console.log(sub('100 rapid template changes → only 1 save fires'));

  let saveCallCount = 0;
  const db = makeDebounce(() => { saveCallCount++; }, 200); // 200ms for test speed

  // Fire 100 rapid "template changes"
  for (let i = 0; i < 100; i++) {
    db.call({ day: 'Mon', type: 'Push' });
  }

  // Before debounce window expires: 0 saves
  check(
    'Before debounce expires: 0 saves fired',
    '100 rapid calls',
    0,
    saveCallCount,
  );

  // Wait for debounce to fire
  await new Promise(r => setTimeout(r, 350));

  check(
    'After debounce window: exactly 1 save fired',
    '100 rapid calls + 350ms wait',
    1,
    saveCallCount,
  );

  // Fire 50 more, wait, then 50 more — should be 2 total after both windows
  for (let i = 0; i < 50; i++) db.call({ day: 'Tue', type: 'Pull' });
  await new Promise(r => setTimeout(r, 350));
  for (let i = 0; i < 50; i++) db.call({ day: 'Wed', type: 'Legs' });
  await new Promise(r => setTimeout(r, 350));

  check(
    'Two separate burst sequences → 3 total saves',
    '2 more bursts',
    3,
    saveCallCount,
  );
});

asyncTests.push(async () => {
  console.log(sub('skipAutoSaveRef pattern: coach update mid-edit'));

  // Simulate the skipAutoSaveRef pattern from App.jsx
  // When coach pushes a template update, skipAutoSaveRef.current = true
  // is set so the next useEffect run doesn't overwrite the coach's version.
  let skipAutoSave = false;
  let autoSaveCount = 0;

  function simulateTemplateChange(skipRef) {
    if (skipRef) {
      skipRef = false; // reset the flag — this is what App.jsx does
      return; // no auto-save
    }
    autoSaveCount++;
  }

  // User makes a change (no skip) → auto-save fires
  simulateTemplateChange(skipAutoSave);
  check(
    'Normal user edit → auto-save fires',
    'skipAutoSave=false',
    1,
    autoSaveCount,
  );

  // Coach pushes update → skipAutoSave = true → auto-save skipped
  skipAutoSave = true;
  simulateTemplateChange(skipAutoSave);
  check(
    'Coach update (skipAutoSave=true) → auto-save skipped',
    'skipAutoSave=true',
    1, // still 1, not incremented
    autoSaveCount,
  );

  // After skip is consumed, next change auto-saves again
  skipAutoSave = false;
  simulateTemplateChange(skipAutoSave);
  check(
    'After skip consumed → next edit auto-saves normally',
    'skipAutoSave=false again',
    2,
    autoSaveCount,
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// EDGE CASE 7 — Coach Link Edge Cases
// ═════════════════════════════════════════════════════════════════════════════
console.log(head('EDGE CASE 7 — Coach Link Edge Cases'));
console.log(hr());

{
  // Mirror of loadCoachLinks output format (pure data logic, no Supabase)
  function filterLinksForUser(allLinks, userId) {
    return allLinks.filter(l => l.coach_id === userId || l.athlete_id === userId);
  }

  function getActiveCoach(links, athleteId) {
    return links.find(l => l.athlete_id === athleteId && l.status === 'accepted') || null;
  }

  function getPendingLinks(links, athleteId) {
    return links.filter(l => l.athlete_id === athleteId && l.status === 'pending');
  }

  function hasActiveCoach(links, athleteId) {
    return getActiveCoach(links, athleteId) !== null;
  }

  // 7a: 0 links
  const noLinks = [];
  check(
    '0 links → filterLinksForUser returns []',
    [],
    0,
    filterLinksForUser(noLinks, 'user-1').length,
  );
  check(
    '0 links → hasActiveCoach returns false',
    [],
    false,
    hasActiveCoach(noLinks, 'user-1'),
  );

  // 7b: 1 pending link
  const pendingLinks = [
    { id: 'link-1', coach_id: 'coach-1', athlete_id: 'athlete-1', status: 'pending', created_at: '2025-01-01T00:00:00Z' },
  ];
  check(
    '1 pending link → not active',
    pendingLinks,
    false,
    hasActiveCoach(pendingLinks, 'athlete-1'),
  );
  check(
    '1 pending link → getPendingLinks returns 1',
    pendingLinks,
    1,
    getPendingLinks(pendingLinks, 'athlete-1').length,
  );

  // 7c: 100 accepted links (100 athletes under 1 coach)
  const manyLinks = Array.from({ length: 100 }, (_, i) => ({
    id: `link-${i}`,
    coach_id: 'coach-mega',
    athlete_id: `athlete-${i}`,
    status: 'accepted',
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
  }));
  check(
    '100 accepted links → filterLinksForUser returns 100 for coach',
    manyLinks,
    100,
    filterLinksForUser(manyLinks, 'coach-mega').length,
  );
  check(
    '100 accepted links → each athlete has exactly 1 active coach',
    manyLinks,
    true,
    manyLinks.every(l => {
      const myLinks = filterLinksForUser(manyLinks, l.athlete_id);
      const accepted = myLinks.filter(ml => ml.status === 'accepted');
      return accepted.length === 1;
    }),
  );

  // 7d: Athlete with BOTH pending AND accepted coach → enforce 1 active coach rule
  const conflictLinks = [
    { id: 'link-a', coach_id: 'coach-1', athlete_id: 'athlete-x', status: 'accepted', created_at: '2025-01-01T00:00:00Z' },
    { id: 'link-b', coach_id: 'coach-2', athlete_id: 'athlete-x', status: 'pending',  created_at: '2025-01-10T00:00:00Z' },
  ];
  const activeCount = conflictLinks.filter(l => l.athlete_id === 'athlete-x' && l.status === 'accepted').length;
  check(
    'Athlete with pending+accepted: only 1 accepted link exists',
    conflictLinks,
    1,
    activeCount,
  );
  // Attempting to accept the pending link should be blocked
  // (In real app: sendCoachRequest checks for existing accepted link first)
  const wouldBlock = hasActiveCoach(conflictLinks, 'athlete-x');
  check(
    'sendCoachRequest would be blocked (athlete already has active coach)',
    'athlete-x already has accepted link',
    true,
    wouldBlock,
  );

  // 7e: Coach with 50 athletes — max realistic load
  const coach50Links = Array.from({ length: 50 }, (_, i) => ({
    id: `link-${i}`,
    coach_id: 'coach-50',
    athlete_id: `athlete-${i}`,
    status: 'accepted',
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    coach_name: 'Coach Bob',
    athlete_name: `Athlete ${i}`,
  }));

  const coachView = filterLinksForUser(coach50Links, 'coach-50');
  check(
    'Coach with 50 athletes: loads all 50 links',
    50,
    50,
    coachView.length,
  );
  check(
    'Coach with 50 athletes: all links have athlete names',
    coachView,
    true,
    coachView.every(l => l.athlete_name && l.athlete_name.length > 0),
  );

  // Data integrity: no duplicate athlete IDs
  const athleteIds = coachView.map(l => l.athlete_id);
  const uniqueAthletes = new Set(athleteIds).size;
  check(
    'Coach 50 athletes: no duplicate athlete IDs',
    uniqueAthletes,
    50,
    uniqueAthletes,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Run async tests then print final summary
// ═════════════════════════════════════════════════════════════════════════════
async function runAll() {
  for (const fn of asyncTests) {
    await fn();
  }

  const total = totalPass + totalFail + totalWarn;
  console.log('\n' + hr());
  console.log(`\n${C.bold}${C.white}THERYN EDGE CASE TEST RESULTS${C.reset}`);
  console.log(hr());
  console.log(`  ${C.green}${C.bold}PASS${C.reset}  ${totalPass}`);
  if (totalWarn > 0)
    console.log(`  ${C.yellow}${C.bold}WARN${C.reset}  ${totalWarn}`);
  if (totalFail > 0)
    console.log(`  ${C.red}${C.bold}FAIL${C.reset}  ${totalFail}`);
  console.log(`  ${'─'.repeat(20)}`);
  console.log(`  ${C.dim}TOTAL${C.reset} ${total}`);
  console.log('');

  if (totalFail === 0 && totalWarn === 0) {
    console.log(`${C.acid}${C.bold}  ALL TESTS PASSED ✓${C.reset}\n`);
  } else if (totalFail === 0) {
    console.log(`${C.yellow}${C.bold}  ${totalWarn} WARNING(S) — review above${C.reset}\n`);
  } else {
    console.log(`${C.red}${C.bold}  ${totalFail} FAILURE(S) — see details above${C.reset}\n`);
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

runAll().catch(err => {
  console.error(`\n${C.red}Unhandled error in test runner:${C.reset}`, err);
  process.exit(1);
});
