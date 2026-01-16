// docs/assets/app.js
// =====================================================
// Top page renderer:
// - Fetch ./data/index.json
// - Render recent posts (latest N + Load more)
// - Render genre/category pills
// - Lightweight search (title / tags / category / genre)
// =====================================================

(() => {
  const DATA_URL = "./data/index.json";
  const RECENT_N = Number(document.getElementById("recent-count")?.textContent) || 5;

  const elRecentList = document.getElementById("recent-list");
  const elRecentErr = document.getElementById("recent-error");
  const elGenreLinks = document.getElementById("genre-links");
  const elCategoryLinks = document.getElementById("category-links");
  const elLastUpdated = document.getElementById("last-updated");
  const btnLoadMore = document.getElementById("btn-load-more");

  // ---- utilities ----
  const toText = (v) => (v == null ? "" : String(v));

  const normalizeKey = (v) =>
    toText(v)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "");

  const safePath = (p) => {
    const s = toText(p).trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    return s.replace(/^\/*/, "");
  };

  const makeUrl = (relativePath) =>
    new URL(relativePath, window.location.href).toString();

  const parseDateForSort = (s) => {
    const t = toText(s).trim();
    const ts = Date.parse(t);
    return Number.isFinite(ts) ? ts : -Infinity;
  };

  const clearChildren = (el) => {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  };

  const showError = (msg) => {
    if (!elRecentErr) return;
    elRecentErr.style.display = "block";
    elRecentErr.textContent = msg;
  };

  const hideError = () => {
    if (!elRecentErr) return;
    elRecentErr.style.display = "none";
    elRecentErr.textContent = "";
  };

  // ---- renderers ----
  function buildUniqueList(items, field) {
    const map = new Map();
    items.forEach((it) => {
      const raw = toText(it[field]).trim();
      if (!raw) return;
      const key = normalizeKey(raw);
      if (!map.has(key)) map.set(key, raw);
    });
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "ja"));
  }

  function renderPills(el, items, baseDir) {
    if (!el) return;
    clearChildren(el);
    items.forEach(({ key, label }) => {
      const a = document.createElement("a");
      a.className = "pill";
      a.href = makeUrl(`${baseDir}/${key}/`);
      a.textContent = label;
      el.appendChild(a);
    });
  }

  function setLastUpdated(items) {
    if (!elLastUpdated) return;
    const newest = items
      .map((it) => ({ d: it.date, t: parseDateForSort(it.date) }))
      .sort((a, b) => b.t - a.t)[0];
    elLastUpdated.textContent = newest?.d
      ? `Last update: ${newest.d}`
      : "Last update: (unknown)";
  }

  // ---- Search (Lightweight) ----
  function initSearch(allItems) {
    const input = document.getElementById("search-input");
    const tagBox = document.getElementById("search-tags");
    const resultBox = document.getElementById("search-results");
    if (!input || !tagBox || !resultBox) return;

    const normalize = (s) => toText(s).toLowerCase();

    const buildHaystack = (it) =>
      normalize([
        it.title,
        it.genre,
        it.category,
        ...(Array.isArray(it.tags) ? it.tags : [])
      ].join(" "));

    // build tag buttons
    const tagSet = new Set();
    allItems.forEach(
      (it) => Array.isArray(it.tags) && it.tags.forEach((t) => tagSet.add(t))
    );

    [...tagSet].sort().forEach((tag) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `#${tag}`;
      btn.onclick = () => {
        input.value = tag;
        runSearch();
      };
      tagBox.appendChild(btn);
    });

    function renderResults(items) {
      resultBox.innerHTML = "";
      if (!items.length) {
        resultBox.innerHTML = `<div class="muted">該当する記事はありません</div>`;
        return;
      }
      const ul = document.createElement("ul");
      ul.style.paddingLeft = "18px";
      items.slice(0, 20).forEach((it) => {
        const li = document.createElement("li");
        li.style.margin = "8px 0";
        const a = document.createElement("a");
        a.href = it.path ? makeUrl(it.path) : "#";
        a.textContent = it.title;
        li.appendChild(a);
        ul.appendChild(li);
      });
      resultBox.appendChild(ul);
    }

    function runSearch() {
      const q = normalize(input.value).trim();
      if (!q) {
        resultBox.innerHTML = "";
        return;
      }
      const terms = q.split(/\s+/);
      const matched = allItems.filter((it) =>
        terms.every((t) => buildHaystack(it).includes(t))
      );
      renderResults(matched);
    }

    input.addEventListener("input", runSearch);
  }

  // ---- main ----
  async function main() {
    try {
      hideError();
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to fetch ${DATA_URL}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("index.json must be an array");

      const sorted = [...data].sort(
        (a, b) => parseDateForSort(b.date) - parseDateForSort(a.date)
      );

      // --- recent list with "load more" ---
      let visibleCount = RECENT_N;

      function renderRecentLimited(items) {
        if (!elRecentList) return;
        clearChildren(elRecentList);

        if (!items.length) {
          const li = document.createElement("li");
          li.className = "muted";
          li.textContent = "まだ記事がありません";
          elRecentList.appendChild(li);
          if (btnLoadMore) btnLoadMore.style.display = "none";
          return;
        }

        items.slice(0, visibleCount).forEach((it) => {
          const li = document.createElement("li");

          const a = document.createElement("a");
          a.href = it.path ? makeUrl(it.path) : "#";
          a.textContent = it.title || "(no title)";

          const meta = document.createElement("div");
          meta.className = "muted";
          meta.textContent = [
            it.date || null,
            it.category || null
          ].filter(Boolean).join(" / ");

          li.appendChild(a);
          li.appendChild(meta);
          elRecentList.appendChild(li);
        });

        if (btnLoadMore) {
          btnLoadMore.style.display =
            visibleCount >= items.length ? "none" : "inline-block";
        }
      }

      renderRecentLimited(sorted);

      if (btnLoadMore) {
        btnLoadMore.onclick = () => {
          visibleCount += 20;
          renderRecentLimited(sorted);
        };
      }

      // pills & meta
      renderPills(elGenreLinks, buildUniqueList(sorted, "genre"), "./genre");
      renderPills(
        elCategoryLinks,
        buildUniqueList(sorted, "category"),
        "./category"
      );
      setLastUpdated(sorted);

      // search init
      initSearch(sorted);
    } catch (e) {
      console.error(e);
      showError("読み込みに失敗しました");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
