(() => {
  "use strict";

  const {
    randomSeed,
    ymd,
    formatNum,
    computeDistribution,
  } = window.WaterMetersEngine;

  const HISTORY_KEY = "liczniki-wody-historia-v1";
  const HISTORY_LIMIT = 20;

  const form = document.getElementById("calc-form");
  const formError = document.getElementById("form-error");
  const resultsSection = document.getElementById("results");
  const resultsBody = document.getElementById("results-body");
  const resultsSummary = document.getElementById("results-summary");
  const btnReroll = document.getElementById("btn-reroll");
  const btnExport = document.getElementById("btn-export");
  const btnHistory = document.getElementById("btn-history");
  const historyPanel = document.getElementById("history-panel");
  const historyList = document.getElementById("history-list");
  const historyEmpty = document.getElementById("history-empty");
  const btnClearHistory = document.getElementById("btn-clear-history");

  let lastRows = null;

  function parseNum(el) {
    const v = Number(el.value);
    return Number.isFinite(v) ? v : NaN;
  }

  function showError(msg) {
    formError.hidden = !msg;
    formError.textContent = msg || "";
  }

  function readInputs() {
    const startVal = document.getElementById("date-start").value;
    const endVal = document.getElementById("date-end").value;
    if (!startVal || !endVal) throw new Error("Podaj datę początkową i końcową.");

    const startDate = new Date(startVal + "T00:00:00");
    const endDate = new Date(endVal + "T00:00:00");
    if (endDate < startDate) {
      throw new Error("Data końcowa nie może być wcześniejsza niż początkowa.");
    }

    const m1Start = parseNum(document.getElementById("m1-start"));
    const m1End = parseNum(document.getElementById("m1-end"));
    const m2Start = parseNum(document.getElementById("m2-start"));
    const m2End = parseNum(document.getElementById("m2-end"));
    const m3Start = parseNum(document.getElementById("m3-start"));
    const m3End = parseNum(document.getElementById("m3-end"));

    if ([m1Start, m1End, m2Start, m2End, m3Start, m3End].some((v) => Number.isNaN(v))) {
      throw new Error("Uzupełnij wszystkie stany liczników liczbami.");
    }

    const maxRaw = document.getElementById("max-m2").value;
    let maxM2 = null;
    if (maxRaw !== "") {
      maxM2 = Number(maxRaw);
      if (!Number.isFinite(maxM2) || maxM2 <= 0) {
        throw new Error("Maksymalne zużycie licznika 2 musi być liczbą dodatnią.");
      }
    }

    return {
      startDate,
      endDate,
      startVal,
      endVal,
      m1Start,
      m1End,
      m2Start,
      m2End,
      m3Start,
      m3End,
      maxM2,
    };
  }

  function fillInputs(data) {
    document.getElementById("date-start").value = data.startVal;
    document.getElementById("date-end").value = data.endVal;
    document.getElementById("m1-start").value = data.m1Start;
    document.getElementById("m1-end").value = data.m1End;
    document.getElementById("m2-start").value = data.m2Start;
    document.getElementById("m2-end").value = data.m2End;
    document.getElementById("m3-start").value = data.m3Start;
    document.getElementById("m3-end").value = data.m3End;
    document.getElementById("max-m2").value = data.maxM2 == null ? "" : data.maxM2;
  }

  function renderResults(rows, inputs, totals) {
    resultsBody.innerHTML = "";
    let selected = null;

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (row.isLast) tr.classList.add("is-last");

      const dateCell = document.createElement("td");
      dateCell.innerHTML = `${row.date}<span class="dow">${row.dow}${
        row.holiday ? '<span class="tag">święto</span>' : ""
      }</span>`;

      const cells = [
        dateCell,
        formatNum(row.m1),
        formatNum(row.m2),
        row.consumption == null ? "—" : formatNum(row.consumption),
        formatNum(row.m3),
      ];

      cells.forEach((content, idx) => {
        if (idx === 0) {
          tr.appendChild(content);
        } else {
          const td = document.createElement("td");
          td.textContent = content;
          if (idx === 3 && row.consumption != null) {
            td.title = `Δ L1: ${formatNum(row.deltaM1 ?? 0)} · Δ L3: ${formatNum(row.deltaM3 ?? 0)}`;
          }
          tr.appendChild(td);
        }
      });

      tr.addEventListener("click", () => {
        if (selected) selected.classList.remove("is-selected");
        if (selected === tr) {
          selected = null;
          return;
        }
        tr.classList.add("is-selected");
        selected = tr;
      });

      resultsBody.appendChild(tr);
    });

    const totalM2 = totals[1];
    const days = rows.length - 1;
    const avg = days > 0 ? totalM2 / days : 0;
    resultsSummary.textContent =
      `Okres ${inputs.startVal} → ${inputs.endVal} · ${days} dni · ` +
      `zużycie L2 łącznie ${formatNum(totalM2)} · średnio ${formatNum(avg)} / dzień` +
      (inputs.maxM2 != null ? ` · limit L2: ${formatNum(inputs.maxM2)} / dzień` : "");

    resultsSection.hidden = false;
    btnReroll.hidden = false;
    btnExport.hidden = false;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveHistory(items) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
  }

  function formatWhen(iso) {
    try {
      return new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Warsaw",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function renderHistory() {
    const items = loadHistory();
    historyList.innerHTML = "";
    historyEmpty.hidden = items.length > 0;

    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      const totalM2 = (item.totals || [0, 0, 0])[1] || 0;
      btn.innerHTML =
        `<strong>${item.inputs.startVal} → ${item.inputs.endVal}</strong>` +
        `<span class="meta">${formatWhen(item.createdAt)} · L2 łącznie ${formatNum(
          totalM2
        )}</span>`;
      btn.addEventListener("click", () => {
        fillInputs(item.inputs);
        lastRows = item.rows;
        renderResults(item.rows, item.inputs, item.totals || [0, 0, 0]);
        showError("");
        historyPanel.hidden = true;
        btnHistory.setAttribute("aria-expanded", "false");
        window.scrollTo({ top: resultsSection.offsetTop - 24, behavior: "smooth" });
      });
      li.appendChild(btn);
      historyList.appendChild(li);
    });
  }

  function pushHistory(inputs, rows, seed, totals) {
    const items = loadHistory();
    items.unshift({
      id: `${Date.now()}-${seed}`,
      createdAt: new Date().toISOString(),
      seed,
      inputs: {
        startVal: inputs.startVal,
        endVal: inputs.endVal,
        m1Start: inputs.m1Start,
        m1End: inputs.m1End,
        m2Start: inputs.m2Start,
        m2End: inputs.m2End,
        m3Start: inputs.m3Start,
        m3End: inputs.m3End,
        maxM2: inputs.maxM2,
      },
      totals,
      rows,
    });
    saveHistory(items);
    renderHistory();
  }

  function exportCsv(rows) {
    const header = [
      "Data",
      "Dzień",
      "Swieto",
      "Stan_licznika_1",
      "Stan_licznika_2",
      "Zuzycie_licznik_2",
      "Stan_licznika_3",
      "Przyrost_licznik_1",
      "Przyrost_licznik_3",
    ];
    const lines = [header.join(";")];
    rows.forEach((r) => {
      lines.push(
        [
          r.date,
          r.dow,
          r.holiday ? "tak" : "nie",
          formatNum(r.m1),
          formatNum(r.m2),
          r.consumption == null ? "" : formatNum(r.consumption),
          formatNum(r.m3),
          r.deltaM1 == null ? "" : formatNum(r.deltaM1),
          r.deltaM3 == null ? "" : formatNum(r.deltaM3),
        ].join(";")
      );
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zuzycie-wody-${rows[0]?.date || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function runCalculation({ saveHistoryFlag = true, seed = randomSeed() } = {}) {
    showError("");
    try {
      const inputs = readInputs();
      const { rows, totals } = computeDistribution(inputs, seed);
      lastRows = rows;
      renderResults(rows, inputs, totals);
      if (saveHistoryFlag) pushHistory(inputs, rows, seed, totals);
    } catch (err) {
      showError(err.message || String(err));
      resultsSection.hidden = true;
      btnReroll.hidden = true;
      btnExport.hidden = true;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCalculation({ saveHistoryFlag: true });
  });

  btnReroll.addEventListener("click", () => {
    runCalculation({ saveHistoryFlag: true, seed: randomSeed() });
  });

  btnExport.addEventListener("click", () => {
    if (lastRows) exportCsv(lastRows);
  });

  btnHistory.addEventListener("click", () => {
    const open = historyPanel.hidden;
    historyPanel.hidden = !open;
    btnHistory.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) renderHistory();
  });

  btnClearHistory.addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById("date-start").value = ymd(monthStart);
  document.getElementById("date-end").value = ymd(today);

  renderHistory();
})();
