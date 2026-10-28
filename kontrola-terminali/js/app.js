(function () {
  "use strict";

  const {
    getISOWeekInfo,
    currentWeekKey,
    parseWeekKey,
    weekStartDate,
    formatDatePL,
    formatDateTimePL,
    escapeHtml,
    compareNatural,
    downloadBlob,
    copyText,
    normalizeName,
  } = window.TK;
  const Store = window.Store;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const ui = {
    weekLabel: $("#week-label"),
    headerBar: $("#header-progress-bar"),
    headerText: $("#header-progress-text"),
    headerPercent: $("#header-percent"),
    dashWeekLead: $("#dash-week-lead"),
    dashPercent: $("#dash-percent"),
    dashCounts: $("#dash-counts"),
    dashRingFg: $("#dash-ring-fg"),
    dashTiles: $("#dash-tiles"),
    search: $("#search-input"),
    accordion: $("#terminals-accordion"),
    terminalsEmpty: $("#terminals-empty"),
    uncheckedList: $("#unchecked-list"),
    uncheckedEmpty: $("#unchecked-empty"),
    historyList: $("#history-list"),
    historyEmpty: $("#history-empty"),
    deletedList: $("#deleted-list"),
    deletedEmpty: $("#deleted-empty"),
    toast: $("#toast"),
    datalist: $("#location-datalist"),
    themeToggle: $("#theme-toggle"),
    modalAdd: $("#modal-add"),
    modalMove: $("#modal-move"),
    modalDetail: $("#modal-detail"),
    formAdd: $("#form-add"),
    formMove: $("#form-move"),
    addName: $("#add-name"),
    addLocation: $("#add-location"),
    addError: $("#add-error"),
    moveName: $("#move-terminal-name"),
    moveLocation: $("#move-location"),
    moveError: $("#move-error"),
    detailTitle: $("#detail-title"),
    detailDl: $("#detail-dl"),
    detailHistory: $("#detail-history"),
  };

  let currentView = "dashboard";
  let moveTargetId = null;
  let openLocations = new Set();
  let toastTimer = null;
  const CIRC = 2 * Math.PI * 52;

  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    requestAnimationFrame(() => ui.toast.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      ui.toast.classList.remove("show");
      setTimeout(() => {
        ui.toast.hidden = true;
      }, 200);
    }, 2200);
  }

  function applyTheme(theme) {
    const t = theme || Store.getState().theme || "system";
    document.documentElement.setAttribute("data-theme", t);
    $$(".seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === t);
    });
  }

  function weekTitle() {
    const { year, week } = getISOWeekInfo();
    const start = weekStartDate(year, week);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return {
      label: `Tydzień ${week} · ${year}`,
      range: `${formatDatePL(start.toISOString())} – ${formatDatePL(end.toISOString())}`,
      key: currentWeekKey(),
      week,
      year,
    };
  }

  function updateHeader() {
    const w = weekTitle();
    const p = Store.weekProgress(w.key);
    ui.weekLabel.textContent = `${w.label} · ${w.range}`;
    ui.headerText.textContent = `${p.done} / ${p.total}`;
    ui.headerPercent.textContent = `${p.percent}%`;
    ui.headerBar.style.width = `${p.percent}%`;
  }

  function renderDashboard() {
    const w = weekTitle();
    const p = Store.weekProgress(w.key);
    ui.dashWeekLead.textContent = `${w.label} (${w.range})`;
    ui.dashPercent.textContent = `${p.percent}%`;
    ui.dashCounts.textContent = `${p.done} / ${p.total}`;
    ui.dashRingFg.style.strokeDasharray = String(CIRC);
    ui.dashRingFg.style.strokeDashoffset = String(CIRC * (1 - p.percent / 100));

    const tiles = Store.locationProgress(w.key);
    ui.dashTiles.innerHTML = tiles
      .map(
        (t, i) => `
      <button type="button" class="loc-tile" data-goto-loc="${escapeHtml(t.location)}" style="animation-delay:${i * 30}ms">
        <span class="name">${escapeHtml(t.location)}</span>
        <span class="meta"><span>${t.done}/${t.total}</span><span>${t.percent}%</span></span>
        <span class="mini-bar" aria-hidden="true"><span style="width:${t.percent}%"></span></span>
      </button>`
      )
      .join("");
  }

  function matchesSearch(terminal, q) {
    if (!q) return true;
    const loc = terminal.location.toLowerCase();
    const name = terminal.name.toLowerCase();
    return name.includes(q) || loc.includes(q);
  }

  function renderTerminals() {
    const q = (ui.search.value || "").trim().toLowerCase();
    const week = currentWeekKey();
    const list = Store.activeTerminals().filter((t) => matchesSearch(t, q));

    const byLoc = new Map();
    list.forEach((t) => {
      if (!byLoc.has(t.location)) byLoc.set(t.location, []);
      byLoc.get(t.location).push(t);
    });

    const locations = [...byLoc.keys()].sort(compareNatural);
    if (locations.length === 0) {
      ui.accordion.innerHTML = "";
      ui.terminalsEmpty.hidden = false;
      return;
    }
    ui.terminalsEmpty.hidden = true;

    // If searching, auto-open matching groups
    if (q) locations.forEach((l) => openLocations.add(l));

    ui.accordion.innerHTML = locations
      .map((loc) => {
        const terms = byLoc.get(loc);
        const done = terms.filter((t) => Store.isChecked(t.id, week)).length;
        const open = openLocations.has(loc);
        return `
        <div class="acc-item${open ? " open" : ""}" data-loc="${escapeHtml(loc)}">
          <button type="button" class="acc-head" aria-expanded="${open}">
            <span class="chev" aria-hidden="true">${open ? "▼" : "▶"}</span>
            <span>${escapeHtml(loc)}</span>
            <span class="count">${done}/${terms.length}</span>
          </button>
          <div class="acc-body">
            ${terms
              .map((t) => {
                const checked = Store.isChecked(t.id, week);
                return `
              <div class="terminal-row" data-id="${t.id}">
                <button type="button" class="check-btn" role="checkbox" aria-checked="${checked}" aria-label="Sprawdzony ${escapeHtml(t.name)}">
                  ${checked ? "✓" : ""}
                </button>
                <div class="term-meta">
                  <div class="term-name">${escapeHtml(t.name)}</div>
                  <div class="term-sub">${checked ? "sprawdzony" : "niesprawdzony"}</div>
                </div>
                <div class="row-actions">
                  <button type="button" data-action="detail">Info</button>
                  <button type="button" data-action="move">Przenieś</button>
                  <button type="button" class="danger" data-action="delete">Usuń</button>
                </div>
              </div>`;
              })
              .join("")}
          </div>
        </div>`;
      })
      .join("");
  }

  function renderUnchecked() {
    const list = Store.uncheckedThisWeek();
    if (list.length === 0) {
      ui.uncheckedList.innerHTML = "";
      ui.uncheckedEmpty.hidden = false;
      return;
    }
    ui.uncheckedEmpty.hidden = true;
    ui.uncheckedList.innerHTML = list
      .map((t) => `<li>${escapeHtml(t.name)} <span class="muted">· ${escapeHtml(t.location)}</span></li>`)
      .join("");
  }

  function renderHistory() {
    const current = currentWeekKey();
    const keys = Store.weekKeys().filter((k) => k !== current);
    const active = Store.activeTerminals();

    if (keys.length === 0) {
      ui.historyList.innerHTML = "";
      ui.historyEmpty.hidden = false;
      return;
    }
    ui.historyEmpty.hidden = true;

    ui.historyList.innerHTML = keys
      .map((key) => {
        const parsed = parseWeekKey(key);
        const label = parsed ? `Tydzień ${parsed.week} · ${parsed.year}` : key;
        const checked = active.filter((t) => Store.isChecked(t.id, key));
        const unchecked = active.filter((t) => !Store.isChecked(t.id, key));
        const pct =
          active.length === 0 ? 0 : Math.round((checked.length / active.length) * 100);
        return `
        <details class="history-week">
          <summary>
            <span class="week-name">${escapeHtml(label)}</span>
            <span class="meta">${checked.length}/${active.length} · ${pct}%</span>
          </summary>
          <div class="week-body">
            <p class="meta" style="margin-top:0">Sprawdzone (${checked.length})</p>
            ${
              checked.length
                ? checked.map((t) => `<div class="checked">${escapeHtml(t.name)}</div>`).join("")
                : `<p class="muted">Brak</p>`
            }
            <p class="meta">Niesprawdzone (${unchecked.length})</p>
            ${
              unchecked.length
                ? unchecked
                    .map((t) => `<div class="unchecked">${escapeHtml(t.name)}</div>`)
                    .join("")
                : `<p class="muted">Brak</p>`
            }
          </div>
        </details>`;
      })
      .join("");
  }

  function renderDeleted() {
    const list = Store.deletedTerminals();
    if (list.length === 0) {
      ui.deletedList.innerHTML = "";
      ui.deletedEmpty.hidden = false;
      return;
    }
    ui.deletedEmpty.hidden = true;
    ui.deletedList.innerHTML = list
      .map(
        (t) => `
      <li class="deleted-item" data-id="${t.id}">
        <p class="name">${escapeHtml(t.name)}</p>
        <p class="meta">Lokalizacja: ${escapeHtml(t.location)} · usunięto ${formatDateTimePL(t.deletedAt)}</p>
        <button type="button" class="btn btn-primary" data-action="restore">Przywróć</button>
      </li>`
      )
      .join("");
  }

  function refreshDatalist() {
    ui.datalist.innerHTML = Store.allKnownLocations()
      .map((l) => `<option value="${escapeHtml(l)}"></option>`)
      .join("");
  }

  function renderAll() {
    Store.ensureWeek();
    updateHeader();
    applyTheme();
    refreshDatalist();
    if (currentView === "dashboard") renderDashboard();
    if (currentView === "terminals") renderTerminals();
    if (currentView === "unchecked") renderUnchecked();
    if (currentView === "history") renderHistory();
    if (currentView === "deleted") renderDeleted();
  }

  function showView(name) {
    currentView = name;
    $$(".view").forEach((v) => {
      v.hidden = v.dataset.view !== name;
    });
    $$(".nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.nav === name);
    });
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDetail(id) {
    const t = Store.findById(id);
    if (!t) return;
    ui.detailTitle.textContent = t.name;
    ui.detailDl.innerHTML = `
      <dt>ID</dt><dd>${escapeHtml(t.id)}</dd>
      <dt>Lokalizacja</dt><dd>${escapeHtml(t.location)}</dd>
      <dt>Status</dt><dd>${t.active ? "aktywny" : "usunięty"}</dd>
      <dt>Utworzono</dt><dd>${formatDateTimePL(t.createdAt)}</dd>
      <dt>Ten tydzień</dt><dd>${Store.isChecked(t.id) ? "sprawdzony" : "niesprawdzony"}</dd>
    `;
    const hist = t.locationHistory || [];
    ui.detailHistory.innerHTML = hist.length
      ? hist
          .slice()
          .reverse()
          .map(
            (h) => `
        <li>
          <span class="when">${formatDatePL(h.at)}</span>
          <strong>${escapeHtml(h.from)}</strong> → <strong>${escapeHtml(h.to)}</strong>
        </li>`
          )
          .join("")
      : `<li class="muted">Brak przeniesień</li>`;
    ui.modalDetail.showModal();
  }

  function openMove(id) {
    const t = Store.findById(id);
    if (!t) return;
    moveTargetId = id;
    ui.moveName.textContent = t.name;
    ui.moveLocation.value = t.location;
    ui.moveError.hidden = true;
    ui.modalMove.showModal();
    setTimeout(() => ui.moveLocation.focus(), 50);
  }

  // Events
  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.nav));
  });

  ui.themeToggle.addEventListener("click", () => {
    const order = ["light", "dark", "system"];
    const cur = Store.getState().theme || "system";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    Store.setTheme(next);
    applyTheme(next);
    toast(`Motyw: ${next === "system" ? "systemowy" : next === "dark" ? "ciemny" : "jasny"}`);
  });

  $$(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      Store.setTheme(btn.dataset.theme);
      applyTheme(btn.dataset.theme);
    });
  });

  ui.search.addEventListener("input", () => renderTerminals());

  ui.accordion.addEventListener("click", (e) => {
    const head = e.target.closest(".acc-head");
    if (head) {
      const item = head.closest(".acc-item");
      const loc = item.dataset.loc;
      if (item.classList.contains("open")) {
        openLocations.delete(loc);
      } else {
        openLocations.add(loc);
      }
      renderTerminals();
      return;
    }

    const row = e.target.closest(".terminal-row");
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest(".check-btn")) {
      Store.toggleChecked(id);
      renderAll();
      return;
    }

    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "move") openMove(id);
    if (action === "detail") openDetail(id);
    if (action === "delete") {
      if (confirm("Usunąć terminal z aktywnej listy? (można przywrócić)")) {
        Store.softDelete(id);
        toast("Terminal usunięty");
        renderAll();
      }
    }
  });

  ui.dashTiles.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-goto-loc]");
    if (!tile) return;
    openLocations = new Set([tile.dataset.gotoLoc]);
    showView("terminals");
  });

  $("#btn-add-open").addEventListener("click", () => {
    ui.addName.value = "";
    ui.addLocation.value = "";
    ui.addError.hidden = true;
    ui.modalAdd.showModal();
    setTimeout(() => ui.addName.focus(), 50);
  });

  $("#add-cancel").addEventListener("click", () => ui.modalAdd.close());
  $("#move-cancel").addEventListener("click", () => ui.modalMove.close());
  $("#detail-close").addEventListener("click", () => ui.modalDetail.close());

  ui.formAdd.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      Store.addTerminal(ui.addName.value, ui.addLocation.value);
      ui.modalAdd.close();
      toast("Dodano terminal");
      showView("terminals");
    } catch (err) {
      ui.addError.textContent = err.message;
      ui.addError.hidden = false;
    }
  });

  ui.formMove.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      Store.moveTerminal(moveTargetId, ui.moveLocation.value);
      ui.modalMove.close();
      toast("Przeniesiono");
      renderAll();
    } catch (err) {
      ui.moveError.textContent = err.message;
      ui.moveError.hidden = false;
    }
  });

  ui.deletedList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action=restore]");
    if (!btn) return;
    const id = btn.closest("[data-id]").dataset.id;
    try {
      Store.restore(id);
      toast("Przywrócono");
      renderAll();
    } catch (err) {
      toast(err.message);
    }
  });

  $("#btn-copy-report").addEventListener("click", async () => {
    const w = weekTitle();
    const list = Store.uncheckedThisWeek();
    const text = [
      `Niesprawdzone — ${w.label}`,
      "",
      ...list.map((t) => t.name),
      "",
      `Razem: ${list.length}`,
    ].join("\n");
    try {
      await copyText(text);
      toast("Raport skopiowany");
    } catch {
      toast("Nie udało się skopiować");
    }
  });

  $("#btn-export").addEventListener("click", () => {
    const json = Store.exportJSON();
    const blob = new Blob([json], { type: "application/json" });
    const key = currentWeekKey();
    downloadBlob(`kontrola-terminali-${key}.json`, blob);
    toast("Wyeksportowano JSON");
  });

  $("#input-import").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (!confirm("Import nadpisze wszystkie dane na tym urządzeniu. Kontynuować?")) return;
      Store.importJSON(text);
      toast("Zaimportowano");
      renderAll();
    } catch (err) {
      toast(err.message || "Błąd importu");
    }
  });

  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("Przywrócić listę startową? Usunie historię tygodni i zmiany lokalizacji na tym urządzeniu.")) {
      return;
    }
    Store.resetToSeed();
    openLocations = new Set();
    toast("Przywrócono listę startową");
    renderAll();
  });

  // Persist open accordion across re-renders within session; hydrate theme + seed
  Store.seedIfNeeded();
  Store.ensureWeek();
  applyTheme();
  showView("dashboard");
  Store.subscribe(() => {
    // keep UI in sync if another tab updates storage
  });

  window.addEventListener("storage", (e) => {
    if (e.key === Store.STORAGE_KEY) {
      location.reload();
    }
  });

  // Service worker for offline (GitHub Pages)
  if ("serviceWorker" in navigator) {
    const swUrl = new URL("sw.js", location.href);
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* offline registration optional */
    });
  }

  // Expose for debugging / console checks
  window.__TK_DEBUG = {
    Store,
    normalizeName,
    currentWeekKey,
  };
})();
