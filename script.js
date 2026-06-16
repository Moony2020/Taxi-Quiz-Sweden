function splitHelperLines(text){ return (text || '').replace(/\s+/g,' ').trim().replace(/\s+(?=(Sidindelning|Vägavstånd tabell|Avståndstabell|Båt och färjeförbindelser|Huvudkarta|Lokalkartan|Teckenförklaring|Tecken förklaring|Namnregister|Namn register))/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean); }
function parseMergedOptionText(text){
  const raw = (text || '').trim();
  const helperMatch = raw.match(/\s+Särtryck\/hjälpmedel\b/i);
  const helperIndex = helperMatch ? helperMatch.index : -1;
  const beforeHelper = helperIndex >= 0 ? raw.slice(0, helperIndex).trim() : raw;
  const helperText = helperIndex >= 0 ? raw.slice(helperIndex).replace(/\s*Särtryck\/hjälpmedel\s*/i,'').trim() : '';
  const contextMatch = beforeHelper.match(/\s+(Du\b.*|En kund\b.*)$/);
  return {
    answerText: contextMatch ? beforeHelper.slice(0, contextMatch.index).trim() : beforeHelper,
    contextText: contextMatch ? contextMatch[1].trim() : '',
    helperLines: splitHelperLines(helperText)
  };
}
function prepareQuestions(questions){
  const normalized = questions.map(q=>({ ...q, options: q.options.map(opt=>({ ...opt })) }));
  // Pass 1: extract context from each question's options and apply to the question itself
  normalized.forEach((q)=>{
    q.options.forEach((opt)=>{
      const parsed = parseMergedOptionText(opt.text);
      opt.text = parsed.answerText;
      if(!q.contextText && !q.helperLines?.length && (parsed.contextText || parsed.helperLines.length)){
        q.contextText = parsed.contextText;
        q.helperLines = parsed.helperLines;
      }
    });
  });
  // Pass 2: carry context forward to consecutive questions in the same group that have none
  for(let i=0; i<normalized.length-1; i++){
    const q = normalized[i];
    const next = normalized[i+1];
    if(q.group===next.group && (q.contextText || q.helperLines?.length) && !next.contextText && !next.helperLines?.length){
      next.contextText = q.contextText;
      next.helperLines = q.helperLines;
    }
  }
  return normalized;
}
const QUESTIONS = prepareQuestions(window.QUESTIONS || []);
const $ = (id) => document.getElementById(id);
const state = { quiz: [], index: 0, answers: {}, title: '', mode: 'group', lastQuiz: [] };
const STORAGE_KEY = 'taxi_quiz_progress_v1';

