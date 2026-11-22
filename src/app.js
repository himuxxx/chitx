import { supabase, supabaseConfigured } from './supabase.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const norm = (s) => String(s || '').trim();

function fmt(ts) {
  try {
    return new Date(ts).toLocaleString('bn-BD', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return new Date(ts).toLocaleString(); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ---------- config guard ---------- */
if (!supabaseConfigured) {
  $('#configError').hidden = false;
  $('#submitBtn').disabled = true;
  $('#submitBtn').textContent = 'Supabase কনফিগার করা নেই';
}

/* ---------- tabs ---------- */
const tabs = $$('.tabs button');
function showTab(name) {
  tabs.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['write', 'search', 'wall'].forEach((n) => { $('#tab-' + n).hidden = n !== name; });
  if (name === 'wall') renderWall();
  if (name === 'search') $('#q').focus();
}
tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- letter card building ---------- */
function headHTML(row) {
  const badges = `
    <div class="badges">
      <span class="badge ${row.is_public ? 'pub' : 'priv'}">${row.is_public ? 'পাবলিক' : 'প্রাইভেট'}</span>
      <span class="badge seal">🔒 সিল করা</span>
    </div>`;
  return `
    <div class="letter-head">
      <span class="to">প্রিয় <b>${esc(row.to_name)}</b>,</span>
      ${badges}
    </div>`;
}

function footHTML(row) {
  return `
    <div class="letter-foot">
      <span class="from">— ${esc(row.from_name || 'একজন অচেনা')}</span>
      <span>${fmt(row.created_at)}</span>
    </div>`;
}

function fullCard(row) {
  const el = document.createElement('article');
  el.className = 'letter';
  el.innerHTML = headHTML(row)
    + `<div class="letter-body">${esc(row.body)}</div>`
    + footHTML(row);
  return el;
}

async function lockedCard(row) {
  const el = document.createElement('article');
  el.className = 'letter';
  el.innerHTML = headHTML(row)
    + `<div class="locked">
         <span class="ico">🔒</span>
         <p>এই চিঠিটা পাসকোড দিয়ে খুলতে হবে।</p>
         <button type="button" data-unlock>পাসকোড দিয়ে খুলুন</button>
       </div>`
    + footHTML(row);

  $('[data-unlock]', el).addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    for (let i = 0; i < 3; i++) {
      const val = prompt('পাসকোড দাও:');
      if (val === null) { btn.disabled = false; return; }
      const { data, error } = await supabase.rpc('open_letter', { p_id: row.id, p_pass: val });
      if (error) { toast('এরর: ' + error.message); btn.disabled = false; return; }
      if (data && data.length) {
        el.replaceWith(fullCard(data[0]));
        return;
      }
      if (i < 2) toast('ভুল পাসকোড, আবার চেষ্টা করো');
    }
    toast('তিনবার ভুল হয়েছে 🔒');
    btn.disabled = false;
  });

  return el;
}

function emptyHTML(icon, text) {
  return `<div class="empty"><span class="big">${icon}</span>${text}</div>`;
}

/* ---------- WRITE ---------- */
const form = $('#letterForm');
const passField = $('#passField');
const bodyEl = $('#body');
const counter = $('#counter');
const agreeEl = $('#agree');
const submitBtn = $('#submitBtn');

bodyEl.addEventListener('input', () => { counter.textContent = bodyEl.value.length; });
agreeEl.addEventListener('change', () => {
  if (!supabaseConfigured) return;
  submitBtn.disabled = !agreeEl.checked;
});

$$('input[name="vis"]').forEach((r) => {
  r.addEventListener('change', () => {
    passField.hidden = $('input[name="vis"]:checked').value !== 'private';
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseConfigured) return;
  if (!agreeEl.checked) { toast('আগে নিয়মটা মেনে নাও'); return; }

  const to = norm($('#to').value);
  const from = norm($('#from').value);
  const body = norm(bodyEl.value);
  const isPublic = $('input[name="vis"]:checked').value === 'public';
  const pass = isPublic ? null : (norm($('#pass').value) || null);

  if (!to) { toast('কার কাছে চিঠি — নামটা লিখো'); $('#to').focus(); return; }
  if (!body) { toast('চিঠিটা তো ফাঁকা 🙂'); bodyEl.focus(); return; }

  if (!confirm('পাঠানোর পর আর এডিট বা ডিলিট করা যাবে না।\n\nতুমি কি নিশ্চিত?')) return;

  submitBtn.disabled = true;
  const oldLabel = submitBtn.textContent;
  submitBtn.textContent = 'সিল করা হচ্ছে...';

  const { error } = await supabase.from('letters').insert({
    to_name: to,
    from_name: from || null,
    body,
    is_public: isPublic,
    passcode: pass
  });

  submitBtn.textContent = oldLabel;

  if (error) {
    submitBtn.disabled = !agreeEl.checked;
    toast('পাঠানো যায়নি: ' + error.message);
    return;
  }

  form.reset();
  counter.textContent = '0';
  passField.hidden = false;
  submitBtn.disabled = true;

  toast('চিঠি সিল করে রাখা হলো — আর বদলানো যাবে না 💌');
  $('#q').value = to;
  showTab('search');
  doSearch();
});

/* ---------- SEARCH ---------- */
async function doSearch() {
  const box = $('#searchResults');
  if (!supabaseConfigured) return;

  const q = norm($('#q').value);
  if (!q) { box.innerHTML = emptyHTML('🔍', 'নাম লিখে খুঁজুন।'); return; }

  box.innerHTML = emptyHTML('⏳', 'খোঁজা হচ্ছে...');
  $('#searchBtn').disabled = true;

  const { data, error } = await supabase.rpc('find_letters', { p_name: q });
  $('#searchBtn').disabled = false;

  if (error) {
    box.innerHTML = emptyHTML('⚠️', 'এরর: ' + esc(error.message));
    return;
  }
  if (!data || !data.length) {
    box.innerHTML = emptyHTML(
      '💭',
      `‘${esc(q)}’ নামে কোনো চিঠি এখনো লেখা হয়নি।<br>তুমি লেখো — হয়তো সে অপেক্ষা করছে।`
    );
    return;
  }

  box.innerHTML = '';
  for (const row of data) {
    if (row.has_pass) {
      box.appendChild(await lockedCard(row));
    } else {
      const { data: opened, error: e2 } = await supabase.rpc('open_letter', { p_id: row.id });
      if (e2 || !opened || !opened.length) {
        box.appendChild(await lockedCard(row));
      } else {
        box.appendChild(fullCard(opened[0]));
      }
    }
  }
}

$('#searchBtn').addEventListener('click', doSearch);
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

/* ---------- WALL ---------- */
async function renderWall() {
  const box = $('#wallList');
  const stats = $('#stats');
  if (!supabaseConfigured) return;

  box.innerHTML = emptyHTML('⏳', 'লোড হচ্ছে...');

  const { data, error } = await supabase
    .from('letters')
    .select('id, to_name, from_name, body, is_public, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    box.innerHTML = emptyHTML('⚠️', 'এরর: ' + esc(error.message));
    stats.textContent = '';
    return;
  }
  if (!data || !data.length) {
    box.innerHTML = emptyHTML('🕊️', 'দেওয়াল এখনো ফাঁকা। প্রথম পাবলিক চিঠিটা তোমার হোক।');
    stats.textContent = '';
    return;
  }

  box.innerHTML = '';
  data.forEach((row) => box.appendChild(fullCard(row)));
  stats.textContent = `মোট ${data.length} টি পাবলিক চিঠি · সব সিল করা`;
}

/* ---------- SHARED LINK (#l=ID) ---------- */
async function checkShared() {
  if (!supabaseConfigured) return;
  const m = location.hash.match(/^#l=([0-9a-fA-F-]{36})$/);
  if (!m) return;

  const { data, error } = await supabase.rpc('open_letter', { p_id: m[1] });
  if (error || !data || !data.length) {
    $('#sharedList').innerHTML = emptyHTML('🔒', 'এই চিঠিটা খোলা যায়নি — পাসকোড লাগতে পারে বা লিংকটা ভুল।');
    $('#sharedWrap').hidden = false;
    return;
  }

  $('#sharedWrap').hidden = false;
  $('#sharedList').innerHTML = '';
  $('#sharedList').appendChild(fullCard(data[0]));
  $('#sharedWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.addEventListener('hashchange', checkShared);

/* ---------- init ---------- */
checkShared();
