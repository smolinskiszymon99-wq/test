/**
 * Silnik rozkładu zużycia wody (pure JS, bez DOM).
 * Wagi dni: badania smart-meter (weekend +10–21%), polskie analizy sieci
 * (święta zmienne), losowy charakter tygodnia — bez sztywnych procentów.
 */
(function (root) {
  "use strict";

  const DECIMALS = 3;
  const DAY_NAMES = [
    "niedziela",
    "poniedziałek",
    "wtorek",
    "środa",
    "czwartek",
    "piątek",
    "sobota",
  ];

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    return (Math.random() * 0xffffffff) >>> 0;
  }

  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function ymd(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function polishHolidaySet(year) {
    const easter = easterSunday(year);
    return new Set([
      `${year}-01-01`,
      `${year}-01-06`,
      `${year}-05-01`,
      `${year}-05-03`,
      `${year}-08-15`,
      `${year}-11-01`,
      `${year}-11-11`,
      `${year}-12-25`,
      `${year}-12-26`,
      ymd(easter),
      ymd(addDays(easter, 1)),
      ymd(addDays(easter, 49)),
      ymd(addDays(easter, 60)),
    ]);
  }

  function isPolishHoliday(date) {
    return polishHolidaySet(date.getFullYear()).has(ymd(date));
  }

  function dayBaseWeight(date, rng) {
    const dow = date.getDay();
    let center;
    let spread;

    if (isPolishHoliday(date) && dow !== 0 && dow !== 6) {
      // Święta w tygodniu — szeroki zakres; sobota/niedziela mają własne reguły poniżej
      center = 0.92;
      spread = 0.42;
    } else if (dow === 6) {
      // Sobota — bez podbijania; niedziela jest celowo niżej, żeby rzadziej ją przebijała
      center = isPolishHoliday(date) ? 1.12 : 1.18;
      spread = 0.22;
    } else if (dow === 0) {
      // Niedziela zwykle poniżej soboty (niższy środek + węższy rozrzut w górę)
      center = isPolishHoliday(date) ? 0.95 : 0.98;
      spread = 0.14;
    } else if (dow === 5) {
      center = 1.04;
      spread = 0.14;
    } else if (dow === 1) {
      center = 0.98;
      spread = 0.12;
    } else {
      center = 0.94;
      spread = 0.14;
    }

    const weekKey = Math.floor(date.getTime() / (7 * 86400000));
    const weekRng = mulberry32((weekKey * 2654435761) ^ Math.floor(rng() * 1e9));
    const weekFactor = 0.9 + weekRng() * 0.22;

    let w = (center - spread / 2 + rng() * spread) * weekFactor;

    const month = date.getMonth();
    if (month >= 4 && month <= 7) {
      w *= 1.02 + rng() * 0.08;
    } else if (month === 11 || month === 0) {
      w *= 0.96 + rng() * 0.12;
    }

    w *= 0.88 + rng() * 0.24;
    return Math.max(0.12, w);
  }

  /** Jeśli niedziela > sobota w tym samym weekendzie — zamień wartości miejscami. */
  function swapSundaySaturdayIfNeeded(dates, daily) {
    const out = daily.slice();
    for (let i = 0; i < out.length - 1; i++) {
      if (dates[i].getDay() !== 6) continue;
      if (dates[i + 1].getDay() !== 0) continue;
      if (out[i + 1] > out[i]) {
        const tmp = out[i];
        out[i] = out[i + 1];
        out[i + 1] = tmp;
      }
    }
    return out;
  }

  function roundTo(n, digits = DECIMALS) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  }

  function formatNum(n) {
    return roundTo(n).toFixed(DECIMALS);
  }

  function eachDate(start, end) {
    const out = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function normalizeExact(values, target, maxPerDay) {
    const n = values.length;
    const out = values.slice();
    let sum = out.reduce((a, b) => a + b, 0);

    if (sum <= 0) {
      if (target === 0) return out.map(() => 0);
      const even = target / n;
      return out.map(() =>
        maxPerDay != null && maxPerDay > 0 ? Math.min(even, maxPerDay) : even
      );
    }

    const scale = target / sum;
    for (let i = 0; i < n; i++) {
      out[i] *= scale;
      if (maxPerDay != null && maxPerDay > 0) out[i] = Math.min(out[i], maxPerDay);
    }

    let residual = target - out.reduce((a, b) => a + b, 0);
    let passes = 0;
    while (Math.abs(residual) > 1e-10 && passes < n * 4) {
      passes += 1;
      const candidates = [];
      for (let i = 0; i < n; i++) {
        if (residual > 0) {
          const room =
            maxPerDay != null && maxPerDay > 0 ? maxPerDay - out[i] : Infinity;
          if (room > 1e-12) candidates.push(i);
        } else if (out[i] > 1e-12) {
          candidates.push(i);
        }
      }
      if (!candidates.length) break;
      const add = residual / candidates.length;
      for (const i of candidates) {
        if (residual > 0 && maxPerDay != null && maxPerDay > 0) {
          const room = maxPerDay - out[i];
          const delta = Math.min(room, add);
          out[i] += delta;
          residual -= delta;
        } else {
          const delta = Math.max(-out[i], add);
          out[i] += delta;
          residual -= delta;
        }
      }
    }

    residual = target - out.reduce((a, b) => a + b, 0);
    if (Math.abs(residual) > 1e-10) {
      for (let i = n - 1; i >= 0; i--) {
        const next = out[i] + residual;
        if (next < -1e-12) continue;
        if (maxPerDay != null && maxPerDay > 0 && next > maxPerDay + 1e-12) continue;
        out[i] = Math.max(0, next);
        break;
      }
    }

    return out;
  }

  function allocateWithCap(total, weights, maxPerDay, rng) {
    const n = weights.length;
    if (n === 0) return [];
    if (total < 0) throw new Error("Zużycie nie może być ujemne.");

    const sumW = weights.reduce((a, b) => a + b, 0) || 1;
    let remaining = total;
    const result = new Array(n).fill(0);
    const free = new Array(n).fill(true);

    if (maxPerDay != null && maxPerDay > 0) {
      const maxPossible = maxPerDay * n;
      if (total > maxPossible + 1e-9) {
        throw new Error(
          `Łączne zużycie licznika 2 (${formatNum(total)}) przekracza limit ` +
            `${formatNum(maxPerDay)} × ${n} dni = ${formatNum(maxPossible)}.`
        );
      }

      let guard = 0;
      while (remaining > 1e-12 && guard < n + 5) {
        guard += 1;
        const freeIdx = [];
        let freeW = 0;
        for (let i = 0; i < n; i++) {
          if (free[i]) {
            freeIdx.push(i);
            freeW += weights[i];
          }
        }
        if (!freeIdx.length) break;
        freeW = freeW || 1;

        let capped = false;
        for (const i of freeIdx) {
          const share = remaining * (weights[i] / freeW);
          if (share > maxPerDay) {
            result[i] = maxPerDay;
            free[i] = false;
            remaining -= maxPerDay;
            capped = true;
          }
        }
        if (!capped) {
          for (const i of freeIdx) {
            result[i] = remaining * (weights[i] / freeW);
          }
          remaining = 0;
          break;
        }
      }
    } else {
      for (let i = 0; i < n; i++) {
        result[i] = total * (weights[i] / sumW);
      }
    }

    // Wider day-to-day jitter so the series is visibly uneven (still renormalized)
    const noisy = result.map((v) => {
      const factor = 0.72 + rng() * 0.56; // ~0.72–1.28
      let nv = v * factor;
      if (maxPerDay != null && maxPerDay > 0) nv = Math.min(nv, maxPerDay);
      return Math.max(0, nv);
    });

    return normalizeExact(noisy, total, maxPerDay);
  }

  function daysAtMax(values, maxPerDay, eps) {
    const idx = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] >= maxPerDay - eps) idx.push(i);
    }
    return idx;
  }

  /**
   * Limit: wartość maksymalna nie powinna padać na >10% dni w okresie.
   * Nadmiar dni „na limicie” ściągany poniżej max, a różnica rozkładana
   * na inne dni (najpierw poniżej soft-cap, bez tworzenia nowych hitów limitu).
   */
  function limitMaxHitFrequency(daily, maxPerDay, weights, rng, maxShare = 0.1) {
    if (maxPerDay == null || !(maxPerDay > 0)) return daily.slice();
    const n = daily.length;
    if (n === 0) return [];

    const eps = Math.max(1e-9, maxPerDay * 1e-6);
    const allowed = Math.floor(n * maxShare); // „więcej niż 10%” → redukuj
    const out = daily.map((v) => Math.min(Math.max(0, v), maxPerDay));

    let hits = daysAtMax(out, maxPerDay, eps);
    if (hits.length <= allowed) return out;

    // Zostaw do `allowed` dni na limicie (najwyższe wagi); resztę ściągnij
    hits.sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
    const toReduce = hits.slice(allowed);
    let freed = 0;
    for (const i of toReduce) {
      const target = maxPerDay * (0.84 + rng() * 0.12); // ~84–96% max
      if (out[i] > target) {
        freed += out[i] - target;
        out[i] = target;
      }
    }

    const softCap = maxPerDay * 0.98;
    let remaining = freed;
    let guard = 0;
    while (remaining > 1e-12 && guard < n * 8) {
      guard += 1;
      const receivers = [];
      for (let i = 0; i < n; i++) {
        if (out[i] < softCap - 1e-12) receivers.push(i);
      }
      if (!receivers.length) break;
      const add = remaining / receivers.length;
      for (const i of receivers) {
        const room = softCap - out[i];
        const d = Math.min(room, Math.max(0, add));
        out[i] += d;
        remaining -= d;
      }
    }

    // Reszta: dołóż do hard max, nie przekraczając allowed liczby hitów
    guard = 0;
    while (remaining > 1e-12 && guard < n * 8) {
      guard += 1;
      const hitsNow = daysAtMax(out, maxPerDay, eps);
      const hitSet = new Set(hitsNow);
      const receivers = [];
      for (let i = 0; i < n; i++) {
        let ceiling = maxPerDay;
        if (!hitSet.has(i) && hitsNow.length >= allowed) ceiling = maxPerDay - eps;
        if (ceiling - out[i] > 1e-12) receivers.push(i);
      }
      if (!receivers.length) break;
      const add = remaining / receivers.length;
      for (const i of receivers) {
        const hits = daysAtMax(out, maxPerDay, eps);
        const setNow = new Set(hits);
        let ceiling = maxPerDay;
        if (!setNow.has(i) && hits.length >= allowed) ceiling = maxPerDay - eps;
        const room = ceiling - out[i];
        const d = Math.min(Math.max(0, room), Math.max(0, add));
        out[i] += d;
        remaining -= d;
      }
    }

    return out;
  }

  /** Dopnij sumę do target, starając się nie robić >10% dni na limicie. */
  function normalizeExactMaxHits(values, target, maxPerDay, weights, rng, maxShare = 0.1) {
    let out = limitMaxHitFrequency(values, maxPerDay, weights, rng, maxShare);
    if (maxPerDay == null || !(maxPerDay > 0)) {
      return normalizeExact(out, target, null);
    }

    const n = out.length;
    const eps = Math.max(1e-9, maxPerDay * 1e-6);
    const allowed = Math.floor(n * maxShare);
    let residual = target - out.reduce((a, b) => a + b, 0);
    let passes = 0;

    while (Math.abs(residual) > 1e-10 && passes < n * 10) {
      passes += 1;
      if (residual > 0) {
        const hits = daysAtMax(out, maxPerDay, eps);
        const hitSet = new Set(hits);
        const softCap = maxPerDay * 0.98;
        let candidates = [];
        for (let i = 0; i < n; i++) {
          if (out[i] < softCap - 1e-12) candidates.push(i);
        }
        if (!candidates.length) {
          for (let i = 0; i < n; i++) {
            const room = maxPerDay - out[i];
            if (room <= 1e-12) continue;
            if (hitSet.has(i) || hits.length < allowed) candidates.push(i);
            else if (out[i] < maxPerDay - eps) candidates.push(i);
          }
        }
        if (!candidates.length) break;
        const add = residual / candidates.length;
        for (const i of candidates) {
          const hitsNow = daysAtMax(out, maxPerDay, eps);
          const setNow = new Set(hitsNow);
          let ceiling = maxPerDay;
          if (!setNow.has(i) && hitsNow.length >= allowed) ceiling = maxPerDay - eps;
          const room = ceiling - out[i];
          const d = Math.min(Math.max(0, room), add);
          out[i] += d;
          residual -= d;
        }
      } else {
        const candidates = [];
        for (let i = 0; i < n; i++) {
          if (out[i] > 1e-12) candidates.push(i);
        }
        if (!candidates.length) break;
        const add = residual / candidates.length; // negative
        for (const i of candidates) {
          const d = Math.max(-out[i], add);
          out[i] += d;
          residual -= d;
        }
      }
    }

    // Ostateczny float-fix
    residual = target - out.reduce((a, b) => a + b, 0);
    if (Math.abs(residual) > 1e-10) {
      const hits = daysAtMax(out, maxPerDay, eps);
      const hitSet = new Set(hits);
      for (let i = n - 1; i >= 0; i--) {
        let ceiling = maxPerDay;
        if (!hitSet.has(i) && hits.length >= allowed) ceiling = maxPerDay - eps;
        const next = out[i] + residual;
        if (next < -1e-12 || next > ceiling + 1e-12) continue;
        out[i] = Math.max(0, next);
        break;
      }
    }

    // Jeszcze raz zetnij nadmiar hitów, jeśli normalizacja je odtworzyła
    out = limitMaxHitFrequency(out, maxPerDay, weights, rng, maxShare);
    const sum2 = out.reduce((a, b) => a + b, 0);
    if (Math.abs(sum2 - target) > 0.01) {
      // Przy bardzo wysokim totale nie da się jednocześnie trzymać ≤10% na max —
      // wróć do twardego limitu dziennego (bez limitu częstości).
      return normalizeExact(values, target, maxPerDay);
    }
    // Dociągnij drobny residual bez tworzenia nowych hitów jeśli możliwe
    residual = target - out.reduce((a, b) => a + b, 0);
    if (Math.abs(residual) > 1e-10) {
      const hits = daysAtMax(out, maxPerDay, eps);
      const hitSet = new Set(hits);
      for (let i = 0; i < n && Math.abs(residual) > 1e-10; i++) {
        let ceiling = maxPerDay;
        if (!hitSet.has(i) && hits.length >= allowed) ceiling = maxPerDay - eps;
        if (residual > 0) {
          const room = ceiling - out[i];
          const d = Math.min(room, residual);
          if (d > 0) {
            out[i] += d;
            residual -= d;
          }
        } else if (out[i] > 0) {
          const d = Math.max(-out[i], residual);
          out[i] += d;
          residual -= d;
        }
      }
    }

    return out;
  }

  /** Korekta po zaokrągleniu: max na ≤10% dni, suma exact, krok 0.001. */
  function enforceMaxHitShareRounded(values, maxPerDay, weights, rng, maxShare, target) {
    if (maxPerDay == null || !(maxPerDay > 0)) return values.slice();
    const n = values.length;
    const step = Number((1 / 10 ** DECIMALS).toFixed(DECIMALS));
    const maxR = roundTo(maxPerDay);
    const allowed = Math.floor(n * maxShare);
    const out = values.map((v) => Math.min(roundTo(v), maxR));

    const hitIdx = () => {
      const idx = [];
      for (let i = 0; i < n; i++) if (out[i] >= maxR - 1e-12) idx.push(i);
      return idx;
    };

    let hits = hitIdx();
    if (hits.length > allowed) {
      hits.sort((a, b) => (weights[b] || 0) - (weights[a] || 0));
      const toReduce = hits.slice(allowed);
      for (const i of toReduce) {
        // Ściągnij o kilka kroków poniżej max
        const stepsDown = 2 + Math.floor(rng() * 6); // 0.002–0.007
        out[i] = roundTo(Math.max(0, maxR - stepsDown * step));
      }
    }

    // Dopnij sumę
    let diff = roundTo(roundTo(target) - roundTo(out.reduce((a, b) => a + b, 0)));
    let guard = 0;
    while (Math.abs(diff) >= step / 2 && guard < n * 30) {
      guard += 1;
      const hitsNow = hitIdx();
      const hitSet = new Set(hitsNow);
      if (diff > 0) {
        const order = [...Array(n).keys()].sort(
          (a, b) => (weights[b] || 0) - (weights[a] || 0)
        );
        let moved = false;
        for (const i of order) {
          let ceiling = maxR;
          if (!hitSet.has(i) && hitsNow.length >= allowed) {
            ceiling = roundTo(maxR - step);
          }
          if (out[i] + step <= ceiling + 1e-12) {
            out[i] = roundTo(out[i] + step);
            diff = roundTo(diff - step);
            moved = true;
            break;
          }
        }
        if (!moved) break;
      } else {
        const order = [...Array(n).keys()].sort(
          (a, b) => (weights[a] || 0) - (weights[b] || 0)
        );
        let moved = false;
        for (const i of order) {
          if (out[i] >= step) {
            out[i] = roundTo(out[i] - step);
            diff = roundTo(diff + step);
            moved = true;
            break;
          }
        }
        if (!moved) break;
      }
    }

    return out;
  }

  /**
   * Build meter 1/3 daily series loosely tracking meter 2's shape
   * (roughly proportional to totals, with intentional mismatch).
   */
  function followMeter2Shape(dailyM2, meterTotal, m2Total, weights, rng) {
    const n = dailyM2.length;
    if (n === 0) return [];
    if (meterTotal <= 0) return new Array(n).fill(0);

    if (m2Total <= 1e-12) {
      return allocateWithCap(meterTotal, weights, null, rng);
    }

    const ratio = meterTotal / m2Total;
    const draft = dailyM2.map((v) => {
      // Not perfectly proportional: ±~30% around the share of meter 2 that day
      const jitter = 0.7 + rng() * 0.6;
      return Math.max(0, v * ratio * jitter);
    });
    return normalizeExact(draft, meterTotal, null);
  }

  function roundSeriesExact(values, target, maxPerDay = null) {
    const n = values.length;
    if (n === 0) return [];
    const targetR = roundTo(target);
    const floored = values.map((v) => {
      const r = roundTo(v);
      if (maxPerDay != null && maxPerDay > 0) return Math.min(r, roundTo(maxPerDay));
      return r;
    });

    let diff = roundTo(targetR - roundTo(floored.reduce((a, b) => a + b, 0)));
    const step = Number((1 / 10 ** DECIMALS).toFixed(DECIMALS));
    const order = values
      .map((v, i) => ({
        i,
        frac: v - Math.floor(v * 10 ** DECIMALS) / 10 ** DECIMALS,
      }))
      .sort((a, b) => b.frac - a.frac)
      .map((x) => x.i);

    let guard = 0;
    while (Math.abs(diff) >= step / 2 && guard < n * 20) {
      guard += 1;
      let moved = false;
      for (const i of order) {
        if (diff === 0) break;
        if (diff > 0) {
          if (maxPerDay != null && maxPerDay > 0 && floored[i] + step > maxPerDay + 1e-12) {
            continue;
          }
          floored[i] = roundTo(floored[i] + step);
          diff = roundTo(diff - step);
          moved = true;
          if (Math.abs(diff) < step / 2) break;
        } else if (floored[i] >= step) {
          floored[i] = roundTo(floored[i] - step);
          diff = roundTo(diff + step);
          moved = true;
          if (Math.abs(diff) < step / 2) break;
        }
      }
      if (!moved) break;
    }

    return floored;
  }

  function computeDistribution(inputs, seed) {
    const {
      startDate,
      endDate,
      m1Start,
      m1End,
      m2Start,
      m2End,
      m3Start,
      m3End,
      maxM2,
    } = inputs;

    const dates = eachDate(startDate, endDate);
    if (dates.length < 2) {
      throw new Error("Okres musi obejmować co najmniej 2 dni (początek i koniec).");
    }

    const intervals = dates.length - 1;
    const totals = [m1End - m1Start, m2End - m2Start, m3End - m3Start];
    if (totals.some((t) => t < 0)) {
      throw new Error("Stan końcowy każdego licznika musi być ≥ początkowego.");
    }

    const rng = mulberry32(seed);
    let weights = [];
    for (let i = 0; i < intervals; i++) {
      weights.push(dayBaseWeight(dates[i], rng));
    }
    weights = swapSundaySaturdayIfNeeded(dates, weights);

    // Licznik 2 jest źródłem dziennego zużycia — wagami + limitem, bez późniejszego „wyrównywania”
    let finalM2 = allocateWithCap(totals[1], weights, maxM2, rng);
    // Jeśli niedziela > sobota — zamień miejscami
    finalM2 = swapSundaySaturdayIfNeeded(dates, finalM2);
    // Limit dzienny nie powinien padać na >10% dni — rozłóż nadmiar
    if (maxM2 != null && maxM2 > 0) {
      finalM2 = normalizeExactMaxHits(finalM2, totals[1], maxM2, weights, rng, 0.1);
      finalM2 = swapSundaySaturdayIfNeeded(dates, finalM2);
    } else {
      finalM2 = normalizeExact(finalM2, totals[1], null);
      finalM2 = swapSundaySaturdayIfNeeded(dates, finalM2);
    }

    const m2Sum = finalM2.reduce((a, b) => a + b, 0);
    if (Math.abs(m2Sum - totals[1]) > 0.01) {
      throw new Error(
        "Nie da się rozłożyć zużycia licznika 2 przy podanym limicie dziennym. " +
          "Zwiększ limit lub skróć okres."
      );
    }

    // L1 i L3 idą w ślad za kształtem L2, ale nie idealnie proporcjonalnie
    const finalM1 = followMeter2Shape(finalM2, totals[0], totals[1], weights, rng);
    const finalM3 = followMeter2Shape(finalM2, totals[2], totals[1], weights, rng);

    const use1 = roundSeriesExact(finalM1, totals[0]);
    let use2 = roundSeriesExact(finalM2, totals[1], maxM2);
    const use3 = roundSeriesExact(finalM3, totals[2]);

    if (maxM2 != null && maxM2 > 0) {
      const over = use2.findIndex((v) => v > maxM2 + 1e-9);
      if (over !== -1) {
        throw new Error(
          "Nie da się rozłożyć zużycia licznika 2 przy podanym limicie dziennym. " +
            "Zwiększ limit lub skróć okres."
        );
      }
      // Po zaokrągleniu znów pilnuj ≤10% dni na limicie
      use2 = roundSeriesExact(
        normalizeExactMaxHits(use2, totals[1], maxM2, weights, rng, 0.1),
        totals[1],
        maxM2
      );
      // Jeśli roundSeriesExact znowu wypchnął za dużo na max — miękka korekta
      use2 = enforceMaxHitShareRounded(use2, maxM2, weights, rng, 0.1, totals[1]);
    }
    use2 = swapSundaySaturdayIfNeeded(dates, use2);

    const rows = [];
    let c1 = roundTo(m1Start);
    let c2 = roundTo(m2Start);
    let c3 = roundTo(m3Start);

    for (let i = 0; i < dates.length; i++) {
      const isLast = i === dates.length - 1;
      rows.push({
        date: ymd(dates[i]),
        dow: DAY_NAMES[dates[i].getDay()],
        holiday: isPolishHoliday(dates[i]),
        m1: isLast ? roundTo(m1End) : c1,
        m2: isLast ? roundTo(m2End) : c2,
        m3: isLast ? roundTo(m3End) : c3,
        consumption: null,
        consumptionM2: null,
        isLast,
      });

      if (!isLast) {
        c1 = roundTo(c1 + use1[i]);
        c2 = roundTo(c2 + use2[i]);
        c3 = roundTo(c3 + use3[i]);
      }
    }

    rows[0].m1 = roundTo(m1Start);
    rows[0].m2 = roundTo(m2Start);
    rows[0].m3 = roundTo(m3Start);
    rows[rows.length - 1].m1 = roundTo(m1End);
    rows[rows.length - 1].m2 = roundTo(m2End);
    rows[rows.length - 1].m3 = roundTo(m3End);

    for (let i = 0; i < rows.length - 1; i++) {
      // Zużycie w kolumnie = wyłącznie przyrost licznika 2
      const d2 = roundTo(rows[i + 1].m2 - rows[i].m2);
      rows[i].consumption = d2;
      rows[i].consumptionM2 = d2;
      rows[i].deltaM1 = roundTo(rows[i + 1].m1 - rows[i].m1);
      rows[i].deltaM3 = roundTo(rows[i + 1].m3 - rows[i].m3);
    }

    return { rows, seed, totals, intervals, weights };
  }

  const api = {
    DECIMALS,
    DAY_NAMES,
    mulberry32,
    randomSeed,
    ymd,
    isPolishHoliday,
    easterSunday,
    roundTo,
    formatNum,
    computeDistribution,
  };

  root.WaterMetersEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
