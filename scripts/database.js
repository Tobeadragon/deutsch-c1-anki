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

    // database.js の該当箇所を書き換え
    async saveProgress(vocabulary) {
        const client = this._client();
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        // 最新の1件（最後に操作した単語）の進捗を計算して保存する例
        // ※script.jsから渡される単語リストのステータスを元に計算
        const updates = vocabulary.map(v => {
            let interval = v.interval_days || 0;
            let nextDate = new Date();

            if (v.status === 'perfect') {
                // 間隔を広げる（例：0日→1日→3日→7日→15日...）
                interval = interval === 0 ? 1 : Math.ceil(interval * 2.5);
            } else if (v.status === 'review') {
                // 復習が必要な場合は間隔を短く維持
                interval = 1;
            } else if (v.status === 'mastered') {
                // 習得済みは1ヶ月以上先に飛ばす
                interval = 30;
            }

            nextDate.setDate(nextDate.getDate() + interval);

            return {
                user_id: user.id,
                card_id: v.id,
                status: v.status,
                interval_days: interval,
                next_review_date: nextDate.toISOString(),
                last_reviewed: new Date().toISOString()
            };
        });

        const { error } = await client
            .from('progress')
            .upsert(updates, { onConflict: 'user_id, card_id' });

        if (error) console.error("Progress Save Error:", error);
    }
};