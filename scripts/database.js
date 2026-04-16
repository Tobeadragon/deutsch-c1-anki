const DB = {
    key: 'C1_ANKI_DB_PRO',
    _instance: null,
    currentDeckId: null,

    _client() {
        if (this._instance) return this._instance;
        try {
            if (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined') {
                this._instance = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                return this._instance;
            }
        } catch (e) {
            console.error("Supabase初期化エラー:", e);
        }
        return null;
    },

    // ユーザーが購読しているデッキ + マイ辞書を取得
    async fetchUserDecks() {
        const client = this._client();
        if (!client) return [{ deck_id: 'FREE_SAMPLE' }];

        const { data: { user } } = await client.auth.getUser();

        let decks = [];
        if (user) {
            // 1. 購読中の公式デッキを取得
            const { data: subData } = await client
                .from('subscriptions')
                .select('deck_id')
                .eq('user_id', user.id);

            if (subData) decks = subData.map(d => ({ deck_id: d.deck_id }));

            // 2. 自分の作成した単語（User_Deck）が1件以上あるかカウント
            const { count, error } = await client
                .from('cards')
                .select('*', { count: 'exact', head: true })
                .eq('deck_id', 'User_Deck')
                .eq('created_by', user.id);

            if (!error && count > 0) {
                decks.push({ deck_id: 'User_Deck' });
            }
        } else {
            decks.push({ deck_id: 'FREE_SAMPLE' });
        }

        const uniqueIds = Array.from(new Set(decks.map(d => d.deck_id)));
        return uniqueIds.map(id => ({ deck_id: id }));
    },

    async fetchAll() {
        const client = this._client();
        const { data: { user } } = await client.auth.getUser();
        if (!user && (new URLSearchParams(window.location.search).get('deck') !== 'FREE_SAMPLE')) {
            return [];
        }

        const urlParams = new URLSearchParams(window.location.search);
        this.currentDeckId = urlParams.get('deck') || 'FREE_SAMPLE';

        let query = client.from('cards').select('*').eq('deck_id', this.currentDeckId);

        if (this.currentDeckId === 'User_Deck') {
            query = query.eq('created_by', user.id);
        } else {
            query = query.is('created_by', null);
        }

        const { data: cardsData, error: cardsError } = await query;
        if (cardsError || !cardsData) return [];

        const { data: progressData } = user
            ? await client.from('progress').select(`card_id, status, last_reviewed`).eq('user_id', user.id)
            : { data: [] };

        return cardsData.map(card => {
            const progress = progressData?.find(p => p.card_id === card.id);
            return {
                id: card.id,
                deck_id: card.deck_id,
                word: card.word,
                category: card.category,
                translation: card.translation,
                example: card.example,
                example_translation: card.example_translation,
                status: progress ? progress.status : 'new',
                lastReviewed: progress ? progress.last_reviewed : null
            };
        });
    },

    async saveProgress(items) {
        const client = this._client();
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        const rows = items.map(item => ({
            user_id: user.id,
            card_id: item.id,
            status: item.status,
            last_reviewed: new Date().toISOString()
        }));

        await client.from('progress').upsert(rows, { onConflict: 'user_id,card_id' });
    }
};

// --- 自動ログアウト監視ロジック ---
(function () {
    let logoutTimer;
    // 2時間 = 7200000ミリ秒
    const AUTO_LOGOUT_TIME = 2 * 60 * 60 * 1000;

    async function executeAutoLogout() {
        const client = DB._client();
        if (!client) return;

        const { data: { user } } = await client.auth.getUser();
        // ログイン中のみログアウト処理を実行
        if (user) {
            alert("2時間操作がなかったため、安全のために自動ログアウトしました。");
            await client.auth.signOut();
            localStorage.clear();
            window.location.href = 'login.html';
        }
    }

    function resetLogoutTimer() {
        if (logoutTimer) clearTimeout(logoutTimer);
        logoutTimer = setTimeout(executeAutoLogout, AUTO_LOGOUT_TIME);
    }

    // ブラウザ環境でのみ実行
    if (typeof window !== 'undefined') {
        // 操作イベント（マウス、キーボード、タッチ、スクロール）を監視
        ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(eventType => {
            document.addEventListener(eventType, resetLogoutTimer, true);
        });

        // ページ読み込み時にタイマーを開始
        resetLogoutTimer();
    }
})();