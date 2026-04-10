let vocabulary = [];
let filteredList = [];
let currentPage = 1;
const itemsPerPage = 15;

const Admin = {
    async init() {
        const client = DB._client();
        const { data: { user } } = await client.auth.getUser();
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        await this.loadData();
        this.bindEvents();
    },

    async loadData() {
        const client = DB._client();
        const { data: { user } } = await client.auth.getUser();

        const { data, error } = await client
            .from('cards')
            .select('*')
            .eq('deck_id', 'User_Deck')
            .eq('created_by', user.id)
            .order('id', { ascending: false });

        if (!error) {
            vocabulary = data;
            this.applyFilter();
        }
    },

    bindEvents() {
        document.getElementById('btn-save').onclick = () => this.saveWord();
        document.getElementById('btn-cancel').onclick = () => this.clearForm();
        document.getElementById('search-input').oninput = () => {
            currentPage = 1;
            this.applyFilter();
        };
        document.getElementById('prev-page').onclick = () => { 
            if (currentPage > 1) { 
                currentPage--; 
                this.renderList(); 
                window.scrollTo({ top: document.querySelector('.admin-controls').offsetTop, behavior: 'smooth' });
            } 
        };
        document.getElementById('next-page').onclick = () => { 
            if (currentPage < this.totalPages()) { 
                currentPage++; 
                this.renderList(); 
                window.scrollTo({ top: document.querySelector('.admin-controls').offsetTop, behavior: 'smooth' });
            } 
        };
    },

    applyFilter() {
        const search = (document.getElementById('search-input').value || "").toLowerCase();
        filteredList = vocabulary.filter(v => 
            (v.word || "").toLowerCase().includes(search) || 
            (v.translation || "").toLowerCase().includes(search)
        );
        this.renderList();
    },

    totalPages() { return Math.ceil(filteredList.length / itemsPerPage) || 1; },

    renderList() {
        const body = document.getElementById('vocab-list-body');
        const pageItems = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        
        // UI更新: ページ情報とボタンの活性状態
        document.getElementById('page-info').innerText = `${currentPage} / ${this.totalPages()}`;
        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage === this.totalPages() || this.totalPages() === 0);

        if (filteredList.length === 0) {
            body.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:40px; color:var(--text-sub);">単語が見つかりません</td></tr>';
            return;
        }

        body.innerHTML = pageItems.map(v => `
            <tr>
                <td>
                    <div style="font-weight:bold; color:var(--primary); font-size:1.05rem;">${v.word}</div>
                    <div style="font-size:0.85rem; color:var(--text-sub); margin-top:2px;">${v.translation}</div>
                </td>
                <td style="text-align:right;">
                    <button class="btn-edit-sm" onclick="Admin.editItem(${v.id})">✏️</button>
                    <button class="btn-edit-sm" onclick="Admin.deleteItem(${v.id})" style="color:var(--danger)">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    async saveWord() {
        const client = DB._client();
        const { data: { user } } = await client.auth.getUser();
        const idField = document.getElementById('edit-id').value;
        const word = document.getElementById('input-word').value.trim();
        
        if (!word) return alert("単語を入力してください");

        let finalId = idField ? parseInt(idField) : await this.getNextId();

        const payload = {
            id: finalId,
            word: word,
            category: document.getElementById('input-category').value,
            translation: document.getElementById('input-translation').value,
            example: document.getElementById('input-example').value,
            example_translation: document.getElementById('input-example-translation').value,
            deck_id: 'User_Deck',
            created_by: user.id
        };

        const { error } = await client.from('cards').upsert(payload);
        if (error) {
            alert("エラー: " + error.message);
        } else {
            this.clearForm();
            await this.loadData();
        }
    },

    async getNextId() {
        const client = DB._client();
        const { data } = await client
            .from('cards')
            .select('id')
            .gte('id', 90000)
            .order('id', { ascending: false })
            .limit(1);
        return (data && data.length > 0) ? data[0].id + 1 : 90000;
    },

    editItem(id) {
        const v = vocabulary.find(item => item.id === id);
        if (!v) return;
        document.getElementById('edit-id').value = v.id;
        document.getElementById('input-word').value = v.word;
        document.getElementById('input-category').value = v.category;
        document.getElementById('input-translation').value = v.translation;
        document.getElementById('input-example').value = v.example;
        document.getElementById('input-example-translation').value = v.example_translation;
        
        document.getElementById('form-title').innerText = "単語を編集 (ID:" + v.id + ")";
        document.getElementById('btn-save').innerText = "更新する";
        document.getElementById('btn-cancel').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteItem(id) {
        if (!confirm("この単語をマイ辞書から完全に削除しますか？")) return;
        const client = DB._client();
        const { error } = await client.from('cards').delete().eq('id', id);
        if (error) alert("削除失敗");
        else await this.loadData();
    },

    clearForm() {
        document.getElementById('edit-id').value = "";
        document.querySelectorAll('.admin-card input, .admin-card textarea').forEach(el => el.value = "");
        document.getElementById('form-title').innerText = "新規単語を追加";
        document.getElementById('btn-save').innerText = "保存する";
        document.getElementById('btn-cancel').classList.add('hidden');
    }
};

Admin.init();