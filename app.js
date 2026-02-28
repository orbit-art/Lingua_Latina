const STORAGE_KEY = 'latin.app.v3';
const THEME_KEY = 'latin.ui.theme';
const ACCENT_KEY = 'latin.ui.accent';
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
  const merged = {
    ...defaultState,
    ...data,
    words: Array.isArray(data.words) ? data.words : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
    stats: { ...defaultState.stats, ...(data.stats || {}) }
  };

  merged.words = dedupeWords(merged.words);
  merged.rules = dedupeRules(merged.rules);
  return merged;
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function el(id) { return document.getElementById(id); }
function getTodayStr() { return new Date().toISOString().slice(0, 10); }

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}


function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const norm = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = Number.parseInt(norm, 16);
  if (Number.isNaN(int)) return { r: 77, g: 243, b: 165 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function blendWithGray({ r, g, b }, ratio = 0.55, gray = 142) {
  return {
    r: Math.round(r * (1 - ratio) + gray * ratio),
    g: Math.round(g * (1 - ratio) + gray * ratio),
    b: Math.round(b * (1 - ratio) + gray * ratio)
  };
}

function applyTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', normalized);
  localStorage.setItem(THEME_KEY, normalized);
}

function applyAccent(hex) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#53A77D';
  const rgb = hexToRgb(safe);
  const muted = blendWithGray(rgb, 0.58, 146);
  const muted2 = blendWithGray(rgb, 0.7, 154);

  document.documentElement.style.setProperty('--accent', safe);
  document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  document.documentElement.style.setProperty('--accent-muted-rgb', `${muted.r}, ${muted.g}, ${muted.b}`);
  document.documentElement.style.setProperty('--accent-soft', `rgba(${muted.r}, ${muted.g}, ${muted.b}, .24)`);
  document.documentElement.style.setProperty('--accent-soft-2', `rgba(${muted2.r}, ${muted2.g}, ${muted2.b}, .22)`);
  document.documentElement.style.setProperty('--accent-glow', `rgba(${muted.r}, ${muted.g}, ${muted.b}, .24)`);
  localStorage.setItem(ACCENT_KEY, safe);
}

