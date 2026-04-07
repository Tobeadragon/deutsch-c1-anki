// database.js
const DB = {
    key: 'C1_ANKI_DB_PRO',
    _instance: null,

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

    async fetchAll() {
        const client = this._client();
        let user = null;

        if (client) {
            const { data } = await client.auth.getUser();
            user = data?.user;
        }

        // --- 追加：URLパラメータから対象のデッキIDを取得 ---
        const urlParams = new URLSearchParams(window.location.search);
        const targetDeck = urlParams.get('deck') || 'C1_VOL1'; // 指定がない場合はC1をデフォルトに
        console.log("Target Deck:", targetDeck);
        // ----------------------------------------------

        if (!user) {
            console.log("Mode: Local");
            const raw = localStorage.getItem(this.key);
            const localData = raw ? JSON.parse(raw) : [];
            // ローカル保存データからも、現在のデッキに該当するものだけを返す
            return localData.filter(item => item.deck_id === targetDeck);
        }

        console.log("Mode: Cloud (User:", user.email, ")");

        // 1. 指定されたデッキの単語マスタ(cards)のみを取得
        const { data: cardsData, error: cardsError } = await client
            .from('cards')
            .select('*')
            .eq('deck_id', targetDeck); // ここでA1_FULLかC1_VOL1かを絞り込む

        if (cardsError || !cardsData) {
            console.error("Cards fetch error:", cardsError);
            return [];
        }

        // 2. ログインユーザーの進捗(progress)を取得
        // ※progress側は全件取得しても、後でcardsData（絞り込み済み）と照合するため問題ありません
        const { data: progressData } = await client
            .from('progress')
            .select(`card_id, status, last_reviewed`);

        // 3. 絞り込まれたマスタデータに進捗を合体させる
        return cardsData.map(card => {
            const progress = progressData?.find(p => p.card_id === card.id);
            return {
                id: card.id,
                deck_id: card.deck_id, // デッキIDも保持しておくと便利です
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

    async save(items) {
        localStorage.setItem(this.key, JSON.stringify(items));

        const client = this._client();
        if (client) {
            const { data: { user } } = await client.auth.getUser();
            if (user) {
                const rows = items.map(item => ({
                    user_id: user.id,
                    card_id: item.id,
                    status: item.status,
                    last_reviewed: item.lastReviewed || new Date().toISOString()
                }));

                const { error } = await client
                    .from('progress')
                    .upsert(rows, { onConflict: 'user_id,card_id' });

                if (error) console.error("Cloud save failed:", error);
            }
        }
        return true;
    }
};