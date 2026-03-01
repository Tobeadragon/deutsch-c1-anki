let vocabulary = [];
let filteredList = [];
let currentPage = 1;
const itemsPerPage = 20;

const Admin = {
    async init() {
        vocabulary = await DB.fetchAll();
        this.applyFilter();
        this.bindEvents();
    },

    bindEvents() {
        document.getElementById('btn-save').onclick = () => this.saveWord();
        document.getElementById('btn-cancel').onclick = () => this.clearForm();
        document.getElementById('btn-export').onclick = () => this.exportToJson();
        document.getElementById('input-import').onchange = (e) => this.importFromJson(e);

        document.getElementById('search-input').oninput = () => { currentPage = 1; this.applyFilter(); };
        document.getElementById('filter-category').onchange = () => { currentPage = 1; this.applyFilter(); };

        document.getElementById('prev-page').onclick = () => { if (currentPage > 1) { currentPage--; this.renderList(); } };
        document.getElementById('next-page').onclick = () => { if (currentPage < this.totalPages()) { currentPage++; this.renderList(); } };
    },

    applyFilter() {
        const searchText = (document.getElementById('search-input').value || "").toLowerCase();
        const category = document.getElementById('filter-category').value;

        filteredList = vocabulary.filter(item => {
            const matchesSearch = item.word.toLowerCase().includes(searchText) ||
                item.translation.toLowerCase().includes(searchText);
            const matchesCategory = (category === 'all' || item.category === category);
            return matchesSearch && matchesCategory;
        });

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

        // IDの型を一致させて検索 (数値と文字列の差異を許容)
        const targetIndex = vocabulary.findIndex(v => String(v.id) === String(id));

        const data = {
            id: id || Date.now().toString(), // 新規なら文字列IDを生成
            word,
            category: document.getElementById('input-category').value,
            translation: document.getElementById('input-translation').value,
            example: document.getElementById('input-example').value,
            example_translation: document.getElementById('input-example-translation').value,
            status: (targetIndex > -1) ? vocabulary[targetIndex].status : 'new',
            lastReviewed: new Date().toISOString()
        };

        if (targetIndex > -1) {
            // 既存データの更新
            vocabulary[targetIndex] = data;
        } else {
            // 新規データの追加
            vocabulary.push(data);
        }

        await DB.save(vocabulary);
        this.clearForm();
        this.applyFilter();
    },

    editItem(id) {
        // IDの型を考慮して検索
        const item = vocabulary.find(v => String(v.id) === String(id));
        if (!item) return;

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
        vocabulary = vocabulary.filter(v => String(v.id) !== String(id));
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

    async importFromJson(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                let imported = JSON.parse(ev.target.result);

                // [[ ... ]] という二重配列形式の場合、一段階平坦化(flatten)する
                if (Array.isArray(imported) && imported.length > 0 && Array.isArray(imported[0])) {
                    imported = imported[0];
                }

                if (Array.isArray(imported)) {
                    vocabulary = imported;
                    await DB.save(vocabulary);
                    this.applyFilter();
                    alert("インポートが完了しました");
                }
            } catch (err) {
                alert("JSON形式が正しくありません");
                console.error(err);
            }
        };
        reader.readAsText(file);
    }
};

window.Admin = Admin;
Admin.init();