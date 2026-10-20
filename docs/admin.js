let data = {entries:[],poll:null};
const el = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const message = value => { el('message').textContent = value; };
function updateOptions() {
  const selected = el('entry-id').value;
  el('entry-id').innerHTML = '<option value="">新增记录</option>' + data.entries.map(entry => `<option value="${safe(entry.id)}">Day ${entry.day} · ${entry.player === 'a' ? '阿零' : '时休'} · ${safe(entry.title)}</option>`).join('');
  if (data.entries.some(entry => entry.id === selected)) el('entry-id').value = selected;
  el('entry-count').textContent = data.entries.length;
}
function loadEntry() {
  const entry = data.entries.find(item => item.id === el('entry-id').value);
  if (!entry) return;
  el('entry-type').value = entry.type;
  el('entry-player').value = entry.player;
  el('entry-day').value = entry.day;
  el('entry-title').value = entry.title;
  el('entry-views').value = entry.views ?? '';
  el('entry-followers').value = entry.followers ?? '';
  el('entry-note').value = entry.note ?? '';
}
el('entry-id').addEventListener('change', loadEntry);
el('save-entry').addEventListener('click', () => {
  const type = el('entry-type').value, player = el('entry-player').value;
  const day = Number(el('entry-day').value), title = el('entry-title').value.trim();
  const views = el('entry-views').value === '' ? null : Number(el('entry-views').value);
  const followers = el('entry-followers').value === '' ? null : Number(el('entry-followers').value);
  const note = el('entry-note').value.trim();
  if (!Number.isInteger(day) || day < 0 || day > 30 || !title || title.length > 100 || (type === 'reflection' && !note) || note.length > (type === 'reflection' ? 5000 : 500) || [views,followers].some(value => value !== null && (!Number.isInteger(value) || value < 0))) { message('请检查 Day、标题、正文和非负整数数据。'); return; }
  const id = el('entry-id').value || crypto.randomUUID();
  const previous = data.entries.find(entry => entry.id === id);
  const entry = {id,type,player,day,title,views,followers,note,created:previous?.created ?? Date.now()};
  if (previous) Object.assign(previous,entry); else data.entries.push(entry);
  updateOptions(); el('entry-id').value = id;
  message('已加入待提交数据。最后还需复制完整数据并到 GitHub 提交。');
});
el('save-poll').addEventListener('click', () => {
  const options = el('poll-options').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const rawCounts = el('poll-counts').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const counts = rawCounts.length ? rawCounts.map(Number) : options.map(() => 0);
  const day = Number(el('poll-day').value);
  if (options.length < 2 || options.length > 3 || options.some(x => x.length > 100) || counts.length !== options.length || counts.some(x => !Number.isInteger(x) || x < 0) || !Number.isInteger(day) || day < 1 || day > 30) { message('请填 2～3 个选题，并为每题填一个非负整数票数。'); return; }
  data.poll = {player:el('poll-player').value,day,options,counts};
  message('候选题和票数已加入待提交数据。最后还需到 GitHub 提交。');
});
el('copy-data').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(data,null,2) + '\n'); message('完整数据已复制。请打开上方 GitHub 数据文件，全选原内容并粘贴提交。'); }
  catch { message('复制失败。请使用“下载 JSON 备份”，再到 GitHub 上传文件。'); }
});
el('download-data').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2) + '\n'],{type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'data.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
  message('data.json 已下载。请到 GitHub 替换 docs/data.json 并提交。');
});
fetch('data.json',{cache:'no-store'}).then(response => {
  if (!response.ok) throw Error('读取失败'); return response.json();
}).then(value => {
  if (!Array.isArray(value.entries)) throw Error('格式错误');
  data = value; updateOptions();
  if (data.poll) {
    el('poll-player').value = data.poll.player;
    el('poll-day').value = data.poll.day;
    el('poll-options').value = data.poll.options.join('\n');
    el('poll-counts').value = (data.poll.counts ?? []).join('\n');
  }
  message('已载入网站当前数据。录入后记得复制并提交到 GitHub。');
}).catch(() => message('网站数据载入失败，请刷新后再编辑。'));