function initAppearance() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  const savedAccent = localStorage.getItem(ACCENT_KEY) || '#53A77D';
  applyTheme(savedTheme);
  applyAccent(savedAccent);

  if (el('themeSelect')) {
    el('themeSelect').value = savedTheme;
    el('themeSelect').addEventListener('change', (event) => applyTheme(event.target.value));
  }

  const accentButtons = document.querySelectorAll('.accent-dot');
  accentButtons.forEach((btn) => {
    const value = (btn.dataset.accent || '').toUpperCase();
    if (value === savedAccent.toUpperCase()) btn.classList.add('active');
    btn.addEventListener('click', () => {
      applyAccent(value);
      accentButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  if (!accentButtons.length && el('accentPicker')) {
    el('accentPicker').value = savedAccent;
    el('accentPicker').addEventListener('input', (event) => applyAccent(event.target.value));
  }
}

function dedupeWords(words) {
  const seen = new Set();
  return words.filter((word) => {
    const key = `${normalize(word.latin)}|${normalize(word.meaning)}`;
    if (!normalize(word.latin) || !normalize(word.meaning) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeRules(rules) {
  const seen = new Set();
  return rules.filter((rule) => {
    const key = `${normalize(rule.title)}|${normalize(rule.category)}|${normalize(rule.note)}`;
    if (!normalize(rule.title) || !normalize(rule.category) || !normalize(rule.note) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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


const LATIN_GLOSSARY_RU_LA = {
  'вода': 'aqua',
  'огонь': 'ignis',
  'земля': 'terra',
  'ветер': 'ventus',
  'небо': 'caelum',
  'любовь': 'amor',
  'солнце': 'sol',
  'луна': 'luna',
  'друг': 'amicus',
  'жизнь': 'vita',
  'смерть': 'mors',
  'дом': 'domus'
};

const LATIN_GLOSSARY_LA_RU = Object.fromEntries(
  Object.entries(LATIN_GLOSSARY_RU_LA).map(([ru, la]) => [la, ru])
);

async function fetchMyMemory(text, sourceLang, targetLang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('translate-api-failed');
  const payload = await response.json();
  return payload?.responseData?.translatedText?.trim() || '';
}

function isBadTranslation(query, translated) {
  if (!translated) return true;
  const q = normalize(query);
  const t = normalize(translated);
  if (!t || t === q) return true;
  if (t.length <= 2) return true;
  return false;
}

async function runTranslator(query, direction) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { source: 'empty', text: '', hints: [] };

  const local = direction === 'ru-la'
    ? state.words.filter((w) => normalize(w.meaning).includes(normalizedQuery) || normalize(w.latin).includes(normalizedQuery))
    : state.words.filter((w) => normalize(w.latin).includes(normalizedQuery) || normalize(w.meaning).includes(normalizedQuery));

  const glossary = direction === 'ru-la' ? LATIN_GLOSSARY_RU_LA[normalizedQuery] : LATIN_GLOSSARY_LA_RU[normalizedQuery];
  if (glossary) {
    return {
      source: 'glossary',
      text: direction === 'ru-la' ? `${query.trim()} → ${glossary}` : `${query.trim()} → ${glossary}`,
      hints: local.slice(0, 5).map((w) => `${w.latin} — ${w.meaning}`)
    };
  }

  try {
    let translated = '';

    if (direction === 'ru-la') {
      const english = await fetchMyMemory(query, 'ru', 'en');
      if (!isBadTranslation(query, english)) {
        translated = await fetchMyMemory(english, 'en', 'la');
      }
      if (isBadTranslation(query, translated)) {
        translated = await fetchMyMemory(query, 'ru', 'la');
      }
    } else {
      const english = await fetchMyMemory(query, 'la', 'en');
      if (!isBadTranslation(query, english)) {
        translated = await fetchMyMemory(english, 'en', 'ru');
      }
      if (isBadTranslation(query, translated)) {
        translated = await fetchMyMemory(query, 'la', 'ru');
      }
    }

    if (!isBadTranslation(query, translated)) {
      return {
        source: 'api',
        text: translated,
        hints: local.slice(0, 5).map((w) => `${w.latin} — ${w.meaning}`)
      };
    }
  } catch {
    // fallback below
  }

  if (local.length) {
    const primary = local[0];
    return {
      source: 'local',
      text: direction === 'ru-la' ? `${primary.meaning} → ${primary.latin}` : `${primary.latin} → ${primary.meaning}`,
      hints: local.slice(1, 6).map((w) => `${w.latin} — ${w.meaning}`)
    };
  }

  return { source: 'none', text: '', hints: [] };
}

function renderTranslatorResult(result, direction) {
  if (!el('translatorResult') || !el('translatorHints')) return;
  const resultNode = el('translatorResult');
  const hints = el('translatorHints');
  hints.innerHTML = '';

  if (result.source === 'empty') {
    resultNode.classList.add('muted');
    resultNode.textContent = 'Введи слово или фразу для перевода.';
    return;
  }

  if (result.source === 'none') {
    resultNode.classList.add('muted');
    resultNode.textContent = 'Не удалось найти перевод. Попробуй другое слово.';
    return;
  }

  resultNode.classList.remove('muted');
  const label = result.source === 'api' ? 'Онлайн-перевод' : (result.source === 'glossary' ? 'Базовый латинский словарь' : 'Перевод из словаря');
  resultNode.textContent = `${label}: ${result.text}`;

  result.hints.forEach((hint) => {
    const li = document.createElement('li');
    li.textContent = hint;
    hints.appendChild(li);
  });
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
  const term = normalize(el('wordSearch')?.value);
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
        renderStatsIfExists();
  renderTranslatorResult({ source: "empty", text: "", hints: [] }, "la-ru");
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
  const term = normalize(el('ruleSearch')?.value);
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
      imported.words = dedupeWords(Array.isArray(imported.words) ? imported.words : []);
      imported.rules = dedupeRules(Array.isArray(imported.rules) ? imported.rules : []);
      Object.assign(state, defaultState, imported);
      saveState();
      location.reload();
    } catch {
      alert('Ошибка импорта');
    }
  };
  reader.readAsText(file);
}

function wireMobileMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function wireEvents() {
  wireMobileMenu();

  el('translatorForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const direction = el('translatorDirection').value;
    const query = el('translatorInput').value;
    el('translatorResult').classList.add('muted');
    el('translatorResult').textContent = 'Перевожу...';
    const result = await runTranslator(query, direction);
    renderTranslatorResult(result, direction);
  });

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
    const latin = el('latinWord').value.trim();
    const meaning = el('wordMeaning').value.trim();
    const duplicateWord = state.words.some((word) => normalize(word.latin) === normalize(latin) && normalize(word.meaning) === normalize(meaning));
    if (duplicateWord) {
      alert('Такое слово с таким переводом уже есть в словаре.');
      return;
    }

    state.words.unshift({
      id: crypto.randomUUID(),
      latin,
      meaning,
      example: el('wordExample').value.trim(),
      difficulty: el('wordDifficulty').value,
      learned: false,
      createdAt: Date.now()
    });
    state.todayAdded += 1;
    e.target.reset();
    saveState();
    renderWordList();
    renderStatsIfExists();
  });

  el('wordSearch')?.addEventListener('input', renderWordList);
  el('wordFilter')?.addEventListener('change', renderWordList);

  el('ruleForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el('ruleTitle').value.trim();
    const category = el('ruleCategory').value.trim();
    const note = el('ruleNote').value.trim();
    const duplicateRule = state.rules.some((rule) => normalize(rule.title) === normalize(title) && normalize(rule.category) === normalize(category));
    if (duplicateRule) {
      alert('Такое правило уже есть в этой категории.');
      return;
    }

    state.rules.unshift({
      id: crypto.randomUUID(),
      title,
      category,
      note,
      createdAt: Date.now()
    });
    e.target.reset();
    saveState();
    renderRuleList();
    renderStatsIfExists();
  });

  el('ruleSearch')?.addEventListener('input', renderRuleList);

  el('randomCardBtn')?.addEventListener('click', randomCard);
  el('flipCardBtn')?.addEventListener('click', flipCard);

  el('typingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentTypingWord) return;
    const answer = normalize(el('typingAnswer').value);
    const expected = normalize(currentTypingWord.meaning);
    if (answer === expected) {
      state.stats.typingCorrect += 1;
      state.stats.correctAnswers += 1;
      el('typingFeedback').textContent = 'Отлично, верно!';
    } else {
      el('typingFeedback').textContent = `Почти! Правильно: ${currentTypingWord.meaning}`;
    }
    saveState();
    renderStatsIfExists();
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

  initAppearance();
  wireEvents();
  renderStatsIfExists();
  renderWordList();
  renderRuleList();
  randomCard();
  nextQuiz();
  nextTypingQuestion();
  saveState();
})();
