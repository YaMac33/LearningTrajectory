// docs/assets/post.js
(async function () {
  // 記事ページ: docs/<category>/posts/<slug>/index.html
  // ここから docs/data/index.json へは ../../../data/index.json
  const INDEX_URL = "../../../data/index.json";

  const prevEl = document.getElementById("prevPost");
  const nextEl = document.getElementById("nextPost");
  if (!prevEl || !nextEl) return;

  // 現在の post_path を作る（Project Pagesの /<repo>/ を考慮）
  const parts = location.pathname.split("/").filter(Boolean);
  // 末尾は .../<category>/posts/<slug>/ か .../<category>/posts/<slug>/index.html
  const i = parts.lastIndexOf("posts");
  if (i <= 0 || i + 1 >= parts.length) return;

  const category = parts[i - 1];
  const slug = parts[i + 1];
  const currentPostPath = `${category}/posts/${slug}/`;

  const res = await fetch(INDEX_URL, { cache: "no-store" });
  if (!res.ok) return;
  const list = await res.json();
  if (!Array.isArray(list)) return;

  // index.json は timestamp desc 前提（build_index.jsがそうしてる想定）
  const idx = list.findIndex(x => x && x.post_path === currentPostPath);
  if (idx === -1) return;

  // 「前」= 1つ新しい（indexが小さい方）、「次」= 1つ古い（indexが大きい方）
  const prev = list[idx - 1];
  const next = list[idx + 1];

  if (prev && prev.post_path) {
    prevEl.href = `../../../${prev.post_path}`;
    prevEl.textContent = `← 前：${prev.title || "前の記事"}`;
    prevEl.style.display = "";
  }
  if (next && next.post_path) {
    nextEl.href = `../../../${next.post_path}`;
    nextEl.textContent = `次：${next.title || "次の記事"} →`;
    nextEl.style.display = "";
  }

  // 問い合わせフォーム（事前入力URL）
  const CONTACT_FORM_BASE =
  "https://docs.google.com/forms/d/e/1FAIpQLSfm8p6se9jxdtNQDq2u_dlYmuISoNXNf-V7NQeLzf0247ln-w/viewform";

  const PAGE_URL_ENTRY_ID = "entry.871328730";

  const contactLink = document.getElementById("contactLink");
  if (contactLink) {
  const pageUrl = location.href;
  contactLink.href =
    `${CONTACT_FORM_BASE}?${PAGE_URL_ENTRY_ID}=` +
    encodeURIComponent(pageUrl);
 }
})();
