// database.js
const DB = {
    key: 'C1_ANKI_DB_PRO',
    _instance: null, // ここに一度作った接続を保存しておく

    _client() {
        // すでに接続窓口がある場合は、新しく作らずにそれを返す
        if (this._instance) return this._instance;

        try {
            if (typeof supabase !== 'undefined' && typeof SUPABASE_URL !== 'undefined') {
                // 初めての時だけ作成して保存
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

        // 1. ログインしていない場合はローカルストレージ
        if (!user) {
            console.log("Mode: Local");
            const raw = localStorage.getItem(this.key);
            return raw ? JSON.parse(raw) : [];
        }

        // 2. ログインしている場合は進捗(progress)を取得
        console.log("Mode: Cloud (User:", user.email, ")");
        const { data: progressData, error } = await client
            .from('progress')
            .select(`card_id, status, last_reviewed`);

        // 3. 単語マスタ(cards)を全件取得
        const { data: cardsData } = await client.from('cards').select('*');

        if (!cardsData) return [];

        // 4. マスタデータに進捗を合体させる
        return cardsData.map(card => {
            // progressテーブルにデータがあればそれを使い、なければ status: 'new' にする
            const progress = progressData?.find(p => p.card_id === card.id);
            return {
                id: card.id,
                word: card.word,
                category: card.category,
                translation: card.translation,
                example: card.example,
                example_translation: card.example_translation,
                status: progress ? progress.status : 'new', // ここがポイント
                lastReviewed: progress ? progress.last_reviewed : null
            };
        });
    },

    async save(items) {
        // 常にローカルには保存（バックアップ用）
        localStorage.setItem(this.key, JSON.stringify(items));

        const client = this._client();
        if (client) {
            const { data: { user } } = await client.auth.getUser();
            if (user) {
                // Supabaseのprogressテーブルに保存
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