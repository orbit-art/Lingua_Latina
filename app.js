const lessons = [
  { id: 'l1', title: 'Алфавит и чтение', level: 'Начальный' },
  { id: 'l2', title: 'Существительные I склонения', level: 'Начальный' },
  { id: 'l3', title: 'Глаголы настоящего времени', level: 'Начальный' },
  { id: 'l4', title: 'Согласование прилагательных', level: 'Средний' },
  { id: 'l5', title: 'Прошедшее время (Imperfectum)', level: 'Средний' },
  { id: 'l6', title: 'Перевод простых текстов', level: 'Продвинутый' }
];

const state = {
  completed: new Set(JSON.parse(localStorage.getItem('latin.completed') || '[]')),
  words: JSON.parse(localStorage.getItem('latin.words') || '[]'),
  rules: JSON.parse(localStorage.getItem('latin.rules') || '[]')
};

const courseList = document.getElementById('courseList');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const startBtn = document.getElementById('startBtn');

const wordForm = document.getElementById('wordForm');
const latinWordInput = document.getElementById('latinWord');
const wordMeaningInput = document.getElementById('wordMeaning');
const wordList = document.getElementById('wordList');

const ruleForm = document.getElementById('ruleForm');
const ruleTitleInput = document.getElementById('ruleTitle');
const ruleNoteInput = document.getElementById('ruleNote');
const ruleList = document.getElementById('ruleList');

function save() {
  localStorage.setItem('latin.completed', JSON.stringify([...state.completed]));
  localStorage.setItem('latin.words', JSON.stringify(state.words));
  localStorage.setItem('latin.rules', JSON.stringify(state.rules));
}

function renderProgress() {
  const percent = Math.round((state.completed.size / lessons.length) * 100);
  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${percent}% завершено (${state.completed.size}/${lessons.length})`;
}

function renderLessons() {
  courseList.innerHTML = '';
  lessons.forEach((lesson) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'lesson-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.completed.has(lesson.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.completed.add(lesson.id);
      else state.completed.delete(lesson.id);
      save();
      renderProgress();
    });

    const title = document.createElement('span');
    title.textContent = lesson.title;

    const level = document.createElement('span');
    level.className = 'pill';
    level.textContent = lesson.level;

    label.append(checkbox, title);
    li.append(label, level);
    courseList.appendChild(li);
  });
}

function makeDeleteButton(onClick) {
  const btn = document.createElement('button');
  btn.className = 'small-btn';
  btn.textContent = 'Удалить';
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
}

function renderWordList() {
  wordList.innerHTML = '';
  state.words.forEach((entry, index) => {
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.innerHTML = `<strong>${entry.latin}</strong> — ${entry.meaning}`;
    const del = makeDeleteButton(() => {
      state.words.splice(index, 1);
      save();
      renderWordList();
    });
    li.append(txt, del);
    wordList.appendChild(li);
  });
}

function renderRuleList() {
  ruleList.innerHTML = '';
  state.rules.forEach((entry, index) => {
    const li = document.createElement('li');
    const txt = document.createElement('span');
    txt.innerHTML = `<strong>${entry.title}</strong>: ${entry.note}`;
    const del = makeDeleteButton(() => {
      state.rules.splice(index, 1);
      save();
      renderRuleList();
    });
    li.append(txt, del);
    ruleList.appendChild(li);
  });
}

wordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.words.unshift({
    latin: latinWordInput.value.trim(),
    meaning: wordMeaningInput.value.trim()
  });
  wordForm.reset();
  save();
  renderWordList();
});

ruleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.rules.unshift({
    title: ruleTitleInput.value.trim(),
    note: ruleNoteInput.value.trim()
  });
  ruleForm.reset();
  save();
  renderRuleList();
});

startBtn.addEventListener('click', () => {
  document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
});

renderLessons();
renderProgress();
renderWordList();
renderRuleList();
