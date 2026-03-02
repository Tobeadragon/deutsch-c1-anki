let vocabulary = [];
let chartInstance = null;
let quizQueue = [];
let isQuizMode = false;
let quizCorrectCount = 0;
let quizTotalCount = 0;
let frontContentCache = ""; // 表面のHTMLを一時保存する変数

const App = {
    async init() {
        vocabulary = await DB.fetchAll();
        this.initChart();
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.getElementById('card').onclick = (e) => {
            if (e.target.closest('.speak-btn-icon') || e.target.closest('.speak-btn-icon-sm')) return;
            const card = document.getElementById('card');
            if (!card.classList.contains('is-flipped')) this.showAnswer();
            else this.hideAnswer();
        };

        // イベント委譲（表面が空になっても動作するようにdocumentで拾う）
        document.addEventListener('click', (e) => {
            if (e.target.id === 'speak-word-front') {
                e.stopPropagation();
                this.speak(document.getElementById('word-display').innerText);
            }
        });

        document.getElementById('speak-word-back').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('word-display-back').innerText); };
        document.getElementById('speak-example-back').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('example-display').innerText); };

        document.getElementById('btn-review').onclick = (e) => { e.stopPropagation(); this.handleMark('review'); };
        document.getElementById('btn-perfect').onclick = (e) => { e.stopPropagation(); this.handleMark('perfect'); };
        document.getElementById('btn-mastered').onclick = (e) => { e.stopPropagation(); this.handleMark('mastered'); };
        document.getElementById('btn-show').onclick = (e) => { e.stopPropagation(); this.showAnswer(); };
        document.getElementById('btn-start-quiz').onclick = () => this.startQuiz();
    },

    async handleMark(status) {
        let currentItem = isQuizMode ? quizQueue.shift() : this.getNormalList()[0];
        if (currentItem) {
            if (isQuizMode && (status === 'perfect' || status === 'mastered')) quizCorrectCount++;
            const idx = vocabulary.findIndex(v => String(v.id) === String(currentItem.id));
            vocabulary[idx].status = status;
            vocabulary[idx].lastReviewed = new Date().toISOString();
            await DB.save(vocabulary);
        }

        if (isQuizMode && quizQueue.length === 0) {
            setTimeout(() => this.showResult(), 400);
            isQuizMode = false;
        }

        this.hideAnswer(); // ここで表面を復活させる
        setTimeout(() => this.render(), 300);
    },

    showResult() {
        const percent = Math.round((quizCorrectCount / quizTotalCount) * 100);
        alert(`結果: ${quizCorrectCount}/${quizTotalCount} (${percent}%)\n${percent >= 70 ? "Gut gemacht!" : "Lass uns noch mal üben!"}`);
    },

    showAnswer() {
        const card = document.getElementById('card');
        const faceFront = document.getElementById('face-front');

        // 1. 表面の内容を退避させてから消去する
        if (!frontContentCache) frontContentCache = faceFront.innerHTML;

        card.classList.add('is-flipped');

        // アニメーション開始直後に中身を空にする（これでiPhoneでも突き抜ける要素がなくなる）
        faceFront.innerHTML = "";

        document.getElementById('btn-show').classList.add('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');
        const ex = document.getElementById('example-display').innerText;
        if (ex && ex !== "---") this.speak(ex);
    },

    hideAnswer() {
        const card = document.getElementById('card');
        const faceFront = document.getElementById('face-front');

        card.classList.remove('is-flipped');

        // 2. 表面がこちらを向くタイミングで中身を復元する
        if (frontContentCache) {
            faceFront.innerHTML = frontContentCache;
            frontContentCache = ""; // キャッシュをクリア
        }

        document.getElementById('btn-show').classList.remove('hidden');
        document.getElementById('action-buttons').classList.add('hidden');
    },

    render() {
        this.updateStats();
        const cur = isQuizMode ? quizQueue[0] : this.getNormalList()[0];

        // 常に「表面が見える状態」からスタートさせる
        const faceFront = document.getElementById('face-front');
        if (frontContentCache) {
            faceFront.innerHTML = frontContentCache;
            frontContentCache = "";
        }

        if (!cur) {
            document.getElementById('word-display').innerText = "学習完了！";
            return;
        }

        // データの流し込み
        document.getElementById('word-display').innerText = cur.word;
        document.getElementById('word-display-back').innerText = cur.word;
        document.getElementById('category-display-back').innerText = cur.category || "";
        document.getElementById('translation-display').innerText = cur.translation || "";
        document.getElementById('example-display').innerText = cur.example || "---";
        document.getElementById('example-translation-display').innerText = cur.example_translation || "";
    },

    getNormalList() {
        return vocabulary.filter(v => v.status !== 'mastered')
            .sort((a, b) => new Date(a.lastReviewed || 0) - new Date(b.lastReviewed || 0));
    },

    updateStats() {
        const m = vocabulary.filter(v => v.status === 'mastered').length;
        const p = vocabulary.filter(v => v.status === 'perfect').length;
        const total = vocabulary.length;
        const r = total - m - p;
        if (chartInstance) {
            chartInstance.data.datasets[0].data = [m, p, r < 0 ? 0 : r];
            chartInstance.update();
        }
        document.getElementById('stat-mastered').innerText = m;
        document.getElementById('stat-perfect').innerText = p;
        document.getElementById('stat-review').innerText = r < 0 ? 0 : r;
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
        const u = new SpeechSynthesisUtterance(t); u.lang = 'de-DE';
        window.speechSynthesis.speak(u);
    },

    startQuiz() {
        const pool = vocabulary.filter(v => v.status !== 'mastered');
        if (pool.length === 0) return alert("未習得の単語がありません。");
        quizQueue = [...pool].sort(() => 0.5 - Math.random()).slice(0, 20);
        quizTotalCount = quizQueue.length;
        quizCorrectCount = 0;
        isQuizMode = true; this.render();
    }
};
window.onload = () => App.init();