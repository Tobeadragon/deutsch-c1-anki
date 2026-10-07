let vocabulary = [];
let filteredList = [];
let currentPage = 1;
const itemsPerPage = 15;

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

        await this.loadData();
        this.bindEvents();
    },

    async loadData() {
        const client = DB._client();
        const { data: { user } } = await client.auth.getUser();
        const { data, error } = await client
            .from('cards')
            .select('*')
            .eq('deck_id', DB.PERSONAL_DECK_ID)
            .eq('created_by', user.id)
            .order('id', { ascending: false });
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
        const targetDeck = DB.PERSONAL_DECK_ID;

        const payload = {
            word: document.getElementById('input-word').value.trim(),
            category: document.getElementById('input-category').value.trim(),
            translation: document.getElementById('input-translation').value.trim(),
            example: document.getElementById('input-example').value.trim(),
            example_translation: document.getElementById('input-example-translation').value.trim(),
            deck_id: targetDeck,
            created_by: user.id
        };

        if (!payload.word) return alert("単語を入力してください");

        const editId = idField ? parseInt(idField) : null;
        const duplicate = await this.findPersonalDuplicate(user.id, payload.word, editId);
        if (duplicate) return alert("登録済みです");

        let error;
        if (editId) {
            const result = await client.from('cards').update(payload).eq('id', editId);
            error = result.error;
        } else {
            payload.id = await this.getNextId(targetDeck);
            const result = await client.from('cards').insert(payload);
            error = result.error;
        }

        if (error) alert("保存失敗: " + error.message);
        else { this.clearForm(); await this.loadData(); }
    },

    normalizeWord(word) {
        return (word || "").trim().toLowerCase();
    },

    async findPersonalDuplicate(userId, word, excludeId) {
        const client = DB._client();
        const { data } = await client
            .from('cards')
            .select('id, word')
            .eq('deck_id', DB.PERSONAL_DECK_ID)
            .eq('created_by', userId);

        if (!data) return null;
        const target = this.normalizeWord(word);
        return data.find(card => {
            if (excludeId && card.id === excludeId) return false;
            return this.normalizeWord(card.word) === target;
        }) || null;
    },

    async getNextId(deckId) {
        const client = DB._client();
        let query = client.from('cards').select('id');
        if (DB.isPersonalDeck(deckId)) query = query.gte('id', 90000);
        else query = query.lt('id', 90000);
        const { data } = await query.order('id', { ascending: false }).limit(1);
        return (data && data.length > 0) ? data[0].id + 1 : (DB.isPersonalDeck(deckId) ? 90000 : 1);
    },

    async importCSV() {
        const fileInput = document.getElementById('csv-file');
        const statusEl = document.getElementById('import-status');
        const targetDeck = DB.PERSONAL_DECK_ID;

        if (!fileInput || !fileInput.files.length) return alert("CSVファイルを選択してください");

        const file = fileInput.files[0];
        const reader = new FileReader();
        if (statusEl) statusEl.innerText = "インポート中...";

        reader.onload = async (e) => {
            const rows = e.target.result.split(/\r?\n/).filter(r => r.trim() !== "");
            const client = DB._client();
            const { data: { user } } = await client.auth.getUser();
            let nextId = await this.getNextId(targetDeck);

            const { data: existingCards } = await client
                .from('cards')
                .select('word')
                .eq('deck_id', targetDeck)
                .eq('created_by', user.id);

            const existingWords = new Set((existingCards || []).map(c => this.normalizeWord(c.word)));
            const seenInFile = new Set();
            let skipped = 0;

            const payload = rows.map(row => {
                const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
                if (cols.length < 3) return null;
                const word = cols[0];
                const key = this.normalizeWord(word);
                if (!key || existingWords.has(key) || seenInFile.has(key)) {
                    skipped++;
                    return null;
                }
                seenInFile.add(key);
                existingWords.add(key);
                return {
                    id: nextId++, word, category: cols[1], translation: cols[2],
                    example: cols[3] || "", example_translation: cols[4] || "",
                    deck_id: targetDeck,
                    created_by: user.id
                };
            }).filter(d => d !== null);

            if (payload.length === 0) {
                if (statusEl) statusEl.innerText = skipped > 0 ? "登録済みです（新規は0件）" : "取り込める行がありません";
                return;
            }

            const { error } = await client.from('cards').insert(payload);
            if (error) { if (statusEl) statusEl.innerText = "エラー: " + error.message; }
            else {
                const skipNote = skipped > 0 ? ` / 登録済みスキップ ${skipped}件` : "";
                if (statusEl) statusEl.innerText = "自分の単語帳へ完了！ (" + payload.length + "件" + skipNote + ")";
                await this.loadData();
            }
        };
        reader.readAsText(file);
    },

    // importCSV() のすぐ後ろあたりに追加
    downloadSampleCSV() {
        // Excelでも文字化けしないよう BOM (0xEF, 0xBB, 0xBF) を追加
        const csvContent = "Apfel,Nomen,りんご,Ich esse einen Apfel.,私はりんごを食べます。";
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "sample_deck.csv";
        link.click();
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

