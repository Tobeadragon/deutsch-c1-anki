let vocabulary = [];
let chartInstance = null;
let quizQueue = [];
let isQuizMode = false;
let quizCorrectCount = 0;
let quizTotalCount = 0;

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
            else card.classList.remove('is-flipped');
        };

        document.getElementById('speak-word-front').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('word-display').innerText); };
        document.getElementById('speak-word-back').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('word-display').innerText); };
        document.getElementById('speak-example-back').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('example-display').innerText); };

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
            if (isQuizMode && (status === 'perfect' || status === 'mastered')) quizCorrectCount++;
            const idx = vocabulary.findIndex(v => String(v.id) === String(currentItem.id));
            vocabulary[idx].status = status;
            vocabulary[idx].lastReviewed = new Date().toISOString();
            await DB.save(vocabulary);
        }

        if (isQuizMode && quizQueue.length === 0) {
            this.showResult();
            isQuizMode = false;
        }
        setTimeout(() => this.render(), 300);
    },

    showResult() {
        const percent = Math.round((quizCorrectCount / quizTotalCount) * 100);
        let msg = percent === 100 ? "完璧！🎉" : percent >= 70 ? "すごい！👍" : "復習しましょう🔥";
        alert(`結果: ${quizCorrectCount}/${quizTotalCount} (${percent}%)\n${msg}`);
    },

    showAnswer() {
        document.getElementById('card').classList.add('is-flipped');
        document.getElementById('btn-show').classList.add('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');
        const ex = document.getElementById('example-display').innerText;
        if (ex && ex !== "---") this.speak(ex);
    },

    render() {
        this.updateStats();
        document.getElementById('card').classList.remove('is-flipped');
        document.getElementById('btn-show').classList.remove('hidden');
        document.getElementById('action-buttons').classList.add('hidden');

        const cur = isQuizMode ? quizQueue[0] : this.getNormalList()[0];
        if (!cur) {
            document.getElementById('word-display').innerText = "学習完了！";
            return;
        }
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
        const r = vocabulary.length - m - p;
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