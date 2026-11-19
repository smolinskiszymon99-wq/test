import { createRequire } from "module";
const require = createRequire(import.meta.url);
const eng = require("./engine.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const inputs = {
  startDate: new Date("2025-01-01T00:00:00"),
  endDate: new Date("2025-01-31T00:00:00"),
  m1Start: 10,
  m1End: 25,
  m2Start: 100,
  m2End: 160,
  m3Start: 50,
  m3End: 70,
  maxM2: 4,
};

const { rows, totals } = eng.computeDistribution(inputs, 42);

assert(rows.length === 31, `expected 31 rows, got ${rows.length}`);
assert(rows[0].m1 === 10 && rows[0].m2 === 100 && rows[0].m3 === 50, "start mismatch");
assert(
  rows.at(-1).m1 === 25 && rows.at(-1).m2 === 160 && rows.at(-1).m3 === 70,
  "end mismatch"
);

const sumM2 = rows.slice(0, -1).reduce((a, r) => a + r.consumption, 0);
assert(sumM2 === totals[1], `m2 sum ${sumM2} vs ${totals[1]}`);

const m2Uses = [];
for (const r of rows.slice(0, -1)) {
  const d2 = rows[rows.indexOf(r) + 1].m2 - r.m2;
  assert(Number.isInteger(r.m1), `m1 not int on ${r.date}`);
  assert(Number.isInteger(r.m2), `m2 not int on ${r.date}`);
  assert(Number.isInteger(r.m3), `m3 not int on ${r.date}`);
  assert(Number.isInteger(r.consumption), `consumption not int on ${r.date}`);
  assert(r.consumption === d2, `consumption must be L2 delta on ${r.date}`);
  assert(r.consumption <= 4, `m2 day over cap: ${r.date} ${r.consumption}`);
  m2Uses.push(r.consumption);
}

const mean = m2Uses.reduce((a, b) => a + b, 0) / m2Uses.length;
const variance =
  m2Uses.reduce((a, b) => a + (b - mean) ** 2, 0) / m2Uses.length;
const cv = Math.sqrt(variance) / mean;
assert(cv > 0.08, `L2 too flat: cv=${cv.toFixed(3)} mean=${mean}`);
assert(new Set(m2Uses).size > 2, "L2 days should take several distinct values");

let satSum = 0;
let satN = 0;
let midSum = 0;
let midN = 0;
let weekendPairs = 0;
let sunHigher = 0;
for (let s = 1; s <= 80; s++) {
  const { rows: r } = eng.computeDistribution({ ...inputs, maxM2: null }, s);
  for (let i = 0; i < r.length - 1; i++) {
    const row = r[i];
    if (row.isLast) continue;
    if (row.dow === "sobota") {
      satSum += row.consumption;
      satN += 1;
      const next = r[i + 1];
      if (next && next.dow === "niedziela" && !next.isLast) {
        weekendPairs += 1;
        if (next.consumption > row.consumption) sunHigher += 1;
      }
    } else if (["wtorek", "środa", "czwartek"].includes(row.dow)) {
      midSum += row.consumption;
      midN += 1;
    }
  }
}
const satAvg = satSum / satN;
const midAvg = midSum / midN;
assert(satAvg > midAvg, `Saturday avg ${satAvg} should exceed midweek ${midAvg}`);
const sunOverSatRate = sunHigher / weekendPairs;
assert(
  sunOverSatRate === 0,
  `Sunday>Saturday should never remain after swap: ${(sunOverSatRate * 100).toFixed(1)}% of ${weekendPairs} weekends`
);

const { rows: r2 } = eng.computeDistribution({ ...inputs, maxM2: null }, 7);
const deltasM1 = r2.slice(0, -1).map((row) => row.deltaM1 ?? 0);
assert(
  new Set(deltasM1).size > 1,
  "L1 daily deltas should not be identical every day"
);

assert(eng.isPolishHoliday(new Date("2025-01-01T00:00:00")), "New Year holiday");
assert(!eng.isPolishHoliday(new Date("2025-01-07T00:00:00")), "Jan 7 not holiday");

let failed = false;
try {
  eng.computeDistribution({ ...inputs, maxM2: 1 }, 1);
} catch {
  failed = true;
}
assert(failed, "impossible max should throw");

let maxHitOk = 0;
let maxHitTrials = 0;
for (let s = 1; s <= 40; s++) {
  const { rows: r } = eng.computeDistribution(
    {
      ...inputs,
      m2Start: 100,
      m2End: 160,
      maxM2: 5,
    },
    s
  );
  const days = r.slice(0, -1);
  const hits = days.filter((row) => row.consumption >= 5).length;
  const share = hits / days.length;
  maxHitTrials += 1;
  if (share <= 0.1 + 1e-9) maxHitOk += 1;
}
assert(
  maxHitOk >= maxHitTrials * 0.85,
  `max hit share ≤10% only in ${maxHitOk}/${maxHitTrials} trials`
);

assert(eng.DECIMALS === 0, "DECIMALS must be 0 for natural numbers");

console.log("OK – all engine tests passed");
console.log(
  "L2 cv=",
  cv.toFixed(3),
  "sat/mid=",
  (satAvg / midAvg).toFixed(3),
  "sun>sat=",
  (sunOverSatRate * 100).toFixed(1) + "%",
  "max≤10%=",
  `${maxHitOk}/${maxHitTrials}`
);
console.log(
  "sample:",
  rows.slice(0, 8).map((r) => ({
    d: r.date,
    dow: r.dow,
    useL2: r.consumption,
  }))
);
