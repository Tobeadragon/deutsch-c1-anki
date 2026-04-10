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
    // database.js の fetchUserDecks 関数を差し替え
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

            // 2. ★ 自分の作成した単語（User_Deck）が1件以上あるかカウント
            const { count, error } = await client
                .from('cards')
                .select('*', { count: 'exact', head: true })
                .eq('deck_id', 'User_Deck')
                .eq('created_by', user.id);

            // 1件以上あればリストに追加
            if (!error && count > 0) {
                decks.push({ deck_id: 'User_Deck' });
            }
        } else {
            decks.push({ deck_id: 'FREE_SAMPLE' });
        }

        // 重複を排除して返却
        const uniqueIds = Array.from(new Set(decks.map(d => d.deck_id)));
        return uniqueIds.map(id => ({ deck_id: id }));
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