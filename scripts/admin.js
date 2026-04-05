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
        document.getElementById('filter-status').onchange = () => { currentPage = 1; this.applyFilter(); };
        document.getElementById('prev-page').onclick = () => { if (currentPage > 1) { currentPage--; this.renderList(); } };
        document.getElementById('next-page').onclick = () => { if (currentPage < this.totalPages()) { currentPage++; this.renderList(); } };
    },

    applyFilter() {
        const search = (document.getElementById('search-input').value || "").toLowerCase();
        const cat = document.getElementById('filter-category').value;
        const stat = document.getElementById('filter-status').value;

        filteredList = vocabulary.filter(v => {
            const mSearch = v.word.toLowerCase().includes(search) || v.translation.toLowerCase().includes(search);
            const mCat = (cat === 'all' || v.category === cat);
            const mStat = (stat === 'all' || v.status === stat);
            return mSearch && mCat && mStat;
        });
        this.renderList();
    },

    totalPages() { return Math.ceil(filteredList.length / itemsPerPage) || 1; },

    renderList() {
        const body = document.getElementById('vocab-list-body');
        const pageItems = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        document.getElementById('page-info').innerText = `${currentPage} / ${this.totalPages()}`;

        body.innerHTML = pageItems.map(v => `
            <tr>
                <td><strong>${v.word}</strong><br><small>${v.category}</small></td>
                <td>
                    <select class="status-select-sm" onchange="Admin.updateStatus('${v.id}', this.value)">
                        <option value="new" ${v.status === 'new' ? 'selected' : ''}>新規</option>
                        <option value="review" ${v.status === 'review' ? 'selected' : ''}>復習</option>
                        <option value="perfect" ${v.status === 'perfect' ? 'selected' : ''}>学習</option>
                        <option value="mastered" ${v.status === 'mastered' ? 'selected' : ''}>習得</option>
                    </select>
                </td>
                <td>
                    <button class="btn-edit-sm" onclick="Admin.editItem('${v.id}')">✏️</button>
                    <button class="btn-edit-sm" onclick="Admin.deleteItem('${v.id}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    async updateStatus(id, newStat) {
        const idx = vocabulary.findIndex(v => String(v.id) === String(id));
        if (idx > -1) {
            vocabulary[idx].status = newStat;
            await DB.save(vocabulary);
            this.applyFilter();
        }
    },

    async saveWord() {
        const id = document.getElementById('edit-id').value;
        const word = document.getElementById('input-word').value.trim();
        if (!word) return;
        const idx = vocabulary.findIndex(v => String(v.id) === String(id));
        const data = {
            id: id || Date.now().toString(),
            word,
            category: document.getElementById('input-category').value,
            translation: document.getElementById('input-translation').value,
            example: document.getElementById('input-example').value,
            example_translation: document.getElementById('input-example-translation').value,
            status: idx > -1 ? vocabulary[idx].status : 'new',
            lastReviewed: new Date().toISOString()
        };
        if (idx > -1) vocabulary[idx] = data; else vocabulary.push(data);
        await DB.save(vocabulary);
        this.clearForm(); this.applyFilter();
    },

    editItem(id) {
        const v = vocabulary.find(item => String(item.id) === String(id));
        if (!v) return;
        document.getElementById('edit-id').value = v.id;
        document.getElementById('input-word').value = v.word;
        document.getElementById('input-category').value = v.category;
        document.getElementById('input-translation').value = v.translation;
        document.getElementById('input-example').value = v.example;
        document.getElementById('input-example-translation').value = v.example_translation;
        document.getElementById('btn-save').innerText = "修正保存";
        document.getElementById('btn-cancel').classList.remove('hidden');
        window.scrollTo(0, 0);
    },

    async deleteItem(id) {
        if (!confirm("削除しますか？")) return;
        vocabulary = vocabulary.filter(v => String(v.id) !== String(id));
        await DB.save(vocabulary); this.applyFilter();
    },

    clearForm() {
        document.getElementById('edit-id').value = "";
        document.querySelectorAll('input, textarea').forEach(i => { if (i.id !== 'search-input') i.value = ""; });
        document.getElementById('btn-save').innerText = "保存";
        document.getElementById('btn-cancel').classList.add('hidden');
    },

    exportToJson() {
        const blob = new Blob([JSON.stringify(vocabulary, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = "c1_anki_export.json"; a.click();
    },

    async importFromJson(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (ev) => {
            let data = JSON.parse(ev.target.result);
            if (Array.isArray(data[0])) data = data[0];
            vocabulary = data; await DB.save(vocabulary);
            this.applyFilter(); alert("完了");
        };
        reader.readAsText(file);
    }
};
Admin.init();