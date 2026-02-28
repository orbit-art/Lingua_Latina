const STORAGE_KEY = 'latin.app.v5';
const THEME_KEY = 'latin.ui.theme';
const ACCENT_KEY = 'latin.ui.accent';
const ECO_KEY = 'latin.ui.ecoMode';
const elementCache = new Map();

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
  stats: { correctAnswers: 0, quizzesTaken: 0, typingCorrect: 0, xp: 0, answerStreak: 0 },
  activity: {},
  goal: 5,
  todayAdded: 0,
  streak: 0,
  lastVisit: null,
  challenges: { dailyCorrectTarget: 15, bonusClaimedDate: null }
};

const state = loadState();
const pagination = { wordsPage: 1, rulesPage: 1, idiomsPage: 1, pageSize: 20 };
let currentCard = null;
let showTranslation = false;
let currentQuiz = null;
let currentTypingWord = null;

function el(id) {
  if (!elementCache.has(id)) elementCache.set(id, document.getElementById(id));
  return elementCache.get(id);
}

function normalize(value) { return String(value || '').trim().toLowerCase(); }
function getTodayStr() { return new Date().toISOString().slice(0, 10); }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function createdToday(ts) { return ts && new Date(ts).toISOString().slice(0, 10) === getTodayStr(); }

function ensureActivityDay(date = getTodayStr()) {
  if (!state.activity[date]) state.activity[date] = { wordsAdded: 0, correct: 0 };
  return state.activity[date];
}

function loadState() {
  const rawV5 = localStorage.getItem(STORAGE_KEY);
  const rawV4 = localStorage.getItem('latin.app.v4');
  const rawV3 = localStorage.getItem('latin.app.v3');
  const data = rawV5 ? JSON.parse(rawV5) : (rawV4 ? JSON.parse(rawV4) : (rawV3 ? JSON.parse(rawV3) : {}));

  const merged = {
    ...defaultState,
    ...data,
    words: Array.isArray(data.words) ? data.words : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
    idioms: Array.isArray(data.idioms) ? data.idioms : [],
    activity: typeof data.activity === 'object' && data.activity ? data.activity : {},
    stats: { ...defaultState.stats, ...(data.stats || {}) },
    challenges: { ...defaultState.challenges, ...(data.challenges || {}) }
  };

  merged.words = dedupeWords(merged.words).map((word) => ({
    ...word,
    tags: Array.isArray(word.tags) ? word.tags : [],
    partOfSpeech: word.partOfSpeech || 'other',
    createdAt: word.createdAt || Date.now()
  }));
  merged.rules = dedupeRules(merged.rules).map((rule) => ({ ...rule, createdAt: rule.createdAt || Date.now() }));
  merged.idioms = dedupeIdioms(merged.idioms).map((idiom) => ({ ...idiom, createdAt: idiom.createdAt || Date.now() }));
  merged.todayAdded = merged.words.filter((w) => createdToday(w.createdAt)).length;
  return merged;
}

function recalcTodayAdded() {
  state.todayAdded = state.words.filter((w) => createdToday(w.createdAt)).length;
}

function markWordAdded(count = 1) {
  ensureActivityDay().wordsAdded += count;
}

function markWordRemoved(count = 1) {
  ensureActivityDay().wordsAdded = Math.max(0, ensureActivityDay().wordsAdded - count);
}

function markCorrectAnswer() {
  ensureActivityDay().correct += 1;
  state.stats.correctAnswers += 1;
  state.stats.xp += 10;
  state.stats.answerStreak += 1;
  if (state.stats.answerStreak > 0 && state.stats.answerStreak % 5 === 0) state.stats.xp += 50;
  maybeGrantDailyChallengeBonus();
}

function maybeGrantDailyChallengeBonus() {
  const today = getTodayStr();
  const correctToday = ensureActivityDay(today).correct;
  if (correctToday >= state.challenges.dailyCorrectTarget && state.challenges.bonusClaimedDate !== today) {
    state.challenges.bonusClaimedDate = today;
    state.stats.xp += 120;
    if (el('dailyChallengeHint')) {
      el('dailyChallengeHint').textContent = 'Челлендж дня выполнен! +120 XP';
    }
  }
}

