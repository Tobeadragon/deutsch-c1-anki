let vocabulary = [];
let filteredList = [];
let currentPage = 1;
const itemsPerPage = 15;
const ADMIN_EMAIL = 'mastertyj@hotmail.com';

const Admin = {
    async init() {
        // DB（Supabase）が準備できるまで待機
        let client = DB._client();
        if (!client) {
            setTimeout(() => this.init(), 100);
            return;
        }

        const { data: { user } } = await client.auth.getUser();
        if (!user) { window.location.href = 'login.html'; return; }

        // 管理者の場合のみ、UIを構築
        if (user.email === ADMIN_EMAIL) {
            await this.setupAdminUI();
        }

        await this.loadData();
        this.bindEvents();
    },

    // 学習画面（index.html）で成功している DB.fetchUserDecks を利用する
    async setupAdminUI() {
        const adminControl = document.getElementById('admin-deck-control');
        let select = document.getElementById('admin-deck-select');
        const container = document.getElementById('deck-select-container');

        if (!adminControl) return;
        adminControl.style.display = 'block';

        try {
            const userDecks = await DB.fetchUserDecks();

            if (!select && container) {
                container.innerHTML = '';
                select = document.createElement('select');
                select.id = 'admin-deck-select';
                select.className = 'admin-select';
                container.appendChild(select);
            }

            if (!select) return;
            select.innerHTML = '';

            // --- ここから追加 ---
            // リストの先頭にマイ辞書を追加（重複を防ぐため、既に含まれていないかチェック）
            if (!userDecks.some(d => d.deck_id === 'User_Deck')) {
                userDecks.unshift({ deck_id: 'User_Deck' });
            }
            // --- ここまで追加 ---

            if (userDecks && userDecks.length > 0) {
                userDecks.forEach(deck => {
                    const opt = document.createElement('option');
                    opt.value = deck.deck_id;

                    let icon = '📚';
                    if (deck.deck_id === 'User_Deck') icon = '⭐';
                    else if (deck.deck_id.includes('FREE')) icon = '🆓';
                    else if (deck.deck_id.match(/A1|B1|C1/)) icon = '🇩🇪';

                    opt.textContent = `${icon} ${deck.deck_id}`;
                    select.appendChild(opt);
                });
            }

            const urlParams = new URLSearchParams(window.location.search);
            const currentDeck = urlParams.get('deck') || 'User_Deck';
            select.value = currentDeck;

            select.onchange = (e) => {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('deck', e.target.value);
                window.location.href = newUrl.href;
            };

            const allSelects = adminControl.querySelectorAll('select');
            allSelects.forEach(s => {
                if (s !== select) s.style.display = 'none';
            });

        } catch (err) {
            console.error("Deck setup error:", err);
        }
    },

    async loadData() {
        const client = DB._client();
        const { data: { user } } = await client.auth.getUser();
        const urlParams = new URLSearchParams(window.location.search);
        const currentDeck = urlParams.get('deck') || 'User_Deck';

        // database.js の fetchAll と同じロジックを適用
        let query = client.from('cards').select('*').eq('deck_id', currentDeck);

        if (currentDeck === 'User_Deck') {
            query = query.eq('created_by', user.id);
        } else {
            // 公式デッキの場合は作成者が null のものを取得
            query = query.is('created_by', null);
        }

        const { data, error } = await query.order('id', { ascending: false });
        if (!error) {
            vocabulary = data;
            this.applyFilter();
        }
    },

    bindEvents() {
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) saveBtn.onclick = () => this.saveWord();

        const cancelBtn = document.getElementById('btn-cancel');
        if (cancelBtn) cancelBtn.onclick = () => this.clearForm();

        const btnImport = document.getElementById('btn-import');
        if (btnImport) btnImport.onclick = () => this.importCSV();

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.oninput = () => {
                currentPage = 1;
                this.applyFilter();
            };
        }

        const prevBtn = document.getElementById('prev-page');
        if (prevBtn) {
            prevBtn.onclick = () => {
                if (currentPage > 1) { currentPage--; this.renderList(); window.scrollTo(0, 0); }
            };
        }

        const nextBtn = document.getElementById('next-page');
        if (nextBtn) {
            nextBtn.onclick = () => {
                if (currentPage < this.totalPages()) { currentPage++; this.renderList(); window.scrollTo(0, 0); }
            };
        }

        // CSVファイル選択時の名前表示
        const fileInput = document.getElementById('csv-file');
        if (fileInput) {
            fileInput.onchange = () => {
                const display = document.getElementById('file-name-display');
                if (display) display.innerText = fileInput.files[0]?.name || "未選択";
            };
        }
    },

    async saveWord() {
        const client = DB._client();
        const { data: { user } } = await client.auth.getUser();
        const idField = document.getElementById('edit-id').value;
        const urlParams = new URLSearchParams(window.location.search);
        const targetDeck = urlParams.get('deck') || 'User_Deck';

        let finalId = idField ? parseInt(idField) : await this.getNextId(targetDeck);

        const payload = {
            id: finalId,
            word: document.getElementById('input-word').value.trim(),
            category: document.getElementById('input-category').value.trim(),
            translation: document.getElementById('input-translation').value.trim(),
            example: document.getElementById('input-example').value.trim(),
            example_translation: document.getElementById('input-example-translation').value.trim(),
            deck_id: targetDeck,
            // 公式デッキなら null、マイ辞書なら user.id
            created_by: targetDeck === 'User_Deck' ? user.id : null
        };

        if (!payload.word) return alert("単語を入力してください");

        const { error } = await client.from('cards').upsert(payload, { onConflict: 'deck_id, word' });
        if (error) alert("保存失敗: " + error.message);
        else { this.clearForm(); await this.loadData(); }
    },

    async getNextId(deckId) {
        const client = DB._client();
        let query = client.from('cards').select('id');
        if (deckId === 'User_Deck') query = query.gte('id', 90000);
        else query = query.lt('id', 90000);
        const { data } = await query.order('id', { ascending: false }).limit(1);
        return (data && data.length > 0) ? data[0].id + 1 : (deckId === 'User_Deck' ? 90000 : 1);
    },

    async importCSV() {
        const fileInput = document.getElementById('csv-file');
        const statusEl = document.getElementById('import-status');
        const urlParams = new URLSearchParams(window.location.search);
        const targetDeck = urlParams.get('deck') || 'User_Deck';

        if (!fileInput || !fileInput.files.length) return alert("CSVファイルを選択してください");

        const file = fileInput.files[0];
        const reader = new FileReader();
        if (statusEl) statusEl.innerText = "インポート中...";

        reader.onload = async (e) => {
            const rows = e.target.result.split(/\r?\n/).filter(r => r.trim() !== "");
            const client = DB._client();
            const { data: { user } } = await client.auth.getUser();
            let nextId = await this.getNextId(targetDeck);

            const payload = rows.map(row => {
                const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
                if (cols.length < 3) return null;
                return {
                    id: nextId++, word: cols[0], category: cols[1], translation: cols[2],
                    example: cols[3] || "", example_translation: cols[4] || "",
                    deck_id: targetDeck,
                    created_by: targetDeck === 'User_Deck' ? user.id : null
                };
            }).filter(d => d !== null);

            const { error } = await client.from('cards').upsert(payload, { onConflict: 'deck_id, word' });
            if (error) { if (statusEl) statusEl.innerText = "エラー: " + error.message; }
            else { if (statusEl) statusEl.innerText = "完了！ (" + payload.length + "件)"; await this.loadData(); }
        };
        reader.readAsText(file);
    },

    applyFilter() {
        const s = (document.getElementById('search-input').value || "").toLowerCase();
        filteredList = vocabulary.filter(v =>
            (v.word || "").toLowerCase().includes(s) ||
            (v.translation || "").toLowerCase().includes(s)
        );
        this.renderList();
    },

    totalPages() { return Math.ceil(filteredList.length / itemsPerPage) || 1; },

    renderList() {
        const body = document.getElementById('vocab-list-body');
        if (!body) return;
        const pageItems = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        const pageInfo = document.getElementById('page-info');
        if (pageInfo) pageInfo.innerText = `${currentPage} / ${this.totalPages()}`;

        body.innerHTML = pageItems.map(v => `
            <tr>
                <td><strong>${v.word}</strong><br><small style="color:#666">${v.translation}</small></td>
                <td style="text-align:right;">
                    <button class="btn-edit-sm" onclick="Admin.editItem(${v.id})" style="margin-right:5px;">✏️</button>
                    <button class="btn-edit-sm" onclick="Admin.deleteItem(${v.id})" style="color:red;">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    editItem(id) {
        const v = vocabulary.find(item => item.id === id);
        if (!v) return;
        document.getElementById('edit-id').value = v.id;
        document.getElementById('input-word').value = v.word;
        document.getElementById('input-category').value = v.category || "";
        document.getElementById('input-translation').value = v.translation;
        document.getElementById('input-example').value = v.example;
        document.getElementById('input-example-translation').value = v.example_translation;

        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) saveBtn.innerText = "更新する";
        const cancelBtn = document.getElementById('btn-cancel');
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteItem(id) {
        if (!confirm("この単語を削除しますか？")) return;
        const client = DB._client();
        await client.from('cards').delete().eq('id', id);
        await this.loadData();
    },

    clearForm() {
        document.getElementById('edit-id').value = "";
        document.querySelectorAll('.form-control').forEach(el => el.value = "");
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) saveBtn.innerText = "保存する";
        const cancelBtn = document.getElementById('btn-cancel');
        if (cancelBtn) cancelBtn.classList.add('hidden');
    }
};

Admin.init();