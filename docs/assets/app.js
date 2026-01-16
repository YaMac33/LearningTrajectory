document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('article-list');
    const countLabel = document.getElementById('article-count');

    // JSONデータの取得先
    const DATA_URL = './data/index.json';

    // 日付フォーマット関数
    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('ja-JP', options);
    };

    // メイン処理
    const init = async () => {
        try {
            // JSONファイルをフェッチ
            const response = await fetch(DATA_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const articles = await response.json();

            // 日付順（新しい順）にソート
            articles.sort((a, b) => new Date(b.date) - new Date(a.date));

            // 記事数を更新
            countLabel.textContent = `${articles.length} posts`;

            // HTML生成
            if (articles.length === 0) {
                listContainer.innerHTML = '<p style="color:#888;">記事はまだありません。</p>';
                return;
            }

            const html = articles.map((article, index) => {
                // アニメーション遅延
                const delayStyle = `animation-delay: ${index * 0.05}s`;
                
                // タグ生成
                const tagsHtml = article.tags.map(tag => 
                    `<span class="tag">#${tag}</span>`
                ).join('');

                // リンクパス生成: docs/name/index.html へ
                // 相対パスなので ./name/ でOK
                const linkPath = `../${article.dir}/`;

                return `
                <article class="article-card fade-in" style="${delayStyle}" onclick="location.href='${linkPath}'">
                    <div class="card-header">
                        <h3 class="card-title">
                            <a href="${linkPath}">${article.title}</a>
                        </h3>
                        <time class="card-date" datetime="${article.date}">
                            ${formatDate(article.date)}
                        </time>
                    </div>
                    
                    <p class="card-summary">
                        ${article.summary}
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

            // DOM更新
            listContainer.innerHTML = html;

        } catch (error) {
            console.error('記事データの取得に失敗しました:', error);
            listContainer.innerHTML = '<p style="color:red;">記事データの読み込みに失敗しました。</p>';
            countLabel.textContent = 'Error';
        }
    };

    init();
});

