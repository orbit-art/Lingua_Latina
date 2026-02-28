const STORAGE_KEY = 'latin.app.v3';
const defaultState = {
  words: [],
  rules: [],
  stats: { correctAnswers: 0, quizzesTaken: 0, typingCorrect: 0 },
  goal: 5,
  todayAdded: 0,
  streak: 0,
  lastVisit: null
};

const state = loadState();
let currentCard = null;
let showTranslation = false;
let currentQuiz = null;
let currentTypingWord = null;

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

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function el(id) { return document.getElementById(id); }
function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function updateStreak() {
  const today = getTodayStr();
  if (!state.lastVisit) state.streak = 1;
  else {
    const diff = Math.round((new Date(today) - new Date(state.lastVisit)) / 86400000);
    if (diff === 1) state.streak += 1;
    else if (diff > 1) state.streak = 1;
  }
  state.lastVisit = today;
}

function labelDifficulty(v) {
  return ({ easy: 'лёгкое', medium: 'среднее', hard: 'сложное' }[v] || 'среднее');
}

function renderStatsIfExists() {
  if (!el('totalWords')) return;
  const learnedWords = state.words.filter((w) => w.learned).length;
  el('totalWords').textContent = String(state.words.length);
  el('learnedWords').textContent = String(learnedWords);
  el('totalRules').textContent = String(state.rules.length);
  el('correctAnswers').textContent = String(state.stats.correctAnswers);
  el('streakStatus').textContent = `Серия дней: ${state.streak}`;
  el('goalStatus').textContent = `Цель: ${state.todayAdded}/${state.goal} слов сегодня`;
  el('dailyGoalInput').value = state.goal;
}

function makeBtn(text, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `small-btn ${className}`;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderWordList() {
  if (!el('wordList')) return;
  const term = (el('wordSearch')?.value || '').trim().toLowerCase();
  const filter = el('wordFilter')?.value || 'all';
  const list = el('wordList');
  list.innerHTML = '';

  const words = state.words.filter((w) => {
    const match = [w.latin, w.meaning, w.example].join(' ').toLowerCase().includes(term);
    if (!match) return false;
    if (filter === 'learned') return w.learned;
    if (filter === 'notLearned') return !w.learned;
    if (filter === 'hard') return w.difficulty === 'hard';
    return true;
  });

  if (!words.length) {
    list.innerHTML = '<li>Нет слов по фильтру.</li>';
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
        renderWordList();
      }),
      makeBtn('Удалить', 'danger-btn', () => {
        state.words = state.words.filter((w) => w.id !== word.id);
        saveState();
        renderWordList();
        renderStatsIfExists();
      })
    );

    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `Сложность: ${labelDifficulty(word.difficulty)}${word.example ? ` • ${word.example}` : ''}`;

    li.append(head, actions, meta);
    list.appendChild(li);
  });
}

