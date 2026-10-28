/**
 * Kopie zapasowe przez GitHub Contents API (bez zewnętrznego serwera).
 * Token PAT trzymany osobno w localStorage — nigdy w eksporcie JSON aplikacji.
 */
(function (global) {
  "use strict";

  const CONFIG_KEY = "TERMINAL_KONTROLA_GITHUB_V1";
  const API = "https://api.github.com";

  function defaults() {
    const guessed = guessRepoFromLocation();
    return {
      token: "",
      owner: guessed.owner || "",
      repo: guessed.repo || "",
      branch: "main",
      path: "kontrola-terminali/backups",
    };
  }

  function guessRepoFromLocation() {
    // https://USER.github.io/REPO/... → { owner: USER, repo: REPO }
    const host = location.hostname || "";
    const m = host.match(/^([a-z0-9-]+)\.github\.io$/i);
    if (!m) return { owner: "", repo: "" };
    const owner = m[1];
    const parts = location.pathname.split("/").filter(Boolean);
    const repo = parts[0] || "";
    return { owner, repo };
  }

  function loadConfig() {
    const base = defaults();
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return base;
      const data = JSON.parse(raw);
      return {
        token: String(data.token || ""),
        owner: String(data.owner || base.owner || "").trim(),
        repo: String(data.repo || base.repo || "").trim(),
        branch: String(data.branch || "main").trim() || "main",
        path: String(data.path || base.path).replace(/^\/+|\/+$/g, "") || base.path,
      };
    } catch {
      return base;
    }
  }

  function saveConfig(partial) {
    const next = Object.assign(loadConfig(), partial || {});
    next.owner = String(next.owner || "").trim();
    next.repo = String(next.repo || "").trim();
    next.branch = String(next.branch || "main").trim() || "main";
    next.path = String(next.path || "kontrola-terminali/backups").replace(/^\/+|\/+$/g, "");
    next.token = String(next.token || "");
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function clearToken() {
    return saveConfig({ token: "" });
  }

  function requireConfig() {
    const cfg = loadConfig();
    if (!cfg.token) throw new Error("Brak tokena GitHub (PAT). Dodaj go w Ustawieniach.");
    if (!cfg.owner || !cfg.repo) throw new Error("Podaj właściciela i nazwę repozytorium.");
    return cfg;
  }

  async function api(path, options = {}) {
    const cfg = requireConfig();
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }
    if (!res.ok) {
      const msg = (body && body.message) || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error("Token nieprawidłowy lub wygasł (401).");
      if (res.status === 403) throw new Error(`Brak uprawnień (403): ${msg}`);
      if (res.status === 404) throw new Error(`Nie znaleziono (404): ${msg}`);
      throw new Error(msg);
    }
    return body;
  }

  function toBase64(str) {
    // UTF-8 safe
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  function fromBase64(b64) {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function sanitizeLabel(label) {
    return String(label || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
  }

  function buildFilename(label) {
    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace(/Z$/, "Z");
    const week = global.TK ? global.TK.currentWeekKey() : "week";
    const tag = sanitizeLabel(label);
    return tag ? `${week}_${tag}_${stamp}.json` : `${week}_${stamp}.json`;
  }

  async function getFileMeta(fullPath, branch) {
    const cfg = loadConfig();
    const br = branch || cfg.branch;
    try {
      return await api(
        `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(fullPath)}?ref=${encodeURIComponent(br)}`
      );
    } catch (e) {
      if (String(e.message).includes("404")) return null;
      throw e;
    }
  }

  async function listBackups() {
    const cfg = requireConfig();
    const dir = cfg.path;
    try {
      const data = await api(
        `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(dir)}?ref=${encodeURIComponent(cfg.branch)}`
      );
      if (!Array.isArray(data)) return [];
      return data
        .filter((f) => f.type === "file" && /\.json$/i.test(f.name) && f.name !== ".gitkeep")
        .map((f) => ({
          name: f.name,
          path: f.path,
          sha: f.sha,
          size: f.size,
          url: f.html_url,
          downloadUrl: f.download_url,
        }))
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch (e) {
      if (String(e.message).includes("404")) return [];
      throw e;
    }
  }

  async function downloadBackup(item) {
    const cfg = requireConfig();
    // Prefer Contents API (works for private repos with token)
    const meta = await api(
      `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(item.path)}?ref=${encodeURIComponent(cfg.branch)}`
    );
    if (!meta || !meta.content) throw new Error("Pusty plik backupu.");
    return fromBase64(meta.content.replace(/\n/g, ""));
  }

  async function uploadBackup(jsonText, label) {
    const cfg = requireConfig();
    const filename = buildFilename(label);
    const fullPath = `${cfg.path}/${filename}`;
    const message = `backup(kontrola-terminali): ${filename}`;
    const body = {
      message,
      content: toBase64(jsonText),
      branch: cfg.branch,
    };
    // rarely needed for new timestamped files; keep for overwrite safety
    const existing = await getFileMeta(fullPath, cfg.branch);
    if (existing && existing.sha) body.sha = existing.sha;

    const result = await api(`/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURI(fullPath)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return {
      name: filename,
      path: fullPath,
      htmlUrl: result.content && result.content.html_url,
      commitUrl: result.commit && result.commit.html_url,
    };
  }

  async function testConnection() {
    const cfg = requireConfig();
    const repo = await api(`/repos/${cfg.owner}/${cfg.repo}`);
    // light contents probe
    await listBackups();
    return {
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      branch: cfg.branch,
      path: cfg.path,
    };
  }

  global.GitHubBackup = {
    CONFIG_KEY,
    loadConfig,
    saveConfig,
    clearToken,
    guessRepoFromLocation,
    listBackups,
    downloadBackup,
    uploadBackup,
    testConnection,
    buildFilename,
  };
})(window);
