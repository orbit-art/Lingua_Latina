const STORAGE_KEY = 'latin.app.v2';

const defaultState = {
  words: [],
  rules: [],
  stats: { correctAnswers: 0, quizzesTaken: 0 },
  goal: 5,
  todayAdded: 0,
  streak: 0,
  lastVisit: null
};

const state = loadState();
let currentCard = null;
let showTranslation = false;
let currentQuiz = null;

const refs = {
  totalWords: document.getElementById('totalWords'),
  learnedWords: document.getElementById('learnedWords'),
  totalRules: document.getElementById('totalRules'),
  correctAnswers: document.getElementById('correctAnswers'),
  goalStatus: document.getElementById('goalStatus'),
  streakStatus: document.getElementById('streakStatus'),
  flashcard: document.getElementById('flashcard'),
  quizQuestion: document.getElementById('quizQuestion'),
  quizOptions: document.getElementById('quizOptions'),
  quizFeedback: document.getElementById('quizFeedback'),
  wordList: document.getElementById('wordList'),
  ruleList: document.getElementById('ruleList')
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const data = raw ? JSON.parse(raw) : defaultState;
  return {
    ...defaultState,
    ...data,
    words: Array.isArray(data.words) ? data.words : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
    stats: { ...defaultState.stats, ...(data.stats || {}) }
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function updateStreak() {
  const today = getTodayStr();
  if (!state.lastVisit) {
    state.streak = 1;
  } else {
    const last = new Date(state.lastVisit);
    const now = new Date(today);
    const diff = Math.round((now - last) / 86400000);
    if (diff === 1) state.streak += 1;
    else if (diff > 1) state.streak = 1;
  }
  state.lastVisit = today;
}

function makeBtn(text, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `small-btn ${className}`;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function filteredWords() {
  const term = document.getElementById('wordSearch').value.trim().toLowerCase();
  const filter = document.getElementById('wordFilter').value;

  return state.words.filter((w) => {
    const matchTerm = [w.latin, w.meaning, w.example].join(' ').toLowerCase().includes(term);
    if (!matchTerm) return false;
    if (filter === 'learned') return w.learned;
    if (filter === 'notLearned') return !w.learned;
    if (filter === 'hard') return w.difficulty === 'hard';
    return true;
  });
}

function renderWordList() {
  refs.wordList.innerHTML = '';
  const words = filteredWords();

  if (!words.length) {
    refs.wordList.innerHTML = '<li>Пока ничего не найдено.</li>';
    return;
  }

  words.forEach((word) => {
    const li = document.createElement('li');

    const head = document.createElement('div');
    head.className = 'item-head';
    head.innerHTML = `<strong>${word.latin}</strong> — ${word.meaning}`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      makeBtn(word.learned ? 'В процессе' : 'Выучено', 'secondary-btn', () => {
        word.learned = !word.learned;
        saveState();
        renderAll();
      }),
      makeBtn('Удалить', 'danger-btn', () => {
        state.words = state.words.filter((w) => w.id !== word.id);
        saveState();
        renderAll();
      })
    );

    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `Сложность: ${labelDifficulty(word.difficulty)}${word.example ? ` • Пример: ${word.example}` : ''}`;

    li.append(head, actions, meta);
    refs.wordList.appendChild(li);
  });
}

function renderRuleList() {
  const term = document.getElementById('ruleSearch').value.trim().toLowerCase();
  refs.ruleList.innerHTML = '';

  const rules = state.rules.filter((rule) =>
    [rule.title, rule.category, rule.note].join(' ').toLowerCase().includes(term)
  );

  if (!rules.length) {
    refs.ruleList.innerHTML = '<li>Нет правил по текущему запросу.</li>';
    return;
  }

  rules.forEach((rule) => {
    const li = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'item-head';
    head.innerHTML = `<strong>${rule.title}</strong> <span class="muted">(${rule.category})</span>`;
    const note = document.createElement('p');
    note.textContent = rule.note;
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      makeBtn('Удалить', 'danger-btn', () => {
        state.rules = state.rules.filter((r) => r.id !== rule.id);
        saveState();
        renderAll();
      })
    );
    li.append(head, note, actions);
    refs.ruleList.appendChild(li);
  });
}

function renderStats() {
  const learnedWords = state.words.filter((w) => w.learned).length;
  refs.totalWords.textContent = String(state.words.length);
  refs.learnedWords.textContent = String(learnedWords);
  refs.totalRules.textContent = String(state.rules.length);
  refs.correctAnswers.textContent = String(state.stats.correctAnswers);

  refs.goalStatus.textContent = `Цель: ${state.todayAdded}/${state.goal} новых слов сегодня.`;
  refs.streakStatus.textContent = `Серия дней без пропуска: ${state.streak}.`;
  document.getElementById('dailyGoalInput').value = state.goal;
}

function labelDifficulty(value) {
  return ({ easy: 'лёгкое', medium: 'среднее', hard: 'сложное' }[value] || 'среднее');
}

function nextQuiz() {
  if (state.words.length < 4) {
    refs.quizQuestion.textContent = 'Добавь минимум 4 слова для запуска теста.';
    refs.quizOptions.innerHTML = '';
    return;
  }

  const index = Math.floor(Math.random() * state.words.length);
  const correctWord = state.words[index];
  const distractors = state.words
    .filter((w) => w.id !== correctWord.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((w) => w.meaning);

  const options = [...distractors, correctWord.meaning].sort(() => Math.random() - 0.5);
  currentQuiz = { answer: correctWord.meaning, latin: correctWord.latin, options };

  refs.quizQuestion.textContent = `Что означает: ${correctWord.latin}?`;
  refs.quizOptions.innerHTML = '';
  refs.quizFeedback.textContent = '';

  options.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quiz-option';
    btn.textContent = option;
    btn.addEventListener('click', () => checkQuizAnswer(option));
    refs.quizOptions.appendChild(btn);
  });
}