function renderRuleList() {
  if (!el('ruleList')) return;
  const term = (el('ruleSearch')?.value || '').trim().toLowerCase();
  const rules = state.rules.filter((r) => [r.title, r.category, r.note].join(' ').toLowerCase().includes(term));
  const list = el('ruleList');
  list.innerHTML = '';

  if (!rules.length) {
    list.innerHTML = '<li>Нет правил по фильтру.</li>';
    return;
  }

  rules.forEach((rule) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-head"><strong>${rule.title}</strong><span class="muted">${rule.category}</span></div><p>${rule.note}</p>`;
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(makeBtn('Удалить', 'danger-btn', () => {
      state.rules = state.rules.filter((r) => r.id !== rule.id);
      saveState();
      renderRuleList();
      renderStatsIfExists();
    }));
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function nextQuiz() {
  if (!el('quizQuestion')) return;
  if (state.words.length < 4) {
    el('quizQuestion').textContent = 'Добавь минимум 4 слова.';
    el('quizOptions').innerHTML = '';
    return;
  }

  const correctWord = state.words[Math.floor(Math.random() * state.words.length)];
  const distractors = state.words.filter((w) => w.id !== correctWord.id).sort(() => Math.random() - 0.5).slice(0, 3).map((w) => w.meaning);
  const options = [...distractors, correctWord.meaning].sort(() => Math.random() - 0.5);
  currentQuiz = { answer: correctWord.meaning };

  el('quizQuestion').textContent = `Перевод слова: ${correctWord.latin}`;
  el('quizOptions').innerHTML = '';
  el('quizFeedback').textContent = '';

  options.forEach((option) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-option';
    b.textContent = option;
    b.addEventListener('click', () => {
      state.stats.quizzesTaken += 1;
      if (option === currentQuiz.answer) {
        state.stats.correctAnswers += 1;
        el('quizFeedback').textContent = 'Верно!';
      } else {
        el('quizFeedback').textContent = `Неверно. Ответ: ${currentQuiz.answer}`;
      }
      saveState();
      renderStatsIfExists();
      setTimeout(nextQuiz, 700);
    });
    el('quizOptions').appendChild(b);
  });
}

function randomCard() {
  if (!el('flashcard')) return;
  if (!state.words.length) {
    el('flashcard').textContent = 'Добавь слова, чтобы начать.';
    currentCard = null;
    return;
  }
  currentCard = state.words[Math.floor(Math.random() * state.words.length)];
  showTranslation = false;
  el('flashcard').innerHTML = `<strong>${currentCard.latin}</strong>`;
}

function flipCard() {
  if (!currentCard || !el('flashcard')) return;
  showTranslation = !showTranslation;
  el('flashcard').innerHTML = showTranslation
    ? `<strong>${currentCard.meaning}</strong><br><span class="muted">${currentCard.latin}</span>`
    : `<strong>${currentCard.latin}</strong>`;
}

function nextTypingQuestion() {
  if (!el('typingQuestion')) return;
  if (!state.words.length) {
    el('typingQuestion').textContent = 'Добавь слова на странице «Слова».';
    currentTypingWord = null;
    return;
  }
  currentTypingWord = state.words[Math.floor(Math.random() * state.words.length)];
  el('typingQuestion').textContent = `Введи перевод: ${currentTypingWord.latin}`;
  el('typingFeedback').textContent = '';
  el('typingAnswer').value = '';
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lingua-latina-${getTodayStr()}.json`;
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
      location.reload();
    } catch {
      alert('Ошибка импорта');
    }
  };
  reader.readAsText(file);
}

function wireEvents() {
  el('goalForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.goal = Math.max(1, Number(el('dailyGoalInput').value) || 1);
    saveState();
    renderStatsIfExists();
  });

  el('exportBtn')?.addEventListener('click', exportData);
  el('importInput')?.addEventListener('change', (e) => e.target.files[0] && importData(e.target.files[0]));
  el('resetBtn')?.addEventListener('click', () => {
    if (!confirm('Удалить весь прогресс?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  el('wordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.words.unshift({
      id: crypto.randomUUID(),
      latin: el('latinWord').value.trim(),
      meaning: el('wordMeaning').value.trim(),
      example: el('wordExample').value.trim(),
      difficulty: el('wordDifficulty').value,
      learned: false,
      createdAt: Date.now()
    });
    state.todayAdded += 1;
    e.target.reset();
    saveState();
    renderWordList();
  });

  el('wordSearch')?.addEventListener('input', renderWordList);
  el('wordFilter')?.addEventListener('change', renderWordList);

  el('ruleForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    state.rules.unshift({
      id: crypto.randomUUID(),
      title: el('ruleTitle').value.trim(),
      category: el('ruleCategory').value.trim(),
      note: el('ruleNote').value.trim(),
      createdAt: Date.now()
    });
    e.target.reset();
    saveState();
    renderRuleList();
  });

  el('ruleSearch')?.addEventListener('input', renderRuleList);

  el('randomCardBtn')?.addEventListener('click', randomCard);
  el('flipCardBtn')?.addEventListener('click', flipCard);

  el('typingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentTypingWord) return;
    const answer = el('typingAnswer').value.trim().toLowerCase();
    const expected = currentTypingWord.meaning.trim().toLowerCase();
    if (answer === expected) {
      state.stats.typingCorrect += 1;
      state.stats.correctAnswers += 1;
      el('typingFeedback').textContent = 'Отлично, верно!';
    } else {
      el('typingFeedback').textContent = `Почти! Правильно: ${currentTypingWord.meaning}`;
    }
    saveState();
    setTimeout(nextTypingQuestion, 700);
  });
  el('newTypingBtn')?.addEventListener('click', nextTypingQuestion);
}

(function init() {
  const today = getTodayStr();
  if (state.lastVisit !== today) {
    if (!state.lastVisit || new Date(today) - new Date(state.lastVisit) > 86400000) state.todayAdded = 0;
    updateStreak();
  }

  wireEvents();
  renderStatsIfExists();
  renderWordList();
  renderRuleList();
  randomCard();
  nextQuiz();
  nextTypingQuestion();
  saveState();
})();
