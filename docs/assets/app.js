document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('article-list');
  const countLabel = document.getElementById('article-count');

  if (!listContainer || !countLabel) {
    console.error('Missing DOM nodes:', { listContainer, countLabel });
    return;
  }

  const DATA_URL = './data/index.json';

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ja-JP', options);
  };

  const init = async () => {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      console.log('fetch', DATA_URL, response.status);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const articles = await response.json();
      console.log('articles[0]', articles?.[0]);

      if (!Array.isArray(articles) || articles.length === 0) {
        countLabel.textContent = '0 posts';
        listContainer.innerHTML = '<p style="color:#888;">記事はまだありません。</p>';
        return;
      }

      // 新しい順（date がなければ 0 扱い）
      articles.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      countLabel.textContent = `${articles.length} posts`;

      // ここに「2」を組み込み（1の安全ガード・演出も維持）
      const html = articles.map((article, index) => {
        const delayStyle = `animation-delay: ${index * 0.05}s`;

        // 1. タグの処理（tags は配列前提だが念のためガード）
        const tags = Array.isArray(article.tags) ? article.tags : [];
        const tagsHtml = tags.map(tag => `<span class="tag">#${tag}</span>`).join('');

        // 2. リンク先の作成（dir を使う）
        const linkPath = `./${article.dir}/`;

        // 3. HTMLテンプレート
        return `
          <article class="article-card fade-in" style="${delayStyle}" onclick="location.href='${linkPath}'">
            <div class="card-header">
              <!-- タイトル -->
              <h3 class="card-title">
                <a href="${linkPath}">${article.title ?? '(no title)'}</a>
              </h3>

              <!-- 日付 -->
              <time class="card-date" datetime="${article.date ?? ''}">
                ${article.date ? formatDate(article.date) : ''}
              </time>
            </div>

            <!-- 要約 -->
            <p class="card-summary">
              ${article.summary ?? ''}
            </p>

            <div class="card-footer">
              <div class="tags">
                ${tagsHtml}
              </div>
              <span class="read-more">Read more &rarr;</span>
            </div>
          </article>
        `;
      }).join('');

      // 最後にこのHTMLを画面に流し込む
      listContainer.innerHTML = html;

    } catch (error) {
      console.error('記事データの取得に失敗しました:', error);
      listContainer.innerHTML = '<p style="color:red;">記事データの読み込みに失敗しました。</p>';
      countLabel.textContent = 'Error';
    }
  };

  init();
});
