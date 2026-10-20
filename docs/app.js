let data = { entries: [], poll: null };
let filter = 'all';
const el = id => document.getElementById(id);
const fmt = value => Number(value).toLocaleString('zh-CN');
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const entriesFor = (player, type) => data.entries.filter(entry => entry.player === player && (!type || entry.type === type));

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
  if (a >= 100000 || b >= 100000) verdict.textContent = (a >= 100000 && b >= 100000 ? '双方均已破十万，请按最先达标的记录判定' : a >= 100000 ? '阿零已达到单条十万播放' : '时休已达到单条十万播放') + '。请核对平台播放数据和达标时间。';
  else if (day >= 30 && published.length) verdict.textContent = `30 天已结束。阿零单条最高 ${fmt(a)}，时休单条最高 ${fmt(b)}。${a === b ? '目前持平，请人工确认最终规则。' : a > b ? '阿零暂居领先。' : '时休暂居领先。'}`;
  else verdict.textContent = '谁先有单条视频达到 10 万播放，谁立即获胜。30 天无人达标，则比较各自单条最高播放。';
}

const typeText = { published:'视频发布', rejected:'审核打回', approved:'审核通过' };
function renderEntries() {
  const items = data.entries.filter(entry => entry.type !== 'reflection' && (filter === 'all' || entry.player === filter)).sort((a,b) => Number(b.day) - Number(a.day) || Number(b.created) - Number(a.created));
  const box = el('entries');
  if (!items.length) { box.innerHTML = '<div class="empty"><div><b>赛场还空着。</b><p>Day 0 由主理人开场；从 Day 1 的首条参赛视频开始记录对决。</p></div></div>'; return; }
  box.innerHTML = items.map(entry => `<article class="entry"><span class="entry-day">DAY ${String(entry.day).padStart(2,'0')}</span><span class="entry-player ${entry.player}">${entry.player === 'a' ? '阿零' : '时休'} · ${typeText[entry.type] || '记录'}</span><div><h3>${safe(entry.title)}</h3><p>${safe(entry.note)}</p></div><span class="entry-meta">${entry.type === 'published' && entry.views !== null ? `${fmt(entry.views)} 播放` : typeText[entry.type] || ''}</span></article>`).join('');
}
function renderReflections() {
  const items = data.entries.filter(entry => entry.type === 'reflection').sort((a,b) => Number(b.day) - Number(a.day) || Number(b.created) - Number(a.created));
  const box = el('reflections');
  if (!items.length) { box.innerHTML = '<div class="empty"><div><b>等待他们开口。</b><p>主理人录入后，阿零和时休的原文会显示在这里。</p></div></div>'; return; }
  box.innerHTML = items.map(entry => `<article class="reflection-card ${entry.player}"><div class="reflection-meta"><span>DAY ${String(entry.day).padStart(2,'0')}</span><strong>${entry.player === 'a' ? '阿零' : '时休'}</strong></div><h3>${safe(entry.title)}</h3><p>${safe(entry.note)}</p></article>`).join('');
}
function renderPoll() {
  const box = el('vote-options'), poll = data.poll;
  if (!poll || !Array.isArray(poll.options) || poll.options.length < 2) {
    el('vote-target').textContent = '等待选题'; box.innerHTML = '';
    el('vote-note').textContent = '阿零和时休还没有提交候选题。开赛后，请在视频评论区投票。'; return;
  }
  const counts = poll.options.map((_, index) => Number(poll.counts?.[index]) || 0);
  const total = counts.reduce((a,b) => a+b, 0);
  el('vote-target').textContent = `${poll.player === 'a' ? '阿零' : '时休'} · Day ${poll.day}`;
  box.innerHTML = poll.options.map((option, index) => {
    const percent = total ? Math.round(counts[index] / total * 100) : 0;
    return `<div class="vote-option"><div class="bar" style="width:${percent}%"></div><span>${String(index + 1).padStart(2,'0')}　${safe(option)}</span><small>${total ? `${percent}% · ${counts[index]} 票` : '待统计'}</small></div>`;
  }).join('');
  el('vote-note').textContent = `请在该期视频评论区回复 1 / 2 / 3 投票。这里展示人工汇总的结果，目前已录入 ${fmt(total)} 票。`;
}
document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  renderEntries();
}));
fetch('data.json', {cache:'no-store'}).then(response => {
  if (!response.ok) throw Error('数据读取失败');
  return response.json();
}).then(payload => {
  if (!Array.isArray(payload.entries)) throw Error('数据格式不正确');
  data = payload;
  renderScores(); renderEntries(); renderReflections(); renderPoll();
}).catch(() => {
  el('status-note').textContent = '数据暂时无法读取，请稍后刷新页面';
  el('vote-note').textContent = '数据暂时无法读取';
});