function loadSaved(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}}catch{return {}} }
function saveGlobal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(loadSaved())); updateTopStats(); }
function grouped(){ return QUESTIONS.reduce((acc,q)=>{(acc[q.group] ||= []).push(q); return acc},{}); }
function shuffle(arr){ return [...arr].sort(()=>Math.random()-.5); }
function optionLabel(key){ const map={A:'الخيار الأول',B:'الخيار الثاني',C:'الخيار الثالث',D:'الخيار الرابع',E:'الخيار الخامس',F:'الخيار السادس'}; return map[key] || key; }
function displayOptionText(text){ return (text || '').trim(); }
function normalizeGroupType(name){ if(name.startsWith('LAGSTIFNING')) return 'LAGSTIFNING'; if(name.startsWith('SÄKERHET')) return 'SÄKERHET'; return 'Karta'; }
function renderQuestionInfo(q){
  const box = $('questionInfoBox');
  const parts = [];
  if(q.contextText) parts.push(`<p class="question-info-text latin-text" dir="ltr" lang="sv">${q.contextText}</p>`);
  if(q.helperLines?.length) parts.push(`<div class="question-info-meta"><span class="question-info-label">Särtryck/hjälpmedel</span><ul>${q.helperLines.map(line=>`<li class="latin-text" dir="ltr" lang="sv">${line}</li>`).join('')}</ul></div>`);
  if(!parts.length){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.innerHTML = parts.join('');
  box.classList.remove('hidden');
}
function closeCategoryDropdown(){ $('categoryMenu').classList.add('hidden'); $('categoryDropdown').classList.remove('open'); $('categoryToggle').setAttribute('aria-expanded','false'); }
function openCategoryDropdown(){ $('categoryMenu').classList.remove('hidden'); $('categoryDropdown').classList.add('open'); $('categoryToggle').setAttribute('aria-expanded','true'); }
function syncCategoryDropdown(){
  const select = $('categoryFilter');
  const menu = $('categoryMenu');
  const label = $('categoryFilterLabel');
  const selected = select.options[select.selectedIndex];
  label.textContent = selected ? selected.textContent : '';
  menu.querySelectorAll('[data-value]').forEach((item)=>{
    const active = item.dataset.value === select.value;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}
function buildCategoryDropdown(){
  const select = $('categoryFilter');
  const menu = $('categoryMenu');
  menu.innerHTML = '';
  [...select.options].forEach((option)=>{
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'custom-select-option latin-text';
    item.lang = 'sv';
    item.dataset.value = option.value;
    item.setAttribute('role','option');
    item.textContent = option.textContent;
    item.onclick = ()=>{
      select.value = option.value;
      syncCategoryDropdown();
      closeCategoryDropdown();
      select.dispatchEvent(new Event('change'));
    };
    menu.appendChild(item);
  });
  syncCategoryDropdown();
}
function openResetModal(){ $('resetModal').classList.remove('hidden'); $('resetModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); $('confirmResetBtn').focus(); }
function closeResetModal(){ $('resetModal').classList.add('hidden'); $('resetModal').setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); }
function resetSavedProgress(){ localStorage.removeItem(STORAGE_KEY); updateTopStats(); renderGroups(); closeResetModal(); }

// ── Translation ──
const trCache = {};
let trMode = false;

async function gtTranslate(text) {
  if (!text || !text.trim()) return text;
  if (trCache[text]) return trCache[text];
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=sv&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url);
  const d = await r.json();
  const result = d[0].map(p => p[0]).join('');
  trCache[text] = result;
  return result;
}

async function applyTranslation() {
  const q = state.quiz[state.index];
  const box = $('translationBox');
  box.classList.remove('hidden');
  box.innerHTML = '<div class="tr-loading">جارٍ الترجمة…</div>';
  try {
    const helperLines = q.helperLines || [];
    const [qAr, ...optAr] = await Promise.all([
      gtTranslate(q.question),
      ...q.options.map(o => gtTranslate(displayOptionText(o.text)))
    ]);
    const contextAr = q.contextText ? await gtTranslate(q.contextText) : '';
    const helperAr = await Promise.all(helperLines.map(line => gtTranslate(line)));
    let html = `<div class="tr-question">${qAr}</div><div class="tr-options">`;
    q.options.forEach((opt, i) => {
      html += `<div class="tr-option"><span class="key">${opt.key}</span><span>${optAr[i]}</span></div>`;
    });
    html += '</div>';
    if(contextAr || helperAr.length){
      html += `<div class="tr-extra">`;
      if(contextAr) html += `<div class="tr-context">${contextAr}</div>`;
      if(helperAr.length) html += `<div class="tr-helper"><b>معلومات إضافية</b><ul>${helperAr.map(line=>`<li>${line}</li>`).join('')}</ul></div>`;
      html += `</div>`;
    }
    box.innerHTML = html;
  } catch {
    box.innerHTML = '<div class="tr-loading">تعذّرت الترجمة — تحقق من الاتصال بالإنترنت</div>';
  }
}

function toggleTranslate() {
  trMode = !trMode;
  const btn = $('translateBtn');
  btn.classList.toggle('btn-active', trMode);
  btn.textContent = trMode ? 'إخفاء الترجمة' : 'ترجمة للعربية';
  if (trMode) applyTranslation();
  else $('translationBox').classList.add('hidden');
}

function updateTopStats(){
  $('totalQuestions').textContent = QUESTIONS.length;
  $('totalGroups').textContent = Object.keys(grouped()).length;
  const saved = loadSaved();
  $('savedAnswers').textContent = Object.keys(saved).length;
}

function renderGroups(){
  const grid = $('groupGrid'); grid.innerHTML = '';
  const search = $('searchInput').value.trim().toLowerCase();
  const cat = $('categoryFilter').value;
  const groups = grouped();
  Object.keys(groups).sort((a,b)=>a.localeCompare(b,'sv')).forEach(name=>{
    const qs = groups[name];
    const type = normalizeGroupType(name);
    const text = (name + ' ' + qs.map(q=>q.question).join(' ')).toLowerCase();
    if(cat !== 'all' && type !== cat) return;
    if(search && !text.includes(search)) return;
    const saved = loadSaved();
    const answered = qs.filter(q=>saved[q.id]).length;
    const card = document.createElement('div');
    card.className = 'group-card';
    card.innerHTML = `
      <h3 class="latin-text" lang="sv">${name}</h3>
      <p>${qs.length} سؤال • تم حل ${answered}</p>
      <div class="progress-wrap"><div class="progress-bar" style="width:${Math.round(answered/qs.length*100)}%"></div></div>
      <div class="group-actions">
        <button class="primary-btn" data-action="start">ابدأ المجموعة</button>
        <button class="ghost-btn" data-action="study">دراسة</button>
      </div>`;
    card.querySelector('[data-action="start"]').onclick=()=>startQuiz(qs, name, 'group');
    card.querySelector('[data-action="study"]').onclick=()=>startQuiz(qs, name+' - دراسة', 'study');
    grid.appendChild(card);
  });
}

function startQuiz(qs, title, mode='group'){
  state.quiz = qs;
  state.index = 0;
  state.title = title;
  state.mode = mode;
  state.lastQuiz = qs;
  const saved = loadSaved();
  state.answers = {};
  qs.forEach(q => { if(saved[q.id]) state.answers[q.id] = saved[q.id]; });
  $('groupsSection').classList.add('hidden');
  $('resultSection').classList.add('hidden');
  $('reviewList').classList.add('hidden');
  $('quizSection').classList.remove('hidden');
  $('quizTitle').textContent = title;
  $('quizMeta').textContent = `${qs.length} سؤال`;
  renderQuestion();
}
function answerCurrent(key){
  const q = state.quiz[state.index];
  state.answers[q.id] = key;
  const saved = loadSaved(); saved[q.id]=key; localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  renderQuestion(); updateTopStats(); renderGroups();
}
function renderQuestion(){
  const q = state.quiz[state.index];
  if(!q) return;
  $('qCounter').textContent = `سؤال ${state.index+1} من ${state.quiz.length}`;
  $('qSource').textContent = `${q.group} • صفحة ${q.page}`;
  $('questionText').textContent = q.question;
  renderQuestionInfo(q);
  const list = $('optionsList'); list.innerHTML='';
  const selected = state.answers[q.id];
  q.options.forEach(opt=>{
    const div=document.createElement('div');
    div.className='option';
    if(selected===opt.key) div.classList.add('selected');
    if(state.mode==='study' && selected){
      if(opt.key===q.correct) div.classList.add('correct');
      if(selected===opt.key && selected!==q.correct) div.classList.add('wrong');
    }
    div.innerHTML=`<span class="key">${opt.key}</span><span class="latin-text" lang="sv">${displayOptionText(opt.text)}</span>`;
    div.onclick=()=>answerCurrent(opt.key);
    list.appendChild(div);
  });
  $('hintBox').classList.add('hidden');
  $('hintBox').innerHTML='';
  $('translationBox').classList.add('hidden');
  $('prevBtn').disabled = state.index===0;
  $('nextBtn').textContent = state.index===state.quiz.length-1 ? 'إنهاء' : 'التالي';
  updateQuizStats();
  renderDots();
  if (trMode) applyTranslation();
}
function updateQuizStats(){
  const total=state.quiz.length, answered=Object.keys(state.answers).filter(id=>state.quiz.some(q=>q.id==id)).length;
  $('answeredCount').textContent=answered; $('remainingCount').textContent=total-answered;
  $('progressBar').style.width = `${Math.round(answered/total*100)}%`;
}
function renderDots(){
  const wrap=$('questionDots'); wrap.innerHTML='';
  state.quiz.forEach((q,i)=>{
    const d=document.createElement('div'); d.className='dot'; d.textContent=i+1;
    if(state.answers[q.id]) d.classList.add('answered'); if(i===state.index) d.classList.add('current');
    d.onclick=()=>{state.index=i; renderQuestion();}; wrap.appendChild(d);
  });
}
function showHint(){
  const q=state.quiz[state.index];
  const opt = q.options.find(o=>o.key===q.correct);
  $('hintBox').classList.remove('hidden');
  $('hintBox').innerHTML = `<b>الإجابة الصحيحة:</b> ${q.correct} — ${optionLabel(q.correct)}<br><span dir="ltr">${opt ? displayOptionText(opt.text) : ''}</span>`;
  document.querySelectorAll('.option').forEach(el=>{
    const key=el.querySelector('.key').textContent;
    if(key===q.correct) el.classList.add('correct');
  });
}
function next(){ if(state.index < state.quiz.length-1){state.index++; renderQuestion();} else finish(); }
function prev(){ if(state.index>0){state.index--; renderQuestion();} }
function finish(){
  $('quizSection').classList.add('hidden'); $('resultSection').classList.remove('hidden');
  let correct=0, wrong=0, empty=0;
  state.quiz.forEach(q=>{ const a=state.answers[q.id]; if(!a) empty++; else if(a===q.correct) correct++; else wrong++; });
  const pct = Math.round(correct/state.quiz.length*100);
  $('resultTitle').textContent = state.title;
  $('scorePercent').textContent = pct+'%';
  document.querySelector('.score-circle').style.background = `conic-gradient(var(--gold) ${pct*3.6}deg, rgba(255,255,255,.12) 0deg)`;
  $('correctCount').textContent=correct; $('wrongCount').textContent=wrong; $('emptyCount').textContent=empty;
  renderReview(false);
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderReview(showOnlyWrong=true){
  const wrap=$('reviewList'); wrap.innerHTML='';
  state.quiz.forEach((q,i)=>{
    const chosen=state.answers[q.id];
    if(showOnlyWrong && chosen===q.correct) return;
    const correctOpt=q.options.find(o=>o.key===q.correct);
    const chosenOpt=q.options.find(o=>o.key===chosen);
    const item=document.createElement('div'); item.className='review-item';
    item.innerHTML=`
      <h3 class="latin-text" lang="sv">${i+1}. ${q.question}</h3>
      <p class="muted" dir="ltr">${q.group} • Page ${q.page}</p>
      <div class="review-answer">
        <div><span class="tag ${chosen===q.correct?'good':'bad'}">إجابتك</span> ${chosen ? chosen+' — '+optionLabel(chosen)+' — '+displayOptionText(chosenOpt?.text||'') : 'لم تختر إجابة'}</div>
        <div><span class="tag good">الصحيح</span> ${q.correct} — ${optionLabel(q.correct)} — ${displayOptionText(correctOpt?.text||'')}</div>
      </div>`;
    wrap.appendChild(item);
  });
}

$('searchInput').addEventListener('input',renderGroups);
$('categoryFilter').addEventListener('change',renderGroups);
$('categoryToggle').onclick=()=>{ $('categoryDropdown').classList.contains('open') ? closeCategoryDropdown() : openCategoryDropdown(); };
$('startRandomBtn').onclick=()=>startQuiz(shuffle(QUESTIONS).slice(0,70),'اختبار عشوائي 70 سؤال','exam');
$('studyAllBtn').onclick=()=>startQuiz(QUESTIONS,'دراسة كل الأسئلة','study');
$('backBtn').onclick=()=>{ $('quizSection').classList.add('hidden'); $('groupsSection').classList.remove('hidden'); };
$('nextBtn').onclick=next; $('prevBtn').onclick=prev; $('hintBtn').onclick=showHint; $('finishBtn').onclick=finish;
$('translateBtn').onclick=toggleTranslate;
$('retryBtn').onclick=()=>startQuiz(state.lastQuiz,state.title,state.mode);
$('reviewBtn').onclick=()=>{ $('reviewList').classList.toggle('hidden'); renderReview(true); };
$('homeBtn').onclick=()=>{ $('resultSection').classList.add('hidden'); $('groupsSection').classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'}); };
$('resetProgressBtn').onclick=openResetModal;
$('cancelResetBtn').onclick=closeResetModal;
$('confirmResetBtn').onclick=resetSavedProgress;
$('resetModal').onclick=(e)=>{ if(e.target.id==='resetModal') closeResetModal(); };
$('themeBtn').onclick=()=>document.body.classList.toggle('light');
document.addEventListener('click',(e)=>{ if(!$('categoryDropdown').contains(e.target)) closeCategoryDropdown(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !$('resetModal').classList.contains('hidden')) closeResetModal(); if(e.key==='Escape' && $('categoryDropdown').classList.contains('open')) closeCategoryDropdown(); });

buildCategoryDropdown(); updateTopStats(); renderGroups();