function checkQuizAnswer(option) {
  if (!currentQuiz) return;
  state.stats.quizzesTaken += 1;
  if (option === currentQuiz.answer) {
    state.stats.correctAnswers += 1;
    refs.quizFeedback.textContent = 'Верно! Отличная работа.';
  } else {
    refs.quizFeedback.textContent = `Неверно. Правильный ответ: ${currentQuiz.answer}`;
  }
  saveState();
  renderStats();
  setTimeout(nextQuiz, 900);
}

function randomCard() {
  if (!state.words.length) {
    refs.flashcard.textContent = 'Добавь слова, чтобы начать повторение.';
    currentCard = null;
    return;
  }
  currentCard = state.words[Math.floor(Math.random() * state.words.length)];
  showTranslation = false;
  refs.flashcard.innerHTML = `<strong>${currentCard.latin}</strong>`;
}

function flipCard() {
  if (!currentCard) return;
  showTranslation = !showTranslation;
  refs.flashcard.innerHTML = showTranslation
    ? `<strong>${currentCard.meaning}</strong><br><span class="muted">${currentCard.latin}</span>`
    : `<strong>${currentCard.latin}</strong>`;
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lingua-latina-backup-${getTodayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      Object.assign(state, defaultState, imported);
      saveState();
      renderAll();
      nextQuiz();
      randomCard();
    } catch {
      alert('Ошибка импорта: проверь JSON файл.');
    }
  };
  reader.readAsText(file);
}

function renderAll() {
  renderStats();
  renderWordList();
  renderRuleList();
}

function wireEvents() {
  document.getElementById('wordForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const latin = document.getElementById('latinWord').value.trim();
    const meaning = document.getElementById('wordMeaning').value.trim();
    const example = document.getElementById('wordExample').value.trim();
    const difficulty = document.getElementById('wordDifficulty').value;

    state.words.unshift({
      id: crypto.randomUUID(),
      latin,
      meaning,
      example,
      difficulty,
      learned: false,
      createdAt: Date.now()
    });

    state.todayAdded += 1;
    event.target.reset();
    saveState();
    renderAll();
    nextQuiz();
    randomCard();
  });

  document.getElementById('ruleForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.rules.unshift({
      id: crypto.randomUUID(),
      title: document.getElementById('ruleTitle').value.trim(),
      category: document.getElementById('ruleCategory').value.trim(),
      note: document.getElementById('ruleNote').value.trim(),
      createdAt: Date.now()
    });
    event.target.reset();
    saveState();
    renderAll();
  });

  document.getElementById('goalForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.goal = Math.max(1, Number(document.getElementById('dailyGoalInput').value) || 1);
    saveState();
    renderStats();
  });

  document.getElementById('wordSearch').addEventListener('input', renderWordList);
  document.getElementById('wordFilter').addEventListener('change', renderWordList);
  document.getElementById('ruleSearch').addEventListener('input', renderRuleList);

  document.getElementById('scrollToVocabBtn').addEventListener('click', () => {
    document.getElementById('vocabSection').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('startPracticeBtn').addEventListener('click', () => {
    document.getElementById('practiceSection').scrollIntoView({ behavior: 'smooth' });
    nextQuiz();
  });

  document.getElementById('randomCardBtn').addEventListener('click', randomCard);
  document.getElementById('flipCardBtn').addEventListener('click', flipCard);
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importInput').addEventListener('change', (event) => {
    if (event.target.files[0]) importData(event.target.files[0]);
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Удалить весь прогресс?')) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, JSON.parse(JSON.stringify(defaultState)));
    updateStreak();
    saveState();
    renderAll();
    nextQuiz();
    randomCard();
  });
}

(function init() {
  const today = getTodayStr();
  if (state.lastVisit !== today) {
    if (!state.lastVisit || new Date(today) - new Date(state.lastVisit) > 86400000) {
      state.todayAdded = 0;
    }
    updateStreak();
  }

  wireEvents();
  renderAll();
  nextQuiz();
  randomCard();
  saveState();
})();
