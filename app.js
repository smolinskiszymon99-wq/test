(function () {
  "use strict";

  const FOLDER_MIME = "application/vnd.google-apps.folder";
  const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
  const API_BASE = "https://www.googleapis.com/drive/v3/files";

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $("gallery-title"),
    subtitle: $("gallery-subtitle"),
    count: $("photo-count"),
    settingsToggle: $("settings-toggle"),
    settingsPanel: $("settings-panel"),
    settingsForm: $("settings-form"),
    settingsCancel: $("settings-cancel"),
    inputFolder: $("input-folder"),
    inputKey: $("input-key"),
    toolbar: $("toolbar"),
    search: $("search"),
    sort: $("sort"),
    status: $("status"),
    gallery: $("gallery"),
    loadMore: $("load-more"),
    lightbox: $("lightbox"),
    lbImage: $("lb-image"),
    lbSpinner: $("lb-spinner"),
    lbName: $("lb-name"),
    lbCounter: $("lb-counter"),
    lbOpen: $("lb-open"),
    lbDownload: $("lb-download"),
    lbClose: $("lb-close"),
    lbPrev: $("lb-prev"),
    lbNext: $("lb-next"),
  };

  const defaults = {
    title: "Galeria zdjęć",
    subtitle: "",
    folderId: "",
    apiKey: "",
    includeSubfolders: true,
    pageSize: 60,
    files: [],
  };

  const config = Object.assign({}, defaults, window.GALLERY_CONFIG || {});
  const params = new URLSearchParams(location.search);
  if (params.get("folder")) config.folderId = params.get("folder");
  if (params.get("key")) config.apiKey = params.get("key");
  config.folderId = extractId(config.folderId);
  config.pageSize = Math.min(Math.max(parseInt(config.pageSize, 10) || 60, 1), 1000);

  const state = {
    photos: [],
    filtered: [],
    queue: [], // { folderId, pageToken }
    loading: false,
    lightboxIndex: -1,
    observer: null,
  };

  // ---------- helpers ----------

  function extractId(input) {
    if (!input) return "";
    const value = String(input).trim();
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]{10,})/,
      /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
      /[?&]id=([a-zA-Z0-9_-]{10,})/,
      /\/d\/([a-zA-Z0-9_-]{10,})/,
    ];
    for (const re of patterns) {
      const m = value.match(re);
      if (m) return m[1];
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "");
  }

  function thumbUrl(id, width) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
  }

  function fallbackUrl(id, width) {
    return `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${width}`;
  }

  function viewUrl(id) {
    return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
  }

  function downloadUrl(id) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("pl-PL", { year: "numeric", month: "short", day: "numeric" });
  }

  function setStatus(html, type) {
    els.status.innerHTML = html || "";
    els.status.className = "status" + (type ? ` status-${type}` : "");
    els.status.hidden = !html;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- rendering ----------

  function renderSkeletons(n) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      d.className = "card skeleton";
      frag.appendChild(d);
    }
    els.gallery.appendChild(frag);
  }

  function clearSkeletons() {
    els.gallery.querySelectorAll(".skeleton").forEach((n) => n.remove());
  }

  function applyFilterSort() {
    const q = els.search.value.trim().toLowerCase();
    const [field, dir] = els.sort.value.split("-");
    const list = state.photos.filter((p) => !q || p.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      let r;
      if (field === "name") r = a.name.localeCompare(b.name, "pl", { sensitivity: "base", numeric: true });
      else r = (a.createdTime || "").localeCompare(b.createdTime || "");
      return dir === "asc" ? r : -r;
    });
    state.filtered = list;
    renderGallery();
  }

  function renderGallery() {
    els.gallery.innerHTML = "";
    if (state.observer) state.observer.disconnect();

    const frag = document.createDocumentFragment();
    state.filtered.forEach((photo, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.dataset.index = index;
      card.setAttribute("aria-label", photo.name);

      const img = document.createElement("img");
      img.alt = photo.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.dataset.src = thumbUrl(photo.id, 600);
      img.dataset.fallback = fallbackUrl(photo.id, 600);
      if (photo.width && photo.height) {
        img.style.aspectRatio = `${photo.width} / ${photo.height}`;
      }
      img.addEventListener("load", () => card.classList.add("loaded"));
      img.addEventListener("error", onImageError);

      const caption = document.createElement("span");
      caption.className = "card-caption";
      caption.innerHTML = `<span class="card-name">${escapeHtml(photo.name)}</span>` +
        (photo.createdTime ? `<span class="card-date">${escapeHtml(formatDate(photo.createdTime))}</span>` : "");

      card.appendChild(img);
      card.appendChild(caption);
      card.addEventListener("click", () => openLightbox(index));
      frag.appendChild(card);
    });
    els.gallery.appendChild(frag);
    observeImages();

    els.count.textContent = state.photos.length
      ? `${state.filtered.length} / ${state.photos.length} zdjęć`
      : "";
    els.count.hidden = !state.photos.length;

    if (!state.filtered.length && state.photos.length) {
      setStatus("Brak zdjęć pasujących do wyszukiwania.", "info");
    } else if (state.photos.length) {
      setStatus("");
    }
  }

  function onImageError(e) {
    const img = e.currentTarget;
    if (img.dataset.fallback && img.src !== img.dataset.fallback) {
      img.src = img.dataset.fallback;
      delete img.dataset.fallback;
    } else {
      img.closest(".card")?.classList.add("broken");
    }
  }

  function observeImages() {
    const imgs = els.gallery.querySelectorAll("img[data-src]");
    if (!("IntersectionObserver" in window)) {
      imgs.forEach((img) => { img.src = img.dataset.src; delete img.dataset.src; });
      return;
    }
    state.observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        img.src = img.dataset.src;
        delete img.dataset.src;
        obs.unobserve(img);
      });
    }, { rootMargin: "400px 0px" });
    imgs.forEach((img) => state.observer.observe(img));
  }

  // ---------- Google Drive API ----------

  async function driveList(query, pageToken, extraFields) {
    const url = new URL(API_BASE);
    url.searchParams.set("q", query);
    url.searchParams.set("key", config.apiKey);
    url.searchParams.set("pageSize", String(config.pageSize));
    url.searchParams.set("orderBy", "createdTime desc");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("fields", `nextPageToken,files(id,name,mimeType,createdTime,${extraFields || ""}imageMediaMetadata(width,height),shortcutDetails(targetId,targetMimeType))`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        if (body.error && body.error.message) message = body.error.message;
      } catch (_) { /* ignore */ }
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function mapFile(f) {
    const isShortcut = f.mimeType === SHORTCUT_MIME && f.shortcutDetails;
    const id = isShortcut ? f.shortcutDetails.targetId : f.id;
    const mime = isShortcut ? f.shortcutDetails.targetMimeType : f.mimeType;
    if (!mime || !mime.startsWith("image/")) return null;
    const meta = f.imageMediaMetadata || {};
    return {
      id,
      name: f.name || "Bez nazwy",
      createdTime: f.createdTime || "",
      width: meta.width,
      height: meta.height,
    };
  }

  async function loadNextPage() {
    if (state.loading || !state.queue.length) return;
    state.loading = true;
    els.loadMore.disabled = true;
    els.loadMore.textContent = "Wczytywanie…";
    if (!state.photos.length) renderSkeletons(12);

    const job = state.queue[0];
    try {
      const query = `'${job.folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = '${FOLDER_MIME}' or mimeType = '${SHORTCUT_MIME}')`;
      const data = await driveList(query, job.pageToken);
      const files = data.files || [];

      for (const f of files) {
        if (f.mimeType === FOLDER_MIME) {
          if (config.includeSubfolders) state.queue.push({ folderId: f.id, pageToken: null });
          continue;
        }
        if (f.mimeType === SHORTCUT_MIME && f.shortcutDetails && f.shortcutDetails.targetMimeType === FOLDER_MIME) {
          if (config.includeSubfolders) state.queue.push({ folderId: f.shortcutDetails.targetId, pageToken: null });
          continue;
        }
        const photo = mapFile(f);
        if (photo && !state.photos.some((p) => p.id === photo.id)) state.photos.push(photo);
      }

      if (data.nextPageToken) job.pageToken = data.nextPageToken;
      else state.queue.shift();

      clearSkeletons();
      applyFilterSort();

      // Jeśli pierwsza strona nie zawierała zdjęć (np. sam folder z podfolderami), pobierz kolejną automatycznie.
      if (!state.photos.length && state.queue.length) {
        state.loading = false;
        return loadNextPage();
      }

      if (!state.photos.length) {
        setStatus("W tym folderze nie znaleziono żadnych zdjęć.", "info");
      }
    } catch (err) {
      clearSkeletons();
      state.queue = [];
      showApiError(err);
    } finally {
      state.loading = false;
      els.loadMore.disabled = false;
      els.loadMore.textContent = "Wczytaj więcej";
      els.loadMore.hidden = !state.queue.length;
      els.toolbar.hidden = !state.photos.length;
    }
  }

  function showApiError(err) {
    const msg = escapeHtml(err.message || String(err));
    let hint = "";
    if (err.status === 400) {
      hint = "Sprawdź, czy klucz API jest poprawny i czy ID folderu zostało wpisane bez błędów.";
    } else if (err.status === 403) {
      hint = "Upewnij się, że w Google Cloud Console włączono <strong>Google Drive API</strong>, a ograniczenia klucza (domeny/referer) obejmują adres tej strony.";
    } else if (err.status === 404) {
      hint = "Folder nie istnieje lub nie jest udostępniony publicznie. Ustaw udostępnianie na „Każdy, kto ma link”.";
    } else if (!err.status) {
      hint = "Nie udało się połączyć z Google. Sprawdź połączenie z internetem.";
    }
    setStatus(
      `<strong>Nie udało się pobrać zdjęć.</strong><br>${msg}` + (hint ? `<br><span class="muted">${hint}</span>` : ""),
      "error"
    );
  }

  // ---------- manual mode ----------

  function loadManualFiles() {
    const list = Array.isArray(config.files) ? config.files : [];
    state.photos = list
      .map((entry, i) => {
        const raw = typeof entry === "string" ? entry : entry && (entry.id || entry.url);
        const id = extractId(raw);
        if (!id) return null;
        return {
          id,
          name: (entry && entry.name) || `Zdjęcie ${i + 1}`,
          createdTime: (entry && entry.createdTime) || "",
        };
      })
      .filter(Boolean);
    els.toolbar.hidden = !state.photos.length;
    applyFilterSort();
    if (!state.photos.length) {
      showWelcome();
    }
  }

  function showWelcome() {
    setStatus(
      `<strong>Galeria nie jest jeszcze skonfigurowana.</strong><br>
      Kliknij <em>Ustawienia</em> i podaj link do publicznego folderu Google Drive oraz klucz API,
      albo uzupełnij plik <code>config.js</code> w repozytorium.`,
      "info"
    );
    openSettings();
  }

  // ---------- settings ----------

  function openSettings() {
    els.settingsPanel.hidden = false;
    els.settingsToggle.setAttribute("aria-expanded", "true");
    els.inputFolder.value = config.folderId || "";
    els.inputKey.value = config.apiKey || "";
    els.inputFolder.focus();
  }

  function closeSettings() {
    els.settingsPanel.hidden = true;
    els.settingsToggle.setAttribute("aria-expanded", "false");
  }

  els.settingsToggle.addEventListener("click", () => {
    if (els.settingsPanel.hidden) openSettings(); else closeSettings();
  });
  els.settingsCancel.addEventListener("click", closeSettings);
  els.settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const folder = extractId(els.inputFolder.value);
    const key = els.inputKey.value.trim();
    const url = new URL(location.href);
    if (folder) url.searchParams.set("folder", folder); else url.searchParams.delete("folder");
    if (key) url.searchParams.set("key", key); else url.searchParams.delete("key");
    location.href = url.toString();
  });

  // ---------- lightbox ----------

  function openLightbox(index) {
    if (index < 0 || index >= state.filtered.length) return;
    state.lightboxIndex = index;
    const photo = state.filtered[index];
    els.lbName.textContent = photo.name;
    els.lbCounter.textContent = `${index + 1} / ${state.filtered.length}`;
    els.lbOpen.href = viewUrl(photo.id);
    els.lbDownload.href = downloadUrl(photo.id);
    els.lbImage.alt = photo.name;
    els.lbImage.classList.remove("visible");
    els.lbSpinner.hidden = false;
    els.lbImage.onerror = () => {
      const fb = fallbackUrl(photo.id, 2000);
      if (els.lbImage.src !== fb) els.lbImage.src = fb;
      else els.lbSpinner.hidden = true;
    };
    els.lbImage.onload = () => {
      els.lbSpinner.hidden = true;
      els.lbImage.classList.add("visible");
    };
    els.lbImage.src = thumbUrl(photo.id, 2000);
    els.lightbox.hidden = false;
    document.body.classList.add("no-scroll");
    els.lbPrev.disabled = index === 0;
    els.lbNext.disabled = index === state.filtered.length - 1;

    const preload = (i) => {
      if (i >= 0 && i < state.filtered.length) {
        const img = new Image();
        img.src = thumbUrl(state.filtered[i].id, 2000);
      }
    };
    preload(index + 1);
    preload(index - 1);
  }

  function closeLightbox() {
    els.lightbox.hidden = true;
    els.lbImage.src = "";
    document.body.classList.remove("no-scroll");
    const card = els.gallery.querySelector(`.card[data-index="${state.lightboxIndex}"]`);
    if (card) card.focus();
    state.lightboxIndex = -1;
  }

  els.lbClose.addEventListener("click", closeLightbox);
  els.lbPrev.addEventListener("click", () => openLightbox(state.lightboxIndex - 1));
  els.lbNext.addEventListener("click", () => openLightbox(state.lightboxIndex + 1));
  els.lightbox.addEventListener("click", (e) => {
    if (e.target === els.lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (els.lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") openLightbox(state.lightboxIndex - 1);
    else if (e.key === "ArrowRight") openLightbox(state.lightboxIndex + 1);
  });

  let touchStartX = null;
  els.lightbox.addEventListener("touchstart", (e) => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
  els.lightbox.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 50) return;
    openLightbox(state.lightboxIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // ---------- toolbar ----------

  let searchTimer;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilterSort, 150);
  });
  els.sort.addEventListener("change", applyFilterSort);
  els.loadMore.addEventListener("click", loadNextPage);

  // ---------- init ----------

  function init() {
    if (config.title) {
      els.title.textContent = config.title;
      document.title = config.title;
    }
    els.subtitle.textContent = config.subtitle || "";
    els.subtitle.hidden = !config.subtitle;

    if (config.apiKey && config.folderId) {
      state.queue = [{ folderId: config.folderId, pageToken: null }];
      loadNextPage();
    } else if (config.apiKey && !config.folderId) {
      setStatus("Podano klucz API, ale brakuje ID folderu Google Drive.", "error");
      openSettings();
    } else {
      loadManualFiles();
    }
  }

  init();
})();