function markIncorrectAnswer() { state.stats.answerStreak = 0; }
function getLevel() { return Math.floor((state.stats.xp || 0) / 120) + 1; }
function levelProgressPercent() { return Math.round((((state.stats.xp || 0) % 120) / 120) * 100); }
function labelDifficulty(v) { return ({ easy: 'лёгкое', medium: 'среднее', hard: 'сложное' }[v] || 'среднее'); }
function labelPartOfSpeech(v) { return PARTS_OF_SPEECH[v] || PARTS_OF_SPEECH.other; }

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

function applyEcoMode(enabled) {
  const on = Boolean(enabled);
  document.documentElement.setAttribute('data-eco', on ? '1' : '0');
  localStorage.setItem(ECO_KEY, on ? '1' : '0');
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
  const savedEco = localStorage.getItem(ECO_KEY) === '1';
  applyTheme(savedTheme);
  applyAccent(savedAccent);
  applyEcoMode(savedEco);

  if (el('themeSelect')) {
    el('themeSelect').value = savedTheme;
    el('themeSelect').addEventListener('change', (event) => applyTheme(event.target.value));
  }

  if (el('ecoModeToggle')) {
    el('ecoModeToggle').checked = savedEco;
    el('ecoModeToggle').addEventListener('change', (event) => applyEcoMode(event.target.checked));
  }

  const accentButtons = document.querySelectorAll('.accent-dot');
  accentButtons.forEach((btn) => {
    const value = (btn.dataset.accent || '').toUpperCase();
    if (value === savedAccent.toUpperCase()) btn.classList.add('active');
    btn.addEventListener('click', () => {
      applyAccent(value);
      accentButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderWeeklyChart();
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

const LATIN_GLOSSARY_RU_LA = {
  вода: 'aqua', огонь: 'ignis', земля: 'terra', ветер: 'ventus', небо: 'caelum', любовь: 'amor', солнце: 'sol', луна: 'luna', друг: 'amicus', жизнь: 'vita', смерть: 'mors', дом: 'domus'
};
const LATIN_GLOSSARY_LA_RU = Object.fromEntries(Object.entries(LATIN_GLOSSARY_RU_LA).map(([ru, la]) => [la, ru]));

async function fetchMyMemoryPayload(text, sourceLang, targetLang) {
  const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`);
  if (!response.ok) throw new Error('translate-api-failed');
  return response.json();
}

function isBadTranslation(query, translated) {
  const q = normalize(query);
  const t = normalize(translated);
  return !t || t === q || t.length <= 2;
}

function pickBestTranslation(payload, query) {
  const primary = payload?.responseData?.translatedText?.trim() || '';
  if (!isBadTranslation(query, primary)) return primary;
  return (payload?.matches || []).map((m) => String(m.translation || '').trim()).find((candidate) => !isBadTranslation(query, candidate)) || '';
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

async function runTranslator(query, direction) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { source: 'empty', text: '', hints: [] };
  const local = direction === 'ru-la'
    ? state.words.filter((w) => normalize(w.meaning).includes(normalizedQuery) || normalize(w.latin).includes(normalizedQuery))
    : state.words.filter((w) => normalize(w.latin).includes(normalizedQuery) || normalize(w.meaning).includes(normalizedQuery));

  const glossary = direction === 'ru-la' ? LATIN_GLOSSARY_RU_LA[normalizedQuery] : LATIN_GLOSSARY_LA_RU[normalizedQuery];
  if (glossary) return { source: 'glossary', text: glossary, hints: local.slice(0, 6).map((w) => `${w.latin} — ${w.meaning}`) };

  try {
    const sourceLang = direction === 'ru-la' ? 'ru' : 'la';
    const targetLang = direction === 'ru-la' ? 'la' : 'ru';
    const directPayload = await fetchMyMemoryPayload(query, sourceLang, targetLang);
    let best = pickBestTranslation(directPayload, query);
    let variants = collectVariants(directPayload, query);
    if (isBadTranslation(query, best)) {
      const pivotPayload = await fetchMyMemoryPayload(query, sourceLang, 'en');
      const pivotBest = pickBestTranslation(pivotPayload, query);
      if (!isBadTranslation(query, pivotBest)) {
        const targetPayload = await fetchMyMemoryPayload(pivotBest, 'en', targetLang);
        const bestFromPivot = pickBestTranslation(targetPayload, pivotBest);
        if (!isBadTranslation(query, bestFromPivot)) best = bestFromPivot;
        variants = [...new Set([...variants, ...collectVariants(targetPayload, pivotBest)])].slice(0, 8);
      }
    }
    if (!isBadTranslation(query, best)) return { source: 'api', text: best, hints: [...new Set([...variants, ...local.map((w) => (direction === 'ru-la' ? w.latin : w.meaning))])].slice(0, 8) };
  } catch {}

  if (local.length) return { source: 'local', text: direction === 'ru-la' ? local[0].latin : local[0].meaning, hints: local.slice(1, 8).map((w) => `${w.latin} — ${w.meaning}`) };
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
  const frag = document.createDocumentFragment();
  result.hints.forEach((hint) => {
    const li = document.createElement('li');
    li.textContent = hint;
    frag.appendChild(li);
  });
  hints.appendChild(frag);
}

function getAchievements() {
  const learnedVerbs = state.words.filter((w) => w.learned && w.partOfSpeech === 'verb').length;
  return [
    { title: 'Первые 10 слов', icon: '🎯', done: state.words.length >= 10, desc: `${Math.min(state.words.length, 10)}/10` },
    { title: 'Неделя без пропусков', icon: '🔥', done: state.streak >= 7, desc: `${Math.min(state.streak, 7)}/7 дней` },
    { title: 'Мастер глаголов', icon: '⚔️', done: learnedVerbs >= 10, desc: `${Math.min(learnedVerbs, 10)}/10 выученных глаголов` }
  ];
}

function renderDailyChallenge() {
  if (!el('dailyChallengeProgress')) return;
  const today = getTodayStr();
  const correctToday = ensureActivityDay(today).correct;
  const target = state.challenges.dailyCorrectTarget;
  const progress = Math.min(100, Math.round((correctToday / target) * 100));

  el('dailyChallengeProgress').textContent = `${correctToday}/${target} правильных ответов`;
  el('dailyChallengeFill').style.width = `${progress}%`;
  el('dailyChallengeHint').textContent = state.challenges.bonusClaimedDate === today
    ? 'Бонус за день уже получен: +120 XP'
    : 'Выполни и получи +120 XP';
}

function renderStatsIfExists() {
  if (!el('totalWords')) return;
  recalcTodayAdded();
  const learnedWords = state.words.filter((w) => w.learned).length;
  const progress = state.goal > 0 ? Math.min(100, Math.round((state.todayAdded / state.goal) * 100)) : 0;

  el('totalWords').textContent = String(state.words.length);
  el('learnedWords').textContent = String(learnedWords);
  el('totalRules').textContent = String(state.rules.length);
  el('correctAnswers').textContent = String(state.stats.correctAnswers);
  if (el('xpValue')) el('xpValue').textContent = String(state.stats.xp || 0);
  if (el('levelValue')) el('levelValue').textContent = String(getLevel());
  if (el('goalStatus')) el('goalStatus').textContent = `Цель: ${state.todayAdded}/${state.goal} слов сегодня`;
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
  renderDailyChallenge();
}

function renderAchievements() {
  if (!el('achievementsList')) return;
  el('achievementsList').innerHTML = '';
  const frag = document.createDocumentFragment();
  getAchievements().forEach((achievement) => {
    const li = document.createElement('li');
    li.className = `achievement ${achievement.done ? 'done' : ''}`;
    li.innerHTML = `<strong>${achievement.icon} ${achievement.title}</strong><span class="muted">${achievement.done ? 'Выполнено' : achievement.desc}</span>`;
    frag.appendChild(li);
  });
  el('achievementsList').appendChild(frag);

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
  return String(input || '').split(',').map((tag) => normalize(tag)).filter(Boolean);
}

function debounce(fn, wait = 140) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function renderPaginationInfo(total, shown, targetId) {
  if (!el(targetId)) return;
  el(targetId).textContent = `Показано ${shown} из ${total}`;
}

function renderWordList() {
  if (!el('wordList')) return;
  const term = normalize(el('wordSearch')?.value);
  const filter = el('wordFilter')?.value || 'all';
  const posFilter = el('wordPartFilter')?.value || 'all';
  const sortBy = el('wordSort')?.value || 'newest';

  const filtered = state.words.filter((w) => {
    const match = [w.latin, w.meaning, w.example, (w.tags || []).join(' '), labelPartOfSpeech(w.partOfSpeech)].join(' ').toLowerCase().includes(term);
    if (!match) return false;
    if (filter === 'learned') return w.learned;
    if (filter === 'notLearned') return !w.learned;
    if (filter === 'hard') return w.difficulty === 'hard';
    if (posFilter !== 'all' && w.partOfSpeech !== posFilter) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'latin-asc') return a.latin.localeCompare(b.latin, 'ru');
    if (sortBy === 'latin-desc') return b.latin.localeCompare(a.latin, 'ru');
    if (sortBy === 'difficulty') return ({ hard: 3, medium: 2, easy: 1 }[b.difficulty] || 0) - ({ hard: 3, medium: 2, easy: 1 }[a.difficulty] || 0);
    if (sortBy === 'learned-first') return Number(b.learned) - Number(a.learned);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const visible = filtered.slice(0, pagination.wordsPage * pagination.pageSize);
  const list = el('wordList');
  list.innerHTML = '';

  if (!visible.length) {
    list.innerHTML = '<li>Нет слов по фильтру.</li>';
    renderPaginationInfo(filtered.length, 0, 'wordPaginationInfo');
    if (el('wordLoadMoreBtn')) el('wordLoadMoreBtn').style.display = 'none';
    return;
  }

  const frag = document.createDocumentFragment();
  visible.forEach((word) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-head"><strong>${word.latin}</strong> — ${word.meaning}</div>`;

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
        const removed = state.words.find((w) => w.id === word.id);
        state.words = state.words.filter((w) => w.id !== word.id);
        if (removed && createdToday(removed.createdAt)) markWordRemoved();
        recalcTodayAdded();
        saveState();
        renderWordList();
        renderStatsIfExists();
      })
    );

    const meta = document.createElement('p');
    const tags = (word.tags || []).length ? ` • Теги: ${(word.tags || []).join(', ')}` : '';
    meta.className = 'muted';
    meta.textContent = `${labelPartOfSpeech(word.partOfSpeech)} • Сложность: ${labelDifficulty(word.difficulty)}${tags}${word.example ? ` • ${word.example}` : ''}`;

    li.append(actions, meta);
    frag.appendChild(li);
  });
  list.appendChild(frag);

  renderPaginationInfo(filtered.length, visible.length, 'wordPaginationInfo');
  if (el('wordLoadMoreBtn')) el('wordLoadMoreBtn').style.display = visible.length < filtered.length ? 'inline-flex' : 'none';
}

