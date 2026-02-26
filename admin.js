let vocabulary = [];
let filteredList = [];
let currentPage = 1;
const itemsPerPage = 20;

const Admin = {
    async init() {
        vocabulary = await DB.fetchAll();
        this.applyFilter(); // 初回表示
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-save').onclick = () => this.saveWord();
        document.getElementById('btn-cancel').onclick = () => this.clearForm();
        document.getElementById('btn-export').onclick = () => this.exportToJson();
        document.getElementById('input-import').onchange = (e) => this.importFromJson(e);

        // 検索・フィルターイベント
        document.getElementById('search-input').oninput = () => { currentPage = 1; this.applyFilter(); };
        document.getElementById('filter-category').onchange = () => { currentPage = 1; this.applyFilter(); };

        // ページネーションイベント
        document.getElementById('prev-page').onclick = () => { if (currentPage > 1) { currentPage--; this.renderList(); } };
        document.getElementById('next-page').onclick = () => { if (currentPage < this.totalPages()) { currentPage++; this.renderList(); } };
    },

    applyFilter() {
        const searchText = document.getElementById('search-input').value.toLowerCase();
        const category = document.getElementById('filter-category').value;

        filteredList = vocabulary.filter(item => {
            const matchesSearch = item.word.toLowerCase().includes(searchText) ||
                item.translation.toLowerCase().includes(searchText);
            const matchesCategory = (category === 'all' || item.category === category);
            return matchesSearch && matchesCategory;
        });

        // 最新の追加分を上に
        filteredList.sort((a, b) => new Date(b.lastReviewed || 0) - new Date(a.lastReviewed || 0));

        this.renderList();
    },

    totalPages() {
        return Math.ceil(filteredList.length / itemsPerPage) || 1;
    },

    renderList() {
        const body = document.getElementById('vocab-list-body');
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = filteredList.slice(start, end);

        // ページ情報更新
        document.getElementById('page-info').innerText = `${currentPage} / ${this.totalPages()}`;
        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage === this.totalPages());

        if (pageItems.length === 0) {
            body.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">見つかりませんでした</td></tr>';
            return;
        }

        body.innerHTML = pageItems.map(v => `
            <tr>
                <td><strong>${v.word}</strong><br><small style="color:#8e8e93;">${v.category}</small></td>
                <td><small>${v.status}</small></td>
                <td>
                    <button class="btn-edit-sm" onclick="Admin.editItem('${v.id}')">✏️</button>
                    <button class="btn-edit-sm" onclick="Admin.deleteItem('${v.id}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    async saveWord() {
        const id = document.getElementById('edit-id').value;
        const word = document.getElementById('input-word').value.trim();
        if (!word) return;

        const data = {
            id: id || "id_" + Date.now(),
            word,
            category: document.getElementById('input-category').value,
            translation: document.getElementById('input-translation').value,
            example: document.getElementById('input-example').value,
            example_translation: document.getElementById('input-example-translation').value,
            status: id ? vocabulary.find(v => v.id === id).status : 'new',
            lastReviewed: new Date().toISOString()
        };

        if (id) {
            const idx = vocabulary.findIndex(v => v.id === id);
            vocabulary[idx] = data;
        } else {
            vocabulary.push(data);
        }

        await DB.save(vocabulary);
        this.clearForm();
        this.applyFilter();
    },

    editItem(id) {
        const item = vocabulary.find(v => v.id === id);
        document.getElementById('edit-id').value = item.id;
        document.getElementById('input-word').value = item.word;
        document.getElementById('input-category').value = item.category;
        document.getElementById('input-translation').value = item.translation;
        document.getElementById('input-example').value = item.example;
        document.getElementById('input-example-translation').value = item.example_translation;
        document.getElementById('btn-save').innerText = "修正を保存";
        document.getElementById('btn-cancel').classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteItem(id) {
        if (!confirm("削除しますか？")) return;
        vocabulary = vocabulary.filter(v => v.id !== id);
        await DB.save(vocabulary);
        this.applyFilter();
    },

    clearForm() {
        document.getElementById('edit-id').value = "";
        document.querySelectorAll('.input-stack input, .input-stack textarea').forEach(i => i.value = "");
        document.getElementById('btn-save').innerText = "保存する";
        document.getElementById('btn-cancel').classList.add('hidden');
    },

    exportToJson() {
        const blob = new Blob([JSON.stringify(vocabulary, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `c1_anki_export.json`;
        a.click();
    },

    importFromJson(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                let content = ev.target.result.trim().replace(/^\[\[/, '[').replace(/\]\]$/, ']');
                const imported = JSON.parse(content);
                if (Array.isArray(imported)) {
                    vocabulary = imported;
                    await DB.save(vocabulary);
                    this.applyFilter();
                    alert("インポート完了");
                }
            } catch (err) { alert("JSON形式エラー"); }
        };
        reader.readAsText(file);
    }
};

window.Admin = Admin;
Admin.init();