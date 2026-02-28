const STORAGE_KEY = 'latin.app.v4';
const THEME_KEY = 'latin.ui.theme';
const ACCENT_KEY = 'latin.ui.accent';

const PARTS_OF_SPEECH = {
  noun: 'Существительное',
  verb: 'Глагол',
  adjective: 'Прилагательное',
  adverb: 'Наречие',
  phrase: 'Фраза/выражение',
  other: 'Другое'
};

const defaultState = {
  words: [],
  rules: [],
  idioms: [],
  stats: {
    correctAnswers: 0,
    quizzesTaken: 0,
    typingCorrect: 0,
    xp: 0,
    answerStreak: 0
  },
  activity: {},
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
  const parsed = raw ? JSON.parse(raw) : {};

  // migration from v3
  const legacyRaw = !raw ? localStorage.getItem('latin.app.v3') : null;
  const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : {};
  const data = raw ? parsed : legacyParsed;

  const merged = {
    ...defaultState,
    ...data,
    words: Array.isArray(data.words) ? data.words : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
    idioms: Array.isArray(data.idioms) ? data.idioms : [],
    activity: typeof data.activity === 'object' && data.activity ? data.activity : {},
    stats: { ...defaultState.stats, ...(data.stats || {}) }
  };

  merged.words = dedupeWords(merged.words).map((word) => ({
    ...word,
    tags: Array.isArray(word.tags) ? word.tags : [],
    partOfSpeech: word.partOfSpeech || 'other'
  }));
  merged.rules = dedupeRules(merged.rules);
  merged.idioms = dedupeIdioms(merged.idioms);
  return merged;
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function el(id) { return document.getElementById(id); }
function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function normalize(value) { return String(value || '').trim().toLowerCase(); }

function ensureActivityDay(date = getTodayStr()) {
  if (!state.activity[date]) state.activity[date] = { wordsAdded: 0, correct: 0 };
  return state.activity[date];
}

function markWordAdded() {
  const day = ensureActivityDay();
  day.wordsAdded += 1;
}

function markCorrectAnswer() {
  const day = ensureActivityDay();
  day.correct += 1;
  state.stats.correctAnswers += 1;
  state.stats.xp += 10;
  state.stats.answerStreak += 1;
  if (state.stats.answerStreak > 0 && state.stats.answerStreak % 5 === 0) state.stats.xp += 50;
}

function markIncorrectAnswer() {
  state.stats.answerStreak = 0;
}

function getLevel() {
  return Math.floor((state.stats.xp || 0) / 120) + 1;
}

function levelProgressPercent() {
  const xp = state.stats.xp || 0;
  return Math.round(((xp % 120) / 120) * 100);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const norm = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = Number.parseInt(norm, 16);
  if (Number.isNaN(int)) return { r: 83, g: 167, b: 125 };
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

function dedupeIdioms(idioms) {
  const seen = new Set();
  return idioms.filter((idiom) => {
    const key = `${normalize(idiom.latin)}|${normalize(idiom.literal)}|${normalize(idiom.meaning)}`;
    if (!normalize(idiom.latin) || !normalize(idiom.literal) || !normalize(idiom.meaning) || seen.has(key)) return false;
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

function labelPartOfSpeech(v) {
  return PARTS_OF_SPEECH[v] || PARTS_OF_SPEECH.other;
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

async function fetchMyMemoryPayload(text, sourceLang, targetLang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('translate-api-failed');
  return response.json();
}

function pickBestTranslation(payload, query) {
  const primary = payload?.responseData?.translatedText?.trim() || '';
  if (!isBadTranslation(query, primary)) return primary;

  const fromMatches = (payload?.matches || [])
    .map((m) => String(m.translation || '').trim())
    .find((candidate) => !isBadTranslation(query, candidate));

  return fromMatches || '';
}

function collectVariants(payload, query, limit = 8) {
  const items = [];
  const seen = new Set();

  const add = (value) => {
    const text = String(value || '').trim();
    const key = normalize(text);
    if (!text || seen.has(key) || isBadTranslation(query, text)) return;
    seen.add(key);
    items.push(text);
  };

  add(payload?.responseData?.translatedText);
  (payload?.matches || []).forEach((m) => add(m.translation));
  return items.slice(0, limit);
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
      text: glossary,
      hints: local.slice(0, 6).map((w) => `${w.latin} — ${w.meaning}`)
    };
  }

  try {
    const sourceLang = direction === 'ru-la' ? 'ru' : 'la';
    const targetLang = direction === 'ru-la' ? 'la' : 'ru';
    const pivotLang = 'en';

    const directPayload = await fetchMyMemoryPayload(query, sourceLang, targetLang);
    let best = pickBestTranslation(directPayload, query);
    let variants = collectVariants(directPayload, query);

    if (isBadTranslation(query, best)) {
      const pivotPayload = await fetchMyMemoryPayload(query, sourceLang, pivotLang);
      const pivotBest = pickBestTranslation(pivotPayload, query);
      if (!isBadTranslation(query, pivotBest)) {
        const targetPayload = await fetchMyMemoryPayload(pivotBest, pivotLang, targetLang);
        const bestFromPivot = pickBestTranslation(targetPayload, pivotBest);
        const pivotVariants = collectVariants(targetPayload, pivotBest);
        if (!isBadTranslation(query, bestFromPivot)) best = bestFromPivot;
        variants = [...new Set([...variants, ...pivotVariants])].slice(0, 8);
      }
    }

    if (!isBadTranslation(query, best)) {
      return {
        source: 'api',
        text: best,
        hints: [...new Set([...variants, ...local.map((w) => direction === 'ru-la' ? w.latin : w.meaning)])].slice(0, 8)
      };
    }
  } catch {
    // fallbacks below
  }

  if (local.length) {
    return {
      source: 'local',
      text: direction === 'ru-la' ? local[0].latin : local[0].meaning,
      hints: local.slice(1, 8).map((w) => `${w.latin} — ${w.meaning}`)
    };
  }

  return { source: 'none', text: '', hints: [] };
}

function renderTranslatorResult(result) {
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
  const label = result.source === 'api' ? 'Онлайн-перевод' : (result.source === 'glossary' ? 'Базовый словарь' : 'Перевод из словаря');
  resultNode.textContent = `${label}: ${result.text}`;

  result.hints.forEach((hint) => {
    const li = document.createElement('li');
    li.textContent = hint;
    hints.appendChild(li);
  });
}

function getAchievements() {
  const learnedVerbs = state.words.filter((w) => w.learned && w.partOfSpeech === 'verb').length;
  return [
    {
      id: 'first10',
      title: 'Первые 10 слов',
      icon: '🎯',
      done: state.words.length >= 10,
      desc: `${Math.min(state.words.length, 10)}/10`
    },
    {
      id: 'week',
      title: 'Неделя без пропусков',
      icon: '🔥',
      done: state.streak >= 7,
      desc: `${Math.min(state.streak, 7)}/7 дней`
    },
    {
      id: 'verbMaster',
      title: 'Мастер глаголов',
      icon: '⚔️',
      done: learnedVerbs >= 10,
      desc: `${Math.min(learnedVerbs, 10)}/10 выученных глаголов`
    }
  ];
}

function renderStatsIfExists() {
  if (!el('totalWords')) return;
  const learnedWords = state.words.filter((w) => w.learned).length;
  const progress = state.goal > 0 ? Math.min(100, Math.round((state.todayAdded / state.goal) * 100)) : 0;

  el('totalWords').textContent = String(state.words.length);
  el('learnedWords').textContent = String(learnedWords);
  el('totalRules').textContent = String(state.rules.length);
  el('correctAnswers').textContent = String(state.stats.correctAnswers);

  if (el('xpValue')) el('xpValue').textContent = String(state.stats.xp || 0);
  if (el('levelValue')) el('levelValue').textContent = String(getLevel());
  if (el('goalStatus')) el('goalStatus').textContent = `Цель: ${state.todayAdded}/${state.goal} слов сегодня`;
  if (el('dailyGoalInput')) el('dailyGoalInput').value = state.goal;
  if (el('streakStatus')) el('streakStatus').textContent = `Серия дней: ${state.streak}`;

  if (el('goalProgressText')) el('goalProgressText').textContent = `█████░░ ${progress}%`;
  if (el('goalProgressFill')) el('goalProgressFill').style.width = `${progress}%`;

  if (el('fireBadge')) {
    el('fireBadge').classList.toggle('is-hot', state.streak >= 3);
    el('fireBadge').textContent = state.streak >= 3 ? `🔥 ${state.streak} дня подряд` : '🔥 Серия < 3 дней';
  }

  renderAchievements();
  renderStatsDashboard();
  renderWeeklyChart();
  renderCalendar();
}

function renderAchievements() {
  if (!el('achievementsList')) return;
  el('achievementsList').innerHTML = '';
  getAchievements().forEach((achievement) => {
    const li = document.createElement('li');
    li.className = `achievement ${achievement.done ? 'done' : ''}`;
    li.innerHTML = `<strong>${achievement.icon} ${achievement.title}</strong><span class="muted">${achievement.done ? 'Выполнено' : achievement.desc}</span>`;
    el('achievementsList').appendChild(li);
  });

  if (el('levelProgressFill')) el('levelProgressFill').style.width = `${levelProgressPercent()}%`;
  if (el('levelProgressText')) el('levelProgressText').textContent = `${levelProgressPercent()}% до следующего уровня`;
}

function makeBtn(text, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `small-btn ${className}`;
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function parseTags(input) {
  return String(input || '')
    .split(',')
    .map((tag) => normalize(tag))
    .filter(Boolean);
}

function renderWordList() {
  if (!el('wordList')) return;
  const term = normalize(el('wordSearch')?.value);
  const filter = el('wordFilter')?.value || 'all';
  const posFilter = el('wordPartFilter')?.value || 'all';
  const sortBy = el('wordSort')?.value || 'newest';
  const list = el('wordList');
  list.innerHTML = '';

  const words = state.words
    .filter((w) => {
      const tagsText = (w.tags || []).join(' ');
      const match = [w.latin, w.meaning, w.example, tagsText, labelPartOfSpeech(w.partOfSpeech)].join(' ').toLowerCase().includes(term);
      if (!match) return false;
      if (filter === 'learned') return w.learned;
      if (filter === 'notLearned') return !w.learned;
      if (filter === 'hard') return w.difficulty === 'hard';
      if (posFilter !== 'all' && w.partOfSpeech !== posFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'latin-asc') return a.latin.localeCompare(b.latin, 'ru');
      if (sortBy === 'latin-desc') return b.latin.localeCompare(a.latin, 'ru');
      if (sortBy === 'difficulty') {
        const rank = { hard: 3, medium: 2, easy: 1 };
        return (rank[b.difficulty] || 0) - (rank[a.difficulty] || 0);
      }
      if (sortBy === 'learned-first') return Number(b.learned) - Number(a.learned);
      return (b.createdAt || 0) - (a.createdAt || 0);
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
      }),
      makeBtn('Удалить', 'danger-btn', () => {
        state.words = state.words.filter((w) => w.id !== word.id);
        saveState();
        renderWordList();
        renderStatsIfExists();
      })
    );

    const tags = (word.tags || []).length ? ` • Теги: ${(word.tags || []).join(', ')}` : '';
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `${labelPartOfSpeech(word.partOfSpeech)} • Сложность: ${labelDifficulty(word.difficulty)}${tags}${word.example ? ` • ${word.example}` : ''}`;

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

function renderIdiomsList() {
  if (!el('idiomList')) return;
  const term = normalize(el('idiomSearch')?.value);
  const list = el('idiomList');
  list.innerHTML = '';

  const idioms = state.idioms.filter((i) => [i.latin, i.literal, i.meaning].join(' ').toLowerCase().includes(term));
  if (!idioms.length) {
    list.innerHTML = '<li>Крылатые выражения пока не добавлены.</li>';
    return;
  }

  idioms.forEach((idiom) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-head"><strong>${idiom.latin}</strong></div><p><b>Дословно:</b> ${idiom.literal}</p><p><b>Значение:</b> ${idiom.meaning}</p>`;
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(makeBtn('Удалить', 'danger-btn', () => {
      state.idioms = state.idioms.filter((i) => i.id !== idiom.id);
      saveState();
      renderIdiomsList();
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
  const distractors = state.words
    .filter((w) => w.id !== correctWord.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((w) => w.meaning);

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
        markCorrectAnswer();
        el('quizFeedback').textContent = 'Верно! +10 XP';
      } else {
        markIncorrectAnswer();
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
      imported.idioms = dedupeIdioms(Array.isArray(imported.idioms) ? imported.idioms : []);
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

function renderStatsDashboard() {
  if (!el('statsBars')) return;
  const bars = el('statsBars');
  bars.innerHTML = '';

  const total = Math.max(1, state.words.length);
  const learned = state.words.filter((w) => w.learned).length;
  const hard = state.words.filter((w) => w.difficulty === 'hard').length;

  const data = [
    { label: 'Выучено', value: learned, max: total },
    { label: 'Сложных слов', value: hard, max: total },
    { label: 'Верных ответов', value: state.stats.correctAnswers, max: Math.max(1, state.stats.quizzesTaken || state.stats.correctAnswers || 1) },
    { label: 'XP', value: state.stats.xp, max: Math.max(120, state.stats.xp + 20) }
  ];

  data.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'bar-row';

    const meta = document.createElement('div');
    meta.className = 'bar-meta';
    meta.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.min(100, Math.round((item.value / item.max) * 100))}%`;

    track.appendChild(fill);
    row.append(meta, track);
    bars.appendChild(row);
  });
}

function getLastNDates(days = 7) {
  const arr = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

function renderWeeklyChart() {
  const canvas = el('weeklyWordsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dates = getLastNDates(7);
  const values = dates.map((d) => state.activity[d]?.wordsAdded || 0);
  const max = Math.max(1, ...values);

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const barWidth = 36;
  const gap = 14;
  const startX = 20;

  values.forEach((value, index) => {
    const x = startX + index * (barWidth + gap);
    const barH = Math.round((value / max) * (h - 44));
    const y = h - barH - 24;

    const gradient = ctx.createLinearGradient(x, y, x, h);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, `rgba(${getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb')},0.65)`);

    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(x, 20, barWidth, h - 44);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barH);

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted');
    ctx.font = '11px Inter';
    ctx.fillText(dates[index].slice(5), x, h - 8);
    ctx.fillText(String(value), x + 10, y - 6);
  });
}

function renderCalendar() {
  if (!el('activityCalendar')) return;
  const dates = getLastNDates(14);
  el('activityCalendar').innerHTML = '';
  dates.forEach((date) => {
    const dot = document.createElement('div');
    const active = (state.activity[date]?.wordsAdded || 0) > 0 || (state.activity[date]?.correct || 0) > 0;
    dot.className = `day-dot ${active ? 'active' : ''}`;
    dot.title = `${date}: ${active ? 'была активность' : 'без практики'}`;
    el('activityCalendar').appendChild(dot);
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
    renderTranslatorResult(result);
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
    localStorage.removeItem('latin.app.v3');
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
      partOfSpeech: el('wordPartOfSpeech').value,
      tags: parseTags(el('wordTags').value),
      learned: false,
      createdAt: Date.now()
    });
    state.todayAdded += 1;
    markWordAdded();
    e.target.reset();
    saveState();
    renderWordList();
    renderStatsIfExists();
  });

  el('wordSearch')?.addEventListener('input', renderWordList);
  el('wordFilter')?.addEventListener('change', renderWordList);
  el('wordPartFilter')?.addEventListener('change', renderWordList);
  el('wordSort')?.addEventListener('change', renderWordList);

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

  el('idiomForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const latin = el('idiomLatin').value.trim();
    const literal = el('idiomLiteral').value.trim();
    const meaning = el('idiomMeaning').value.trim();
    const duplicate = state.idioms.some((i) => normalize(i.latin) === normalize(latin));
    if (duplicate) {
      alert('Такое крылатое выражение уже есть.');
      return;
    }

    state.idioms.unshift({ id: crypto.randomUUID(), latin, literal, meaning, createdAt: Date.now() });
    e.target.reset();
    saveState();
    renderIdiomsList();
  });

  el('idiomSearch')?.addEventListener('input', renderIdiomsList);

  el('randomCardBtn')?.addEventListener('click', randomCard);
  el('flipCardBtn')?.addEventListener('click', flipCard);

  el('typingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentTypingWord) return;
    const answer = normalize(el('typingAnswer').value);
    const expected = normalize(currentTypingWord.meaning);
    if (answer === expected) {
      state.stats.typingCorrect += 1;
      markCorrectAnswer();
      el('typingFeedback').textContent = 'Отлично, верно! +10 XP';
    } else {
      markIncorrectAnswer();
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
  renderIdiomsList();
  randomCard();
  nextQuiz();
  nextTypingQuestion();
  saveState();
})();