function renderRuleList() {
  if (!el('ruleList')) return;
  const term = normalize(el('ruleSearch')?.value);
  const filtered = state.rules.filter((r) => [r.title, r.category, r.note].join(' ').toLowerCase().includes(term));
  const visible = filtered.slice(0, pagination.rulesPage * pagination.pageSize);

  const list = el('ruleList');
  list.innerHTML = '';
  if (!visible.length) {
    list.innerHTML = '<li>Нет правил по фильтру.</li>';
    renderPaginationInfo(filtered.length, 0, 'rulePaginationInfo');
    if (el('ruleLoadMoreBtn')) el('ruleLoadMoreBtn').style.display = 'none';
    return;
  }

  const frag = document.createDocumentFragment();
  visible.forEach((rule) => {
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
    frag.appendChild(li);
  });
  list.appendChild(frag);

  renderPaginationInfo(filtered.length, visible.length, 'rulePaginationInfo');
  if (el('ruleLoadMoreBtn')) el('ruleLoadMoreBtn').style.display = visible.length < filtered.length ? 'inline-flex' : 'none';
}

function renderIdiomsList() {
  if (!el('idiomList')) return;
  const term = normalize(el('idiomSearch')?.value);
  const filtered = state.idioms.filter((i) => [i.latin, i.literal, i.meaning].join(' ').toLowerCase().includes(term));
  const visible = filtered.slice(0, pagination.idiomsPage * pagination.pageSize);

  const list = el('idiomList');
  list.innerHTML = '';
  if (!visible.length) {
    list.innerHTML = '<li>Крылатые выражения пока не добавлены.</li>';
    renderPaginationInfo(filtered.length, 0, 'idiomPaginationInfo');
    if (el('idiomLoadMoreBtn')) el('idiomLoadMoreBtn').style.display = 'none';
    return;
  }

  const frag = document.createDocumentFragment();
  visible.forEach((idiom) => {
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
    frag.appendChild(li);
  });
  list.appendChild(frag);

  renderPaginationInfo(filtered.length, visible.length, 'idiomPaginationInfo');
  if (el('idiomLoadMoreBtn')) el('idiomLoadMoreBtn').style.display = visible.length < filtered.length ? 'inline-flex' : 'none';
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
  currentQuiz = { answer: correctWord.meaning };

  el('quizQuestion').textContent = `Перевод слова: ${correctWord.latin}`;
  el('quizOptions').innerHTML = '';
  el('quizFeedback').textContent = '';

  [...distractors, correctWord.meaning].sort(() => Math.random() - 0.5).forEach((option) => {
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
  const pool = [...state.words].sort((a, b) => Number(a.learned) - Number(b.learned));
  currentTypingWord = pool[Math.floor(Math.random() * Math.min(pool.length, 12))];
  el('typingQuestion').textContent = `Введи перевод: ${currentTypingWord.latin}`;
  el('typingFeedback').textContent = '';
  el('typingAnswer').value = '';
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lingua-latina-${getTodayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
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
      recalcTodayAdded();
      saveState();
      location.reload();
    } catch {
      alert('Ошибка импорта');
    }
  };
  reader.readAsText(file);
}

function parseJsonFromInput(id) {
  try {
    const raw = el(id)?.value?.trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    alert('Некорректный JSON');
    return null;
  }
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
  const accuracy = state.stats.quizzesTaken ? Math.round((state.stats.correctAnswers / state.stats.quizzesTaken) * 100) : 0;
  const data = [
    { label: 'Выучено', value: learned, max: total },
    { label: 'Сложных слов', value: hard, max: total },
    { label: 'Точность', value: accuracy, max: 100 },
    { label: 'XP', value: state.stats.xp, max: Math.max(120, state.stats.xp + 30) }
  ];

  const frag = document.createDocumentFragment();
  data.forEach((item) => {
    const row = document.createElement('div');
    const pct = Math.min(100, Math.round((item.value / item.max) * 100));
    row.className = 'bar-row';
    row.innerHTML = `<div class="bar-meta"><span>${item.label}</span><strong>${item.value}${item.label === 'Точность' ? '%' : ''}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
    frag.appendChild(row);
  });
  bars.appendChild(frag);
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

  const ratio = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 380;
  const cssHeight = 220;
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const dates = getLastNDates(7);
  const values = dates.map((d) => state.activity[d]?.wordsAdded || 0);
  const max = Math.max(1, ...values);

  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, 14);
  ctx.lineTo(34, cssHeight - 28);
  ctx.lineTo(cssWidth - 10, cssHeight - 28);
  ctx.stroke();

  const contentW = cssWidth - 54;
  const step = contentW / values.length;
  const barW = Math.max(18, step - 12);
  const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();

  values.forEach((value, index) => {
    const x = 40 + index * step;
    const h = ((cssHeight - 52) * value) / max;
    const y = cssHeight - 28 - h;
    const grad = ctx.createLinearGradient(0, y, 0, cssHeight);
    grad.addColorStop(0, 'rgba(255,255,255,.94)');
    grad.addColorStop(1, `rgba(${accentRgb}, .68)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barW, h);

    ctx.fillStyle = muted;
    ctx.font = '11px Inter';
    ctx.fillText(dates[index].slice(5), x, cssHeight - 8);
    ctx.fillText(String(value), x + (barW / 2) - 4, y - 5);
  });

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = 40 + index * step + (barW / 2);
    const y = cssHeight - 28 - (((cssHeight - 52) * value) / max);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = `rgba(${accentRgb}, .9)`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function renderCalendar() {
  if (!el('activityCalendar')) return;
  const dates = getLastNDates(14);
  el('activityCalendar').innerHTML = '';
  const frag = document.createDocumentFragment();
  dates.forEach((date) => {
    const dot = document.createElement('div');
    const active = (state.activity[date]?.wordsAdded || 0) > 0 || (state.activity[date]?.correct || 0) > 0;
    dot.className = `day-dot ${active ? 'active' : ''}`;
    dot.title = `${date}: ${active ? 'была активность' : 'без практики'}`;
    frag.appendChild(dot);
  });
  el('activityCalendar').appendChild(frag);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function wireEvents() {
  wireMobileMenu();
  window.addEventListener('resize', debounce(() => renderWeeklyChart(), 120));

  el('translatorForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    el('translatorResult').classList.add('muted');
    el('translatorResult').textContent = 'Перевожу...';
    renderTranslatorResult(await runTranslator(el('translatorInput').value, el('translatorDirection').value));
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
    localStorage.removeItem('latin.app.v4');
    localStorage.removeItem('latin.app.v3');
    location.reload();
  });

  el('wordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const latin = el('latinWord').value.trim();
    const meaning = el('wordMeaning').value.trim();
    if (state.words.some((word) => normalize(word.latin) === normalize(latin) && normalize(word.meaning) === normalize(meaning))) return alert('Такое слово с таким переводом уже есть в словаре.');

    state.words.unshift({ id: crypto.randomUUID(), latin, meaning, example: el('wordExample').value.trim(), difficulty: el('wordDifficulty').value, partOfSpeech: el('wordPartOfSpeech').value, tags: parseTags(el('wordTags').value), learned: false, createdAt: Date.now() });
    markWordAdded();
    recalcTodayAdded();
    e.target.reset();
    saveState();
    pagination.wordsPage = 1;
    renderWordList();
    renderStatsIfExists();
  });

  const rerenderWords = debounce(() => { pagination.wordsPage = 1; renderWordList(); }, 130);
  el('wordSearch')?.addEventListener('input', rerenderWords);
  el('wordFilter')?.addEventListener('change', rerenderWords);
  el('wordPartFilter')?.addEventListener('change', rerenderWords);
  el('wordSort')?.addEventListener('change', rerenderWords);
  el('wordLoadMoreBtn')?.addEventListener('click', () => { pagination.wordsPage += 1; renderWordList(); });

  el('importWordsJsonBtn')?.addEventListener('click', () => {
    const parsed = parseJsonFromInput('wordJsonInput');
    if (!parsed) return;
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.words) ? parsed.words : []);
    if (!items.length) return alert('Не найден массив слов для импорта.');

    const normalized = items.map((item) => ({
      id: crypto.randomUUID(),
      latin: String(item.latin || '').trim(),
      meaning: String(item.meaning || '').trim(),
      example: String(item.example || '').trim(),
      difficulty: ['easy', 'medium', 'hard'].includes(item.difficulty) ? item.difficulty : 'medium',
      partOfSpeech: Object.keys(PARTS_OF_SPEECH).includes(item.partOfSpeech) ? item.partOfSpeech : 'other',
      tags: Array.isArray(item.tags) ? item.tags.map((t) => normalize(t)).filter(Boolean) : parseTags(item.tags),
      learned: Boolean(item.learned),
      createdAt: item.createdAt || Date.now()
    }));

    const before = state.words.length;
    state.words = dedupeWords([...normalized, ...state.words]);
    const added = Math.max(state.words.length - before, 0);
    const addedToday = normalized.filter((w) => createdToday(w.createdAt)).length;
    if (added > 0 && addedToday > 0) markWordAdded(addedToday);
    recalcTodayAdded();
    saveState();
    pagination.wordsPage = 1;
    renderWordList();
    renderStatsIfExists();
    alert(`Импортировано слов: ${added}`);
  });

  el('ruleForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el('ruleTitle').value.trim();
    const category = el('ruleCategory').value.trim();
    const note = el('ruleNote').value.trim();
    if (state.rules.some((rule) => normalize(rule.title) === normalize(title) && normalize(rule.category) === normalize(category))) return alert('Такое правило уже есть в этой категории.');

    state.rules.unshift({ id: crypto.randomUUID(), title, category, note, createdAt: Date.now() });
    e.target.reset();
    saveState();
    pagination.rulesPage = 1;
    renderRuleList();
    renderStatsIfExists();
  });

  const rerenderRules = debounce(() => { pagination.rulesPage = 1; renderRuleList(); }, 130);
  el('ruleSearch')?.addEventListener('input', rerenderRules);
  el('ruleLoadMoreBtn')?.addEventListener('click', () => { pagination.rulesPage += 1; renderRuleList(); });
  el('importRulesJsonBtn')?.addEventListener('click', () => {
    const parsed = parseJsonFromInput('ruleJsonInput');
    if (!parsed) return;
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.rules) ? parsed.rules : []);
    if (!items.length) return alert('Не найден массив правил для импорта.');
    const normalized = items.map((item) => ({ id: crypto.randomUUID(), title: String(item.title || '').trim(), category: String(item.category || '').trim(), note: String(item.note || '').trim(), createdAt: item.createdAt || Date.now() }));
    const before = state.rules.length;
    state.rules = dedupeRules([...normalized, ...state.rules]);
    saveState();
    pagination.rulesPage = 1;
    renderRuleList();
    renderStatsIfExists();
    alert(`Импортировано правил: ${Math.max(state.rules.length - before, 0)}`);
  });

  el('idiomForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const latin = el('idiomLatin').value.trim();
    const literal = el('idiomLiteral').value.trim();
    const meaning = el('idiomMeaning').value.trim();
    if (state.idioms.some((i) => normalize(i.latin) === normalize(latin))) return alert('Такое крылатое выражение уже есть.');
    state.idioms.unshift({ id: crypto.randomUUID(), latin, literal, meaning, createdAt: Date.now() });
    e.target.reset();
    saveState();
    pagination.idiomsPage = 1;
    renderIdiomsList();
  });

  const rerenderIdioms = debounce(() => { pagination.idiomsPage = 1; renderIdiomsList(); }, 130);
  el('idiomSearch')?.addEventListener('input', rerenderIdioms);
  el('idiomLoadMoreBtn')?.addEventListener('click', () => { pagination.idiomsPage += 1; renderIdiomsList(); });
  el('importIdiomsJsonBtn')?.addEventListener('click', () => {
    const parsed = parseJsonFromInput('idiomJsonInput');
    if (!parsed) return;
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.idioms) ? parsed.idioms : []);
    if (!items.length) return alert('Не найден массив выражений для импорта.');
    const normalized = items.map((item) => ({ id: crypto.randomUUID(), latin: String(item.latin || '').trim(), literal: String(item.literal || '').trim(), meaning: String(item.meaning || '').trim(), createdAt: item.createdAt || Date.now() }));
    const before = state.idioms.length;
    state.idioms = dedupeIdioms([...normalized, ...state.idioms]);
    saveState();
    pagination.idiomsPage = 1;
    renderIdiomsList();
    alert(`Импортировано выражений: ${Math.max(state.idioms.length - before, 0)}`);
  });

  el('randomCardBtn')?.addEventListener('click', randomCard);
  el('flipCardBtn')?.addEventListener('click', flipCard);
  el('typingForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentTypingWord) return;
    if (normalize(el('typingAnswer').value) === normalize(currentTypingWord.meaning)) {
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

  recalcTodayAdded();
  initAppearance();
  wireEvents();
  registerServiceWorker();
  renderStatsIfExists();
  renderWordList();
  renderRuleList();
  renderIdiomsList();
  randomCard();
  nextQuiz();
  nextTypingQuestion();
  saveState();
})();
