/**
 * Trwałość danych: localStorage (klucz TERMINAL_KONTROLA_V1).
 *
 * Historia tygodni:
 * - `checks["2026-W44"][terminalId] = true` oznacza sprawdzenie w danym tygodniu ISO.
 * - Brak wpisu = niesprawdzony.
 * - Nowy tydzień zaczyna się pustym obiektem (wszystkie niesprawdzone),
 *   a poprzednie klucze tygodni zostają w `checks` — zakładka Historia je pokazuje.
 * - Eksport JSON = pełna kopia (terminale + checks + ustawienia) do przeniesienia.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "TERMINAL_KONTROLA_V1";
  const { uid, normalizeName, currentWeekKey, compareNatural } = global.TK;

  function emptyState() {
    return {
      version: 1,
      terminals: [],
      checks: {},
      theme: "system",
      seeded: false,
    };
  }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return emptyState();
      return {
        version: 1,
        terminals: Array.isArray(data.terminals) ? data.terminals : [],
        checks: data.checks && typeof data.checks === "object" ? data.checks : {},
        theme: data.theme || "system",
        seeded: Boolean(data.seeded),
      };
    } catch {
      return emptyState();
    }
  }

  let state = loadRaw();
  const listeners = new Set();

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function ensureWeek(week = currentWeekKey()) {
    if (!state.checks[week]) {
      state.checks[week] = {};
      persist();
    }
    return week;
  }

  function seedIfNeeded() {
    if (state.seeded && state.terminals.length > 0) return false;
    const seed = global.TERMINAL_SEED || [];
    const now = new Date().toISOString();
    const seen = new Set();
    state.terminals = seed
      .filter((row) => {
        const name = normalizeName(row.name);
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map((row) => ({
        id: uid(),
        name: normalizeName(row.name),
        location: String(row.location || "").trim() || "bez lokalizacji",
        active: true,
        createdAt: now,
        deletedAt: null,
        locationHistory: [],
      }));
    state.seeded = true;
    ensureWeek();
    persist();
    return true;
  }

  function getState() {
    return state;
  }

  function activeTerminals() {
    return state.terminals
      .filter((t) => t.active)
      .sort((a, b) => compareNatural(a.name, b.name));
  }

  function deletedTerminals() {
    return state.terminals
      .filter((t) => !t.active)
      .sort((a, b) => String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")));
  }

  function findById(id) {
    return state.terminals.find((t) => t.id === id) || null;
  }

  function findByName(name) {
    const n = normalizeName(name);
    return state.terminals.find((t) => normalizeName(t.name) === n) || null;
  }

  function locations() {
    const set = new Set();
    activeTerminals().forEach((t) => set.add(t.location));
    return [...set].sort(compareNatural);
  }

  function allKnownLocations() {
    const set = new Set(locations());
    state.terminals.forEach((t) => {
      if (t.location) set.add(t.location);
      (t.locationHistory || []).forEach((h) => {
        if (h.from) set.add(h.from);
        if (h.to) set.add(h.to);
      });
    });
    [
      "FCO",
      "IT",
      "magazyn",
      "pre-series",
      "nowe",
      "obok fco",
    ].forEach((l) => set.add(l));
    return [...set].sort(compareNatural);
  }

  function isChecked(terminalId, week = currentWeekKey()) {
    const bucket = state.checks[week];
    return Boolean(bucket && bucket[terminalId]);
  }

  function setChecked(terminalId, checked, week = currentWeekKey()) {
    ensureWeek(week);
    if (checked) {
      state.checks[week][terminalId] = true;
    } else {
      delete state.checks[week][terminalId];
    }
    persist();
  }

  function toggleChecked(terminalId, week = currentWeekKey()) {
    setChecked(terminalId, !isChecked(terminalId, week), week);
  }

  function weekProgress(week = currentWeekKey()) {
    const list = activeTerminals();
    const total = list.length;
    const done = list.filter((t) => isChecked(t.id, week)).length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, percent };
  }

  function locationProgress(week = currentWeekKey()) {
    const map = new Map();
    activeTerminals().forEach((t) => {
      if (!map.has(t.location)) map.set(t.location, { location: t.location, done: 0, total: 0 });
      const row = map.get(t.location);
      row.total += 1;
      if (isChecked(t.id, week)) row.done += 1;
    });
    return [...map.values()]
      .map((r) => ({
        ...r,
        percent: r.total === 0 ? 0 : Math.round((r.done / r.total) * 100),
      }))
      .sort((a, b) => compareNatural(a.location, b.location));
  }

  function uncheckedThisWeek(week = currentWeekKey()) {
    return activeTerminals().filter((t) => !isChecked(t.id, week));
  }

  function weekKeys() {
    const keys = new Set(Object.keys(state.checks || {}));
    keys.add(currentWeekKey());
    return [...keys].sort().reverse();
  }

  function addTerminal(name, location) {
    const n = normalizeName(name);
    if (!n) throw new Error("Podaj numer terminala.");
    const existing = findByName(n);
    if (existing && existing.active) {
      throw new Error(`Terminal ${n} już istnieje.`);
    }
    if (existing && !existing.active) {
      existing.active = true;
      existing.deletedAt = null;
      if (location && location !== existing.location) {
        existing.locationHistory = existing.locationHistory || [];
        existing.locationHistory.push({
          from: existing.location,
          to: location,
          at: new Date().toISOString(),
        });
        existing.location = location;
      }
      persist();
      return existing;
    }
    const terminal = {
      id: uid(),
      name: n,
      location: String(location || "").trim() || "bez lokalizacji",
      active: true,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      locationHistory: [],
    };
    state.terminals.push(terminal);
    persist();
    return terminal;
  }

  function softDelete(id) {
    const t = findById(id);
    if (!t || !t.active) return false;
    t.active = false;
    t.deletedAt = new Date().toISOString();
    persist();
    return true;
  }

  function restore(id) {
    const t = findById(id);
    if (!t || t.active) return false;
    const clash = state.terminals.find(
      (x) => x.active && x.id !== t.id && normalizeName(x.name) === normalizeName(t.name)
    );
    if (clash) throw new Error(`Aktywny terminal ${t.name} już istnieje.`);
    t.active = true;
    t.deletedAt = null;
    persist();
    return true;
  }

  function moveTerminal(id, newLocation) {
    const t = findById(id);
    if (!t) throw new Error("Nie znaleziono terminala.");
    const to = String(newLocation || "").trim();
    if (!to) throw new Error("Wybierz lokalizację.");
    if (to === t.location) return t;
    t.locationHistory = t.locationHistory || [];
    t.locationHistory.push({
      from: t.location,
      to,
      at: new Date().toISOString(),
    });
    t.location = to;
    persist();
    return t;
  }

  function setTheme(theme) {
    state.theme = theme;
    persist();
  }

  function exportJSON() {
    return JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        terminals: state.terminals,
        checks: state.checks,
        theme: state.theme,
        seeded: state.seeded,
      },
      null,
      2
    );
  }

  function importJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Nieprawidłowy plik JSON.");
    }
    if (!data || typeof data !== "object") throw new Error("Nieprawidłowa struktura danych.");
    if (!Array.isArray(data.terminals)) throw new Error("Brak listy terminali w pliku.");
    state = {
      version: 1,
      terminals: data.terminals,
      checks: data.checks && typeof data.checks === "object" ? data.checks : {},
      theme: data.theme || state.theme || "system",
      seeded: true,
    };
    persist();
  }

  function resetToSeed() {
    state = emptyState();
    persist();
    seedIfNeeded();
  }

  function clearAllChecks(week = currentWeekKey()) {
    state.checks[week] = {};
    persist();
  }

  global.Store = {
    STORAGE_KEY,
    subscribe,
    getState,
    seedIfNeeded,
    ensureWeek,
    activeTerminals,
    deletedTerminals,
    findById,
    findByName,
    locations,
    allKnownLocations,
    isChecked,
    setChecked,
    toggleChecked,
    weekProgress,
    locationProgress,
    uncheckedThisWeek,
    weekKeys,
    addTerminal,
    softDelete,
    restore,
    moveTerminal,
    setTheme,
    exportJSON,
    importJSON,
    resetToSeed,
    clearAllChecks,
    currentWeekKey,
  };
})(window);
