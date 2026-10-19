const API = '/api/arena';
let data = { entries: [], poll: null, owner: false, signedIn: false };
let filter = 'all';
function el(id) { return document.getElementById(id); }
function fmt(value) { return Number(value).toLocaleString('zh-CN'); }
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]); }
function entriesFor(player, type) { return data.entries.filter(entry => entry.player === player && (!type || entry.type === type)); }
async function request(body) {
  const response = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw Error(payload.error || '操作失败');
  return payload;
}
async function refresh() {
  try {
    const response = await fetch(API, { credentials: 'same-origin', cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error || '读取失败');
    data = payload;
    updateAdminButton();
    render();
    renderVideoOptions();
  } catch (error) {
    el('status-note').textContent = '数据暂时无法读取，请稍后刷新页面';
    el('vote-note').textContent = String(error.message || error);
  }
}
function updateAdminButton() {
  const button = el('open-admin');
  if (data.owner) { button.hidden = false; button.innerHTML = '录入数据 <span>↗</span>'; }
  else if (data.signedIn) button.hidden = true;
  else { button.hidden = false; button.innerHTML = '管理员登录 <span>↗</span>'; }
}
function renderScores() {
  const published = data.entries.filter(entry => entry.type === 'published');
  const day = Math.max(0, ...data.entries.map(entry => Number(entry.day) || 0));
  el('hero-day').textContent = String(day).padStart(2, '0');
  el('status-note').textContent = day ? `Day ${day} · 已录入 ${published.length} 条参赛视频` : 'Day 0 · 主理人开场，等待 Day 1 正式出战';
  for (const player of ['a', 'b']) {
    const videos = entriesFor(player, 'published');
    const best = Math.max(0, ...videos.map(video => Number(video.views) || 0));
    const total = videos.reduce((value, video) => value + (Number(video.views) || 0), 0);
    const followers = videos.reduce((value, video) => value + (Number(video.followers) || 0), 0);
    const week = Math.floor(Math.max(day - 1, 0) / 7);
    const rejected = entriesFor(player, 'rejected').filter(entry => Math.floor(Math.max(Number(entry.day) - 1, 0) / 7) === week).length;
    el(`${player}-best`).textContent = videos.length ? fmt(best) : '—';
    el(`${player}-total`).textContent = videos.length ? fmt(total) : '—';
    el(`${player}-followers`).textContent = videos.length ? `+${fmt(followers)}` : '—';
    el(`${player}-published`).textContent = videos.length;
    el(`${player}-rejected`).textContent = rejected;
    el(`${player}-progress`).style.width = `${Math.min(100, best / 1000)}%`;
    el(`${player}-status`).textContent = best >= 100000 ? '已达十万' : videos.length ? '挑战中' : '待开赛';
  }
  const a = Math.max(0, ...entriesFor('a', 'published').map(video => Number(video.views) || 0));
  const b = Math.max(0, ...entriesFor('b', 'published').map(video => Number(video.views) || 0));
  const verdict = el('verdict').querySelector('p');
  if (a >= 100000 || b >= 100000) {
    const winner = a >= 100000 && b >= 100000 ? '双方均已破十万，请按最先达标的记录判定' : a >= 100000 ? '阿零已达到单条十万播放' : '时休已达到单条十万播放';
    verdict.textContent = winner + '。请核对平台播放数据和达标时间。';
  } else if (day >= 30 && published.length) {
    verdict.textContent = `30 天已结束。阿零单条最高 ${fmt(a)}，时休单条最高 ${fmt(b)}。${a === b ? '目前持平，请人工确认最终规则。' : a > b ? '阿零暂居领先。' : '时休暂居领先。'}`;
  } else verdict.textContent = '谁先有单条视频达到 10 万播放，谁立即获胜。30 天无人达标，则比较各自单条最高播放。';
}
const typeText = { published:'视频发布', rejected:'审核打回', approved:'审核通过', reflection:'每日复盘' };
function renderEntries() {
  const items = data.entries.filter(entry => filter === 'all' || entry.player === filter).sort((a,b) => Number(b.day) - Number(a.day) || Number(b.created) - Number(a.created));
  const box = el('entries');
  if (!items.length) { box.innerHTML = '<div class="empty"><div><b>赛场还空着。</b><p>Day 0 由主理人开场；从 Day 1 的首条参赛视频开始记录对决。</p></div></div>'; return; }
  box.innerHTML = items.map(entry => `<article class="entry"><span class="entry-day">DAY ${String(entry.day).padStart(2,'0')}</span><span class="entry-player ${entry.player}">${entry.player === 'a' ? '阿零' : '时休'} · ${typeText[entry.type] || '记录'}</span><div><h3>${safe(entry.title)}</h3><p>${safe(entry.note)}</p></div><span class="entry-meta">${entry.type === 'published' && entry.views !== null ? `${fmt(entry.views)} 播放` : typeText[entry.type] || ''}</span></article>`).join('');
}
function renderPoll() {
  const box = el('vote-options'), poll = data.poll;
  if (!poll || !Array.isArray(poll.options) || poll.options.length < 2) {
    el('vote-target').textContent = '等待选题'; box.innerHTML = '';
    el('poll-counts').value = '';
    el('vote-note').textContent = '阿零和时休还没有提交候选题。开赛后，请在视频评论区投票。'; return;
  }
  el('vote-target').textContent = `${poll.player === 'a' ? '阿零' : '时休'} · Day ${poll.day}`;
  if (data.owner) el('poll-counts').value = poll.counts.join('\n');
  box.innerHTML = poll.options.map((option, index) => {
    const count = Number(poll.counts?.[index]) || 0;
    const percent = poll.total ? Math.round(count / poll.total * 100) : 0;
    return `<div class="vote-option"><div class="bar" style="width:${percent}%"></div><span>${String(index + 1).padStart(2,'0')}　${safe(option)}</span><small>${poll.total ? `${percent}% · ${count} 票` : '待统计'}</small></div>`;
  }).join('');
  el('vote-note').textContent = `请在该期视频评论区回复 1 / 2 / 3 投票。这里展示人工汇总的结果，目前已录入 ${fmt(poll.total || 0)} 票。`;
}
function render() { renderScores(); renderEntries(); renderPoll(); }
function renderVideoOptions() {
  const select = el('update-video');
  const selected = select.value;
  const videos = data.entries.filter(entry => entry.type === 'published');
  select.innerHTML = '<option value="">选择要更新的视频</option>' + videos.map(entry => `<option value="${safe(entry.id)}">Day ${entry.day} · ${entry.player === 'a' ? '阿零' : '时休'} · ${safe(entry.title)}</option>`).join('');
  if (videos.some(entry => entry.id === selected)) select.value = selected;
}
function message(value) { el('admin-message').textContent = value; }
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  renderEntries();
}));
const dialog = el('admin-dialog');
el('open-admin').addEventListener('click', () => {
  if (data.owner) dialog.showModal();
  else window.location.assign('/signin-with-chatgpt?return_to=%2Farena.html');
});
el('save-entry').addEventListener('click', async () => {
  const type = el('entry-type').value, player = el('entry-player').value;
  const day = Number(el('entry-day').value), title = el('entry-title').value.trim();
  const views = el('entry-views').value, followers = el('entry-followers').value;
  const note = el('entry-note').value.trim();
  if (!title || !Number.isInteger(day) || day < 0 || day > 30) { message('请填写标题和 0～30 的 Day。'); return; }
  try {
    await request({ action:'entry', type, player, day, title, views:views === '' ? null : Number(views), followers:followers === '' ? null : Number(followers), note });
    el('entry-title').value = ''; el('entry-views').value = ''; el('entry-followers').value = ''; el('entry-note').value = '';
    await refresh(); message('记录已保存，所有访客将看到更新。');
  } catch (error) { message(error.message); }
});
el('update-video').addEventListener('change', () => {
  const video = data.entries.find(entry => entry.id === el('update-video').value);
  el('update-views').value = video?.views ?? '';
  el('update-followers').value = video?.followers ?? '';
});
el('update-stats').addEventListener('click', async () => {
  const id = el('update-video').value;
  if (!id) { message('请先选择一条已发布视频。'); return; }
  const views = el('update-views').value, followers = el('update-followers').value;
  try {
    await request({ action:'update', id, views:views === '' ? null : Number(views), followers:followers === '' ? null : Number(followers) });
    await refresh(); message('视频数据已更新，所有访客将看到最新数值。');
  } catch (error) { message(error.message); }
});
el('save-poll').addEventListener('click', async () => {
  const options = el('poll-options').value.split('\n').map(value => value.trim()).filter(Boolean);
  const day = Number(el('poll-day').value);
  if (options.length < 2 || options.length > 3 || !Number.isInteger(day) || day < 1 || day > 30) { message('请输入 2～3 个候选题，以及 1～30 的截止 Day。'); return; }
  try { await request({ action:'poll', player:el('poll-player').value, day, options }); await refresh(); message('候选题已更新，请在视频结尾和评论区引导观众投票。'); }
  catch (error) { message(error.message); }
});
el('save-tally').addEventListener('click', async () => {
  if (!data.poll) { message('请先设置本轮候选题。'); return; }
  const values = el('poll-counts').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const counts = values.map(value => Number(value));
  if (counts.length !== data.poll.options.length || counts.some(value => !Number.isInteger(value) || value < 0)) { message(`请按候选题顺序填写 ${data.poll.options.length} 行非负整数票数。`); return; }
  try { await request({ action:'tally', pollId:data.poll.id, counts }); await refresh(); message('评论区统计结果已更新。'); }
  catch (error) { message(error.message); }
});
el('export-data').addEventListener('click', () => {
  const backup = { entries:data.entries, poll:data.poll ? { player:data.poll.player, day:data.poll.day, options:data.poll.options, counts:data.poll.counts } : null };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = '冲十万实验场-备份.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); message('记录和评论区统计结果备份已下载。');
});
el('import-data').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!Array.isArray(backup.entries)) throw Error('文件格式不正确');
    if (!confirm('导入会替换网站当前的记录、候选题和评论区统计结果。继续吗？')) return;
    await request({ action:'import', backup }); await refresh(); message('备份已导入，所有访客将看到更新。');
  } catch (error) { message(`导入失败：${error.message}`); }
  finally { event.target.value = ''; }
});
refresh();
