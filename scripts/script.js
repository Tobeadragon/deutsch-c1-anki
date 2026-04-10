let vocabulary = [];
let chartInstance = null;

let quizQueue = [];
let isQuizMode = false;
let quizCorrectCount = 0;
let quizTotalCount = 0;

let isMultipleChoiceMode = false;
let mcQueue = [];
let mcCorrectCount = 0;
let mcTotalCount = 0;
let mcCurrentChoices = [];
let mcAnswered = false;

const App = {
    async init() {
        // 1. デッキリストの読み込みとセレクトボックス生成
        await this.initDeckSelector();

        // 2. 単語データの読み込み
        vocabulary = await DB.fetchAll();

        this.initChart();
        this.bindEvents();
        this.render();
    },

    async initDeckSelector() {
        const selector = document.getElementById('deck-select');
        if (!selector) return;

        const userDecks = await DB.fetchUserDecks();
        const nameMap = {
            'FREE_SAMPLE': '🆓 無料サンプル',
            'A1_FULL': '🇩🇪 ドイツ語 A1',
            'B1_VOL1': '🇩🇪 ドイツ語 B1',
            'C1_VOL1': '🇩🇪 ドイツ語 C1',
            'User_Deck': '⭐ マイ辞書 (自分専用)'
        };

        selector.innerHTML = '';

        if (userDecks.length === 0) {
            selector.innerHTML = '<option>許可されたデッキがありません</option>';
            return;
        }

        userDecks.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deck_id;
            opt.innerText = nameMap[d.deck_id] || d.deck_id.replace(/_/g, ' ');

            const currentInUrl = new URLSearchParams(window.location.search).get('deck') || 'FREE_SAMPLE';
            if (d.deck_id === currentInUrl) opt.selected = true;
            selector.appendChild(opt);
        });

        selector.onchange = (e) => {
            const newDeck = e.target.value;
            window.location.href = window.location.pathname + '?deck=' + newDeck;
        };
    },

    bindEvents() {
        document.getElementById('card').onclick = (e) => {
            if (e.target.closest('.speak-btn-icon') || e.target.closest('.speak-btn-icon-sm')) return;
            if (isMultipleChoiceMode) return;
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

        const btnQuiz = document.getElementById('btn-start-quiz');
        const btnMC = document.getElementById('btn-start-mc');
        if (btnQuiz) btnQuiz.onclick = () => this.startQuiz();
        if (btnMC) btnMC.onclick = () => this.startMultipleChoice();
    },

    async handleMark(status) {
        this.hideAnswer();
        let currentItem = isQuizMode ? quizQueue.shift() : this.getNormalList()[0];
        if (currentItem) {
            if (isQuizMode && (status === 'perfect' || status === 'mastered')) quizCorrectCount++;
            const idx = vocabulary.findIndex(v => String(v.id) === String(currentItem.id));
            vocabulary[idx].status = status;
            vocabulary[idx].lastReviewed = new Date().toISOString();
            await DB.saveProgress(vocabulary);
        }
        if (isQuizMode && quizQueue.length === 0) {
            setTimeout(() => this.showQuizResult(), 400);
            isQuizMode = false;
        }
        setTimeout(() => this.render(), 300);
    },

    showAnswer() {
        const card = document.getElementById('card');
        const faceFront = document.getElementById('face-front');
        const faceBack = document.getElementById('face-back');
        card.classList.add('is-flipped');
        setTimeout(() => {
            if (card.classList.contains('is-flipped')) {
                faceFront.style.opacity = "0";
                faceFront.style.zIndex = "1";
                faceBack.style.zIndex = "2";
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
        faceFront.style.opacity = "1";
        faceFront.style.zIndex = "2";
        faceBack.style.zIndex = "1";
        document.getElementById('btn-show').classList.remove('hidden');
        document.getElementById('action-buttons').classList.add('hidden');
    },

    startQuiz() {
        const pool = vocabulary.filter(v => v.status !== 'mastered');
        if (pool.length === 0) return alert("未習得の単語がありません。");
        quizQueue = [...pool].sort(() => 0.5 - Math.random()).slice(0, 20);
        quizTotalCount = quizQueue.length;
        quizCorrectCount = 0;
        isQuizMode = true;
        this.render();
    },

    showQuizResult() {
        const pct = Math.round((quizCorrectCount / quizTotalCount) * 100);
        alert(`Quiz Beendet!\nResultat: ${quizCorrectCount}/${quizTotalCount} (${pct}%)\n${pct >= 70 ? "Super! 🎉" : "Noch mal! 💪"}`);
    },

    startMultipleChoice() {
        const pool = vocabulary.filter(v => v.status !== 'mastered');
        if (pool.length < 4) return alert("4択には最低4単語が必要です。");
        mcQueue = [...pool].sort(() => 0.5 - Math.random()).slice(0, 20);
        mcTotalCount = mcQueue.length;
        mcCorrectCount = 0;
        isMultipleChoiceMode = true;
        isQuizMode = false;
        document.getElementById('card-section').classList.add('hidden');
        document.getElementById('mc-launch-wrap') && document.getElementById('mc-launch-wrap').classList.add('hidden');
        document.getElementById('mc-section').classList.remove('hidden');
        this.renderMC();
    },

    renderMC() {
        if (mcQueue.length === 0) { this.showMCResult(); return; }
        mcAnswered = false;
        const current = mcQueue[0];
        const qNum = mcTotalCount - mcQueue.length + 1;
        const pct = Math.round(((qNum - 1) / mcTotalCount) * 100);
        document.getElementById('mc-progress-bar').style.width = pct + '%';
        document.getElementById('mc-progress-text').innerText = `${qNum} / ${mcTotalCount}`;
        document.getElementById('mc-score-text').innerText = `正解: ${mcCorrectCount}`;
        document.getElementById('mc-word').innerText = current.word;
        document.getElementById('mc-category').innerText = current.category || '';
        this.speak(current.word);
        const wrongs = vocabulary
            .filter(v => String(v.id) !== String(current.id))
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);
        mcCurrentChoices = [...wrongs, current].sort(() => 0.5 - Math.random());
        const labels = ['A', 'B', 'C', 'D'];
        const container = document.getElementById('mc-choices');
        container.innerHTML = '';
        mcCurrentChoices.forEach((item, i) => {
            const btn = document.createElement('button');
            btn.className = 'mc-choice-btn';
            btn.dataset.id = item.id;
            btn.innerHTML = `<span class="mc-label">${labels[i]}</span><span class="mc-text">${item.translation}</span>`;
            btn.onclick = () => this.handleMCAnswer(item, btn);
            container.appendChild(btn);
        });
        document.getElementById('mc-feedback').classList.add('hidden');
        document.getElementById('mc-next-btn').classList.add('hidden');
    },

    handleMCAnswer(selected, btn) {
        if (mcAnswered) return;
        mcAnswered = true;
        const current = mcQueue[0];
        const isCorrect = String(selected.id) === String(current.id);
        document.querySelectorAll('.mc-choice-btn').forEach((b, i) => {
            b.disabled = true;
            if (String(mcCurrentChoices[i].id) === String(current.id)) b.classList.add('mc-correct');
            else if (b === btn && !isCorrect) b.classList.add('mc-wrong');
        });
        const feedback = document.getElementById('mc-feedback');
        feedback.classList.remove('hidden', 'mc-feedback-correct', 'mc-feedback-wrong');
        if (isCorrect) {
            mcCorrectCount++;
            feedback.classList.add('mc-feedback-correct');
            feedback.innerHTML = `<div class="mc-feedback-icon">✓</div><div class="mc-feedback-main">正解！</div><p class="mc-feedback-example">${current.example}</p><p class="mc-feedback-example-tr">${current.example_translation}</p>`;
            this.upgradeMCStatus(current);
        } else {
            feedback.classList.add('mc-feedback-wrong');
            feedback.innerHTML = `<div class="mc-feedback-icon">✗</div><div class="mc-feedback-main">不正解 — 正解は「${current.translation}」</div><p class="mc-feedback-example">${current.example}</p><p class="mc-feedback-example-tr">${current.example_translation}</p>`;
            this.speak(current.example);
        }
        document.getElementById('mc-next-btn').classList.remove('hidden');
    },

    async upgradeMCStatus(item) {
        const idx = vocabulary.findIndex(v => String(v.id) === String(item.id));
        if (idx === -1) return;
        const map = { new: 'review', review: 'perfect', perfect: 'mastered', mastered: 'mastered' };
        vocabulary[idx].status = map[vocabulary[idx].status] || 'review';
        vocabulary[idx].lastReviewed = new Date().toISOString();
        await DB.saveProgress(vocabulary);
    },

    mcNext() {
        mcQueue.shift();
        mcQueue.length === 0 ? this.showMCResult() : this.renderMC();
    },

    showMCResult() {
        const pct = Math.round((mcCorrectCount / mcTotalCount) * 100);
        let grade = 'C', msg = 'Noch mal üben! 💪';
        if (pct >= 90) { grade = 'S'; msg = 'Ausgezeichnet! 🏆'; }
        else if (pct >= 70) { grade = 'A'; msg = 'Sehr gut! 🎉'; }
        else if (pct >= 50) { grade = 'B'; msg = 'Gut gemacht! 👍'; }
        document.getElementById('mc-section').innerHTML = `
            <div class="mc-result">
                <div class="mc-result-grade grade-${grade.toLowerCase()}">${grade}</div>
                <div class="mc-result-score">${mcCorrectCount} <span class="mc-result-total">/ ${mcTotalCount}</span></div>
                <div class="mc-result-pct">${pct}%</div>
                <div class="mc-result-msg">${msg}</div>
                <button class="btn btn--show mc-result-btn" onclick="App.exitMC()">学習に戻る</button>
            </div>
        `;
        isMultipleChoiceMode = false;
        this.updateStats();
    },

    exitMC() {
        isMultipleChoiceMode = false;
        document.getElementById('mc-section').classList.add('hidden');
        document.getElementById('card-section').classList.remove('hidden');
        if (document.getElementById('mc-launch-wrap')) document.getElementById('mc-launch-wrap').classList.remove('hidden');
        this.render();
    },

    render() {
        this.updateStats();
        const card = document.getElementById('card');
        const faceFront = document.getElementById('face-front');
        const faceBack = document.getElementById('face-back');
        card.classList.remove('is-flipped');
        faceFront.style.opacity = "1";
        faceFront.style.zIndex = "2";
        faceBack.style.zIndex = "1";
        const list = isQuizMode ? quizQueue : this.getNormalList();
        const cur = list[0];
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

    // script.js の getNormalList を修正
    getNormalList() {
        const now = new Date();

        // 1. 「今日が復習予定日」かつ「未習得」の単語を抽出
        const reviewList = vocabulary.filter(v => {
            const nextDate = v.next_review_date ? new Date(v.next_review_date) : new Date(0);
            return v.status !== 'mastered' && nextDate <= now;
        });

        // 2. 復習対象がなければ、新しい単語（statusがnewのものなど）を混ぜる
        if (reviewList.length === 0) {
            return vocabulary.filter(v => v.status !== 'mastered').slice(0, 10);
        }

        // シャッフルして返す
        return reviewList.sort(() => 0.5 - Math.random());
    },

    updateStats() {
        const m = vocabulary.filter(v => v.status === 'mastered').length;
        const p = vocabulary.filter(v => v.status === 'perfect').length;
        const total = vocabulary.length;
        const r = Math.max(0, total - m - p);
        if (chartInstance) {
            chartInstance.data.datasets[0].data = [m, p, r];
            chartInstance.update();
        }
        document.getElementById('stat-mastered').innerText = m;
        document.getElementById('stat-perfect').innerText = p;
        document.getElementById('stat-review').innerText = r;
        const pct = total > 0 ? Math.round((m / total) * 100) : 0;
        if (document.getElementById('mastery-bar')) document.getElementById('mastery-bar').style.width = pct + '%';
        if (document.getElementById('mastery-pct')) document.getElementById('mastery-pct').innerText = pct + '%';
    },

    initChart() {
        const ctx = document.getElementById('progressChart').getContext('2d');
        if (!ctx) return;
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
    }
};

window.onload = () => App.init();