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
  m1End: 14.5,
  m2Start: 100,
  m2End: 112.3,
  m3Start: 50,
  m3End: 55.8,
  maxM2: 0.6,
};

const { rows, totals } = eng.computeDistribution(inputs, 42);

assert(rows.length === 31, `expected 31 rows, got ${rows.length}`);
assert(rows[0].m1 === 10 && rows[0].m2 === 100 && rows[0].m3 === 50, "start mismatch");
assert(
  rows.at(-1).m1 === 14.5 && rows.at(-1).m2 === 112.3 && rows.at(-1).m3 === 55.8,
  "end mismatch"
);

const sumM2 = rows
  .slice(0, -1)
  .reduce((a, r) => a + r.consumptionM2, 0);
assert(Math.abs(eng.roundTo(sumM2) - eng.roundTo(totals[1])) < 0.002, `m2 sum ${sumM2} vs ${totals[1]}`);

for (const r of rows.slice(0, -1)) {
  assert(r.consumptionM2 <= 0.6 + 1e-9, `m2 day over cap: ${r.date} ${r.consumptionM2}`);
  const expected = eng.roundTo(
    rows[rows.indexOf(r) + 1].m1 -
      r.m1 +
      (rows[rows.indexOf(r) + 1].m2 - r.m2) +
      (rows[rows.indexOf(r) + 1].m3 - r.m3)
  );
  assert(r.consumption === expected, `consumption mismatch on ${r.date}`);
}

assert(eng.isPolishHoliday(new Date("2025-01-01T00:00:00")), "New Year holiday");
assert(eng.isPolishHoliday(new Date("2025-01-06T00:00:00")), "Epiphany");
assert(!eng.isPolishHoliday(new Date("2025-01-07T00:00:00")), "Jan 7 not holiday");

// Same Saturday different weeks → different weights (non-rigid)
const wA = [];
const wB = [];
for (let s = 1; s <= 30; s++) {
  const a = eng.computeDistribution(
    { ...inputs, startDate: new Date("2025-02-01T00:00:00"), endDate: new Date("2025-02-15T00:00:00"), maxM2: null },
    s
  );
  const b = eng.computeDistribution(
    { ...inputs, startDate: new Date("2025-02-08T00:00:00"), endDate: new Date("2025-02-22T00:00:00"), maxM2: null },
    s + 100
  );
  const satA = a.rows.find((r) => r.dow === "sobota" && !r.isLast);
  const satB = b.rows.find((r) => r.dow === "sobota" && !r.isLast);
  if (satA) wA.push(satA.consumption);
  if (satB) wB.push(satB.consumption);
}
assert(new Set(wA.map((x) => x.toFixed(3))).size > 1, "Saturday consumption should vary across seeds");

let failed = false;
try {
  eng.computeDistribution({ ...inputs, maxM2: 0.1 }, 1);
} catch {
  failed = true;
}
assert(failed, "impossible max should throw");

console.log("OK – all engine tests passed");
console.log(
  "sample first days:",
  rows.slice(0, 5).map((r) => ({
    d: r.date,
    m2: r.m2,
    use: r.consumption,
    m2use: r.consumptionM2,
  }))
);
