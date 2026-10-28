(function (global) {
  "use strict";

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /** ISO week year + week number (1–53). */
  function getISOWeekInfo(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  }

  function weekKey(year, week) {
    return `${year}-W${pad(week)}`;
  }

  function currentWeekKey(date = new Date()) {
    const { year, week } = getISOWeekInfo(date);
    return weekKey(year, week);
  }

  function parseWeekKey(key) {
    const m = String(key).match(/^(\d{4})-W(\d{1,2})$/i);
    if (!m) return null;
    return { year: Number(m[1]), week: Number(m[2]) };
  }

  /** Monday 00:00 UTC of ISO week. */
  function weekStartDate(year, week) {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const day = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
    return monday;
  }

  function formatDatePL(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function formatDateTimePL(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${formatDatePL(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function compareNatural(a, b) {
    return String(a).localeCompare(String(b), "pl", { numeric: true, sensitivity: "base" });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  global.TK = {
    pad,
    getISOWeekInfo,
    weekKey,
    currentWeekKey,
    parseWeekKey,
    weekStartDate,
    formatDatePL,
    formatDateTimePL,
    uid,
    normalizeName,
    escapeHtml,
    compareNatural,
    downloadBlob,
    copyText,
  };
})(window);
