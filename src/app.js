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

/* ---------- letter card ---------- */
function fullCard(row) {
  const el = document.createElement('article');
  el.className = 'letter';
  el.innerHTML = `
    <div class="letter-head">
      <span class="to">প্রিয় <b>${esc(row.to_name)}</b>,</span>
      <div class="badges">
        <span class="badge seal">🔒 সিল করা</span>
      </div>
    </div>
    <div class="letter-body">${esc(row.body)}</div>
    <div class="letter-foot">
      <span class="from">— ${esc(row.from_name || 'একজন অচেনা')}</span>
      <span>${fmt(row.created_at)}</span>
    </div>`;
  return el;
}

function emptyHTML(icon, text) {
  return `<div class="empty"><span class="big">${icon}</span>${text}</div>`;
}

/* ---------- WRITE ---------- */
const form = $('#letterForm');
const bodyEl = $('#body');
const counter = $('#counter');
const agreeEl = $('#agree');
const submitBtn = $('#submitBtn');

bodyEl.addEventListener('input', () => { counter.textContent = bodyEl.value.length; });
agreeEl.addEventListener('change', () => {
  if (!supabaseConfigured) return;
  submitBtn.disabled = !agreeEl.checked;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!supabaseConfigured) return;
  if (!agreeEl.checked) { toast('আগে নিয়মটা মেনে নাও'); return; }

  const to = norm($('#to').value);
  const from = norm($('#from').value);
  const body = norm(bodyEl.value);

  if (!to) { toast('কার কাছে চিঠি — নামটা লিখো'); $('#to').focus(); return; }
  if (!body) { toast('চিঠিটা তো ফাঁকা 🙂'); bodyEl.focus(); return; }

  // বাদ দেওয়া হলো: window.confirm() পপআপ

  submitBtn.disabled = true;
  const oldLabel = submitBtn.textContent;
  submitBtn.textContent = 'সিল করা হচ্ছে...';

  try {
    const { error } = await supabase.from('letters').insert({
      to_name: to,
      from_name: from || null,
      body,
      is_public: true
    });

    if (error) throw error;

    form.reset();
    counter.textContent = '0';
    submitBtn.disabled = true;

    toast('চিঠি সিল করে রাখা হলো — আর বদলানো যাবে না 💌');
    $('#q').value = to;
    showTab('search');
    doSearch();

  } catch (err) {
    console.error('Insert error:', err);
    if (err.message === 'Failed to fetch') {
      toast('নেটওয়ার্ক এরর! Supabase URL বা ইন্টারনেট চেক করুন।');
    } else {
      toast('পাঠানো যায়নি: ' + err.message);
    }
  } finally {
    submitBtn.textContent = oldLabel;
    submitBtn.disabled = !agreeEl.checked;
  }
});

/* ---------- SEARCH ---------- */
async function doSearch() {
  const box = $('#searchResults');
  if (!supabaseConfigured) return;

  const q = norm($('#q').value);
  if (!q) { box.innerHTML = emptyHTML('🔍', 'নাম লিখে খুঁজুন।'); return; }

  box.innerHTML = emptyHTML('⏳', 'খোঁজা হচ্ছে...');
  $('#searchBtn').disabled = true;

  try {
    const { data, error } = await supabase.rpc('find_letters', { p_name: q });
    if (error) throw error;

    if (!data || !data.length) {
      box.innerHTML = emptyHTML(
        '💭',
        `‘${esc(q)}’ নামে কোনো চিঠি এখনো লেখা হয়নি।<br>তুমি লেখো — হয়তো সে অপেক্ষা করছে।`
      );
      return;
    }

    box.innerHTML = '';
    data.forEach((row) => box.appendChild(fullCard(row)));
  } catch (err) {
    box.innerHTML = emptyHTML('⚠️', 'এরর: ' + esc(err.message));
  } finally {
    $('#searchBtn').disabled = false;
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

  try {
    const { data, error } = await supabase
      .from('letters')
      .select('id, to_name, from_name, body, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!data || !data.length) {
      box.innerHTML = emptyHTML('🕊️', 'দেওয়াল এখনো ফাঁকা। প্রথম চিঠিটা তোমার হোক।');
      stats.textContent = '';
      return;
    }

    box.innerHTML = '';
    data.forEach((row) => box.appendChild(fullCard(row)));
    stats.textContent = `মোট ${data.length} টি চিঠি · সব সিল করা`;
  } catch (err) {
    box.innerHTML = emptyHTML('⚠️', 'এরর: ' + esc(err.message));
    stats.textContent = '';
  }
}

/* ---------- SHARED LINK (#l=UUID) ---------- */
async function checkShared() {
  if (!supabaseConfigured) return;
  const m = location.hash.match(/^#l=([0-9a-fA-F-]{36})$/);
  if (!m) return;

  try {
    const { data, error } = await supabase.rpc('open_letter', { p_id: m[1] });
    $('#sharedWrap').hidden = false;

    if (error || !data || !data.length) throw new Error('Not found');

    $('#sharedList').innerHTML = '';
    $('#sharedList').appendChild(fullCard(data[0]));
    $('#sharedWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    $('#sharedWrap').hidden = false;
    $('#sharedList').innerHTML = emptyHTML('🔒', 'এই চিঠিটা খোলা যায়নি — লিংকটা ভুল হতে পারে।');
  }
}

window.addEventListener('hashchange', checkShared);

/* ---------- init ---------- */
checkShared();
