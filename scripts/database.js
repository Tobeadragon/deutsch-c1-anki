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
            const { data } = await client.from('subscriptions').select('deck_id').eq('user_id', user.id);
            decks = data || [];
            // ログイン中なら必ず「マイ辞書」を選択肢に加える
            decks.push({ deck_id: 'User_Deck' });
        } else {
            decks.push({ deck_id: 'FREE_SAMPLE' });
        }

        // 重複削除
        return Array.from(new Set(decks.map(d => d.deck_id))).map(id => ({ deck_id: id }));
    },

    async fetchAll() {
        const client = this._client();
        const { data: { user } } = await client.auth.getUser();

        const urlParams = new URLSearchParams(window.location.search);
        this.currentDeckId = urlParams.get('deck') || 'FREE_SAMPLE';

        // 1. カードマスタの取得 (公式 or 自分の作成したもの)
        let query = client.from('cards').select('*').eq('deck_id', this.currentDeckId);

        // User_Deckの場合は自分のデータのみ、それ以外は公式データ(created_by is null)を取得
        if (this.currentDeckId === 'User_Deck') {
            query = query.eq('created_by', user.id);
        } else {
            query = query.is('created_by', null);
        }

        const { data: cardsData, error: cardsError } = await query;
        if (cardsError || !cardsData) return [];

        // 2. 進捗の取得
        const { data: progressData } = await client.from('progress').select(`card_id, status, last_reviewed`).eq('user_id', user.id);

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