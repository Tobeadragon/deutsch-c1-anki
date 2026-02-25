/**
 * Deutsch C1 Meister Anki - Database-Ready Architecture
 */

// --- データベース操作層 (将来ここをFirebaseなどのAPIに差し替える) ---
const DB = {
    // データの取得
    async fetchAll() {
        // 現在はLocalStorageを使用しているが、将来は 'fetch("/api/vocab")' になる
        const data = localStorage.getItem('C1_ANKI_DB_V14');
        return data ? JSON.parse(data) : [];
    },

    // データの保存・更新
    async save(items) {
        // 将来は 'fetch("/api/vocab", {method: "POST", body: ...})'
        localStorage.setItem('C1_ANKI_DB_V14', JSON.stringify(items));
        return true;
    },

    // 初期データのインポート用
    async fetchInitialFile() {
        try {
            const resp = await fetch('data/initial_vocab.json');
            return resp.ok ? await resp.json() : [];
        } catch (e) {
            return [];
        }
    }
};

// --- アプリケーション本体 ---
let vocabulary = [];
let chartInstance = null;
let quizQueue = [];
let isQuizMode = false;

const App = {
    async init() {
        // DBからデータを取得
        const localData = await DB.fetchAll();
        const fileData = await DB.fetchInitialFile();

        // 既存データとファイルデータをマージ（重複はIDで排除）
        const idSet = new Set(localData.map(v => v.id));
        vocabulary = [...localData];
        fileData.forEach(item => {
            if (!idSet.has(item.id)) vocabulary.push(item);
        });

        await DB.save(vocabulary);

        this.initChart();
        this.bindEvents();
        this.render();
        this.renderList();
    },

    bindEvents() {
        // カードフリップ
        document.getElementById('card').onclick = (e) => {
            if (e.target.closest('.btn') || e.target.closest('.speak-icon')) return;
            const card = document.getElementById('card');
            if (!card.classList.contains('is-flipped')) this.showAnswer();
        };

        // 判定ボタン（非同期処理を待機するように設定）
        document.getElementById('btn-review').onclick = () => this.handleMark('review');
        document.getElementById('btn-perfect').onclick = () => this.handleMark('perfect');
        document.getElementById('btn-mastered').onclick = () => this.handleMark('mastered');

        document.getElementById('btn-show').onclick = (e) => { e.stopPropagation(); this.showAnswer(); };
        document.getElementById('btn-start-quiz').onclick = () => this.startQuiz();
        document.getElementById('btn-add-manual').onclick = () => this.saveWord();
        document.getElementById('btn-cancel-edit').onclick = () => this.clearForm();
        document.getElementById('btn-export').onclick = () => this.exportToJson();
        document.getElementById('input-import').onchange = (e) => this.importFromJson(e);

        document.getElementById('speak-btn').onclick = (e) => {
            e.stopPropagation();
            this.speak(document.getElementById('word-display').innerText);
        };
    },

    async handleMark(status) {
        const card = document.getElementById('card');
        card.classList.remove('is-flipped');

        let currentItem = isQuizMode ? quizQueue.shift() : this.getNormalList()[0];
        if (currentItem) {
            const idx = vocabulary.findIndex(v => v.id === currentItem.id);
            vocabulary[idx].status = status;
            vocabulary[idx].lastReviewed = new Date().toISOString();

            // DB(現在はLocal)へ同期保存
            await DB.save(vocabulary);
        }

        if (isQuizMode && quizQueue.length === 0) {
            setTimeout(() => alert("クイズ完了！"), 400);
            isQuizMode = false;
        }

        setTimeout(() => { this.render(); this.renderList(); }, 300);
    },

    async saveWord() {
        const id = document.getElementById('edit-id').value;
        const word = document.getElementById('input-word').value.trim();
        if (!word) return;

        const data = {
            word: word,
            category: document.getElementById('input-category').value,
            translation: document.getElementById('input-translation').value.trim(),
            example: document.getElementById('input-example').value.trim(),
            example_translation: document.getElementById('input-example-translation').value.trim(),
            lastReviewed: new Date().toISOString()
        };

        if (id) {
            const idx = vocabulary.findIndex(v => v.id == id);
            vocabulary[idx] = { ...vocabulary[idx], ...data };
        } else {
            // 新規IDは文字列として生成（DB対応）
            vocabulary.push({ id: "id_" + Date.now(), status: 'new', ...data });
        }

        await DB.save(vocabulary); // 保存を待機
        this.clearForm();
        this.render();
        this.renderList();
    },

    async deleteItem(id) {
        if (confirm("削除しますか？")) {
            vocabulary = vocabulary.filter(v => v.id !== id);
            await DB.save(vocabulary);
            this.render();
            this.renderList();
        }
    },

    // --- 以下、描画・UIロジック (変更なし) ---
    showAnswer() {
        document.getElementById('card').classList.add('is-flipped');
        document.getElementById('btn-show').classList.add('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');
        const example = document.getElementById('example-display').innerText;
        if (example) this.speak(example);
    },

    render() {
        this.updateStats();
        const card = document.getElementById('card');
        card.classList.remove('is-flipped');
        document.getElementById('btn-show').classList.remove('hidden');
        document.getElementById('action-buttons').classList.add('hidden');

        const cur = isQuizMode ? quizQueue[0] : this.getNormalList()[0];
        if (!cur) {
            document.getElementById('word-display').innerText = "学習完了！";
            document.getElementById('btn-show').classList.add('hidden');
            return;
        }
        document.getElementById('word-display').innerText = cur.word;
        document.getElementById('example-display').innerText = cur.example || "---";
        document.getElementById('example-translation-display').innerText = cur.example_translation || "";
        document.getElementById('translation-display').innerText = cur.translation || "";
    },

    getNormalList() {
        return vocabulary.filter(v => v.status !== 'mastered')
            .sort((a, b) => new Date(a.lastReviewed || 0) - new Date(b.lastReviewed || 0));
    },

    updateStats() {
        const m = vocabulary.filter(v => v.status === 'mastered').length;
        const p = vocabulary.filter(v => v.status === 'perfect').length;
        const total = vocabulary.length;
        if (chartInstance) {
            chartInstance.data.datasets[0].data = [m, p, total === 0 ? 1 : total - m - p];
            chartInstance.update();
        }
    },

    initChart() {
        const ctx = document.getElementById('progressChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [0, 0, 1], backgroundColor: ['#007aff', '#34c759', '#d1d1d6'], borderWidth: 0 }] },
            options: { cutout: '80%', plugins: { legend: { display: false } } }
        });
    },

    renderList() {
        const body = document.getElementById('vocab-list-body');
        body.innerHTML = [...vocabulary].reverse().map(v => `
            <tr>
                <td><strong>${v.word}</strong></td>
                <td><small>${v.status}</small></td>
                <td>
                    <button class="btn-edit-sm" onclick="App.editItem('${v.id}')">✏️</button>
                    <button class="btn-edit-sm" onclick="App.deleteItem('${v.id}')">🗑️</button>
                </td>
            </tr>
        `).join('');
    },

    editItem(id) {
        const item = vocabulary.find(v => v.id == id);
        document.getElementById('edit-id').value = item.id;
        document.getElementById('input-word').value = item.word;
        document.getElementById('input-category').value = item.category;
        document.getElementById('input-translation').value = item.translation;
        document.getElementById('input-example').value = item.example;
        document.getElementById('input-example-translation').value = item.example_translation;
        document.getElementById('btn-add-manual').innerText = "修正を保存";
        document.getElementById('btn-cancel-edit').classList.remove('hidden');
        document.querySelector('.add-section').scrollIntoView({ behavior: 'smooth' });
    },

    clearForm() {
        document.getElementById('edit-id').value = "";
        document.getElementById('input-word').value = "";
        document.getElementById('input-translation').value = "";
        document.getElementById('input-example').value = "";
        document.getElementById('input-example-translation').value = "";
        document.getElementById('btn-add-manual').innerText = "保存してリストに追加";
        document.getElementById('btn-cancel-edit').classList.add('hidden');
    },

    speak(t) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE';
        window.speechSynthesis.speak(u);
    },

    startQuiz() {
        const pool = vocabulary.filter(v => v.status !== 'mastered');
        if (pool.length === 0) return alert("復習すべき単語がありません。");
        quizQueue = [...pool].sort(() => 0.5 - Math.random()).slice(0, 20);
        isQuizMode = true; this.render();
    },

    exportToJson() {
        const blob = new Blob([JSON.stringify(vocabulary, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `c1_anki_db_export.json`;
        a.click();
    },

    async importFromJson(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const importedData = JSON.parse(ev.target.result);

                // データの整合性チェック
                if (Array.isArray(importedData)) {
                    vocabulary = importedData;
                    await DB.save(vocabulary);
                    alert(`${vocabulary.length}件の単語を読み込みました。`);
                    location.reload(); // 画面をリフレッシュして反映
                } else {
                    throw new Error("JSON形式が配列ではありません。");
                }
            } catch (err) {
                console.error("JSON Read Error:", err);
                alert("JSONファイルの形式が正しくありません。ファイルの中身を確認してください。");
            }
        };
        reader.readAsText(file);
    }
};

window.onload = () => App.init();