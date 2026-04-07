// database.js
// config.js の URL/KEY は既に読み込まれている前提

const DB = {
    key: 'C1_ANKI_DB_PRO',

    // Supabaseクライアントをその場で作る（import不要のCDN版を使用）
    _client() {
        if (typeof supabase !== 'undefined') return supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return null;
    },

    async fetchAll() {
        // まずはローカルを最速で表示
        const localData = localStorage.getItem(this.key);
        const data = localData ? JSON.parse(localData) : [];

        // ログインチェック（バックグラウンドで試行）
        const client = this._client();
        if (client) {
            const { data: { user } } = await client.auth.getUser();
            if (user) {
                console.log("Logged in: Synced data will be available on next save.");
                // ここでクラウドから取得して同期するロジックは後回しにし、まずは表示を優先
            }
        }
        return data;
    },

    async save(items) {
        // 1. ローカルに保存（これは絶対成功する）
        localStorage.setItem(this.key, JSON.stringify(items));

        // 2. ログインしてればクラウドに飛ばす
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
                await client.from('progress').upsert(rows, { onConflict: 'user_id,card_id' });
            }
        }
        return true;
    }
};