let vocabulary = [];
let chartInstance = null;
let quizQueue = [];
let isQuizMode = false;

const App = {
    async init() {
        vocabulary = await DB.fetchAll();

        if (vocabulary.length === 0) {
            try {
                const resp = await fetch('data/initial_vocab.json');
                if (resp.ok) {
                    vocabulary = await resp.json();
                    await DB.save(vocabulary);
                }
            } catch (e) { console.log("No initial file."); }
        }

        this.initChart();
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        // カード全体のクリック（双方向フリップ）
        document.getElementById('card').onclick = (e) => {
            if (e.target.closest('.speak-btn-icon') || e.target.closest('.speak-btn-icon-sm')) {
                return;
            }
            const card = document.getElementById('card');
            const isFlipped = card.classList.contains('is-flipped');
            if (!isFlipped) {
                this.showAnswer();
            } else {
                card.classList.remove('is-flipped');
            }
        };

        // 読み上げ
        document.getElementById('speak-word-front').onclick = (e) => {
            e.stopPropagation();
            this.speak(document.getElementById('word-display').innerText);
        };
        document.getElementById('speak-word-back').onclick = (e) => {
            e.stopPropagation();
            this.speak(document.getElementById('word-display').innerText);
        };
        document.getElementById('speak-example-back').onclick = (e) => {
            e.stopPropagation();
            this.speak(document.getElementById('example-display').innerText);
        };

        // 判定ボタン
        document.getElementById('btn-review').onclick = (e) => { e.stopPropagation(); this.handleMark('review'); };
        document.getElementById('btn-perfect').onclick = (e) => { e.stopPropagation(); this.handleMark('perfect'); };
        document.getElementById('btn-mastered').onclick = (e) => { e.stopPropagation(); this.handleMark('mastered'); };

        document.getElementById('btn-show').onclick = (e) => { e.stopPropagation(); this.showAnswer(); };
        document.getElementById('btn-start-quiz').onclick = () => this.startQuiz();
    },

    async handleMark(status) {
        const card = document.getElementById('card');
        card.classList.remove('is-flipped');

        let currentItem = isQuizMode ? quizQueue.shift() : this.getNormalList()[0];
        if (currentItem) {
            const idx = vocabulary.findIndex(v => v.id === currentItem.id);
            vocabulary[idx].status = status;
            vocabulary[idx].lastReviewed = new Date().toISOString();
            await DB.save(vocabulary);
        }

        if (isQuizMode && quizQueue.length === 0) {
            setTimeout(() => alert("クイズ完了！"), 400);
            isQuizMode = false;
        }

        setTimeout(() => { this.render(); }, 300);
    },

    showAnswer() {
        document.getElementById('card').classList.add('is-flipped');
        document.getElementById('btn-show').classList.add('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');

        const example = document.getElementById('example-display').innerText;
        if (example && example !== "---") {
            this.speak(example);
        }
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
            if (document.getElementById('word-display-back')) document.getElementById('word-display-back').innerText = "";
            if (document.getElementById('category-display-back')) document.getElementById('category-display-back').innerText = "";
            document.getElementById('btn-show').classList.add('hidden');
            return;
        }

        // 表面の表示
        document.getElementById('word-display').innerText = cur.word;

        // 裏面の表示（単語と品詞）
        if (document.getElementById('word-display-back'))
            document.getElementById('word-display-back').innerText = cur.word;
        if (document.getElementById('category-display-back'))
            document.getElementById('category-display-back').innerText = cur.category || "";

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
        document.getElementById('stat-mastered').innerText = m;
        document.getElementById('stat-perfect').innerText = p;
        document.getElementById('stat-review').innerText = total - m - p;
    },

    initChart() {
        const ctx = document.getElementById('progressChart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [0, 0, 1], backgroundColor: ['#007aff', '#34c759', '#d1d1d6'], borderWidth: 0 }] },
            options: { cutout: '80%', plugins: { legend: { display: false } } }
        });
    },

    speak(t) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(t);
        u.lang = 'de-DE';
        window.speechSynthesis.speak(u);
    },

    startQuiz() {
        const pool = vocabulary.filter(v => v.status !== 'mastered');
        if (pool.length === 0) return alert("単語がありません。");
        quizQueue = [...pool].sort(() => 0.5 - Math.random()).slice(0, 20);
        isQuizMode = true; this.render();
    }
};

window.onload = () => App.init();