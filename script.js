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
            // ボタンクリック時は反転させない
            if (e.target.closest('.speak-btn-icon') || e.target.closest('.speak-btn-icon-sm')) return;
            const card = document.getElementById('card');
            if (!card.classList.contains('is-flipped')) this.showAnswer();
            else this.hideAnswer();
        };

        document.getElementById('speak-word-front').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('word-display').innerText); };
        document.getElementById('speak-word-back').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('word-display-back').innerText); };
        document.getElementById('speak-example-back').onclick = (e) => { e.stopPropagation(); this.speak(document.getElementById('example-display').innerText); };

        document.getElementById('btn-review').onclick = (e) => { e.stopPropagation(); this.handleMark('review'); };
        document.getElementById('btn-perfect').onclick = (e) => { e.stopPropagation(); this.handleMark('perfect'); };
        document.getElementById('btn-mastered').onclick = (e) => { e.stopPropagation(); this.handleMark('mastered'); };
        document.getElementById('btn-show').onclick = (e) => { e.stopPropagation(); this.showAnswer(); };
        document.getElementById('btn-start-quiz').onclick = () => this.startQuiz();
    },

    async handleMark(status) {
        this.hideAnswer();
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
        setTimeout(() => this.render(), 300);
    },

    showResult() {
        const percent = Math.round((quizCorrectCount / quizTotalCount) * 100);
        alert(`Quiz Beendet!\nResultat: ${quizCorrectCount}/${quizTotalCount} (${percent}%)\n${percent >= 70 ? "Super!" : "Noch mal!"}`);
    },

    showAnswer() {
        const card = document.getElementById('card');
        const faceFront = document.getElementById('face-front');
        const faceBack = document.getElementById('face-back');

        card.classList.add('is-flipped');

        // iPhone Safari対策：アニメーションの中間（0.3秒）で重なり順と透明度を操作
        setTimeout(() => {
            if (card.classList.contains('is-flipped')) {
                faceFront.style.opacity = "0";      // 表面を透明に
                faceFront.style.zIndex = "1";       // 表面を下に
                faceBack.style.zIndex = "2";        // 裏面を上に
            }
        }, 300);

        document.getElementById('btn-show').classList.add('hidden');
        document.getElementById('action-buttons').classList.remove('hidden');
        const ex = document.getElementById('example-display').innerText;
        if (ex && ex !== "---") this.speak(ex);
    },

    hideAnswer() {
        const card = document.getElementById('card');
        const faceFront = document.getElementById('face-front');
        const faceBack = document.getElementById('face-back');

        card.classList.remove('is-flipped');

        // 表に戻る時は即座に表面を表示、裏面を透明に
        faceFront.style.opacity = "1";
        faceFront.style.zIndex = "2";
        faceBack.style.zIndex = "1";

        document.getElementById('btn-show').classList.remove('hidden');
        document.getElementById('action-buttons').classList.add('hidden');
    },

    render() {
        this.updateStats();
        // 状態リセット
        const faceFront = document.getElementById('face-front');
        const faceBack = document.getElementById('face-back');
        document.getElementById('card').classList.remove('is-flipped');
        faceFront.style.opacity = "1";
        faceFront.style.zIndex = "2";
        faceBack.style.zIndex = "1";

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
        const list = vocabulary.filter(v => v.status !== 'mastered');
        // フィッシャー・イェーツのシャッフル（簡易版）
        return list.sort(() => Math.random() - 0.5);
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