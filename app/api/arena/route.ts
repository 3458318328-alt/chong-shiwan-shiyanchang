import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

type Entry = {
  id: string; type: string; player: string; day: number; title: string;
  views: number | null; followers: number | null; note: string; created: number;
};
type Poll = { id: string; player: string; day: number; options: string; results: string; active: number; created: number };

function db() {
  if (!env.DB) throw new Error("D1 database is unavailable");
  return env.DB;
}
function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
function validPlayer(value: unknown): value is "a" | "b" { return value === "a" || value === "b"; }
function validDay(value: unknown, min = 0): value is number { return Number.isInteger(value) && Number(value) >= min && Number(value) <= 30; }
function validCount(value: unknown): value is number | null { return value === null || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000_000); }
function validText(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
async function isOwner() {
  const user = await getChatGPTUser();
  const admin = env.ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(user && admin && user.email.trim().toLowerCase() === admin);
}
async function currentPoll() {
  return db().prepare("SELECT id, player, day, options, results, active, created FROM polls WHERE active = 1 ORDER BY created DESC LIMIT 1").first<Poll>();
}

export async function GET() {
  try {
    const database = db();
    const [entryRows, poll, owner] = await Promise.all([
      database.prepare("SELECT id, type, player, day, title, views, followers, note, created FROM entries ORDER BY created ASC").all<Entry>(),
      currentPoll(),
      isOwner(),
    ]);
    let activePoll: { id: string; player: string; day: number; options: string[]; counts: number[]; total: number } | null = null;
    if (poll) {
      const options = JSON.parse(poll.options) as string[];
      const saved = JSON.parse(poll.results) as number[];
      const counts = options.map((_, index) => Number.isInteger(saved[index]) && saved[index] >= 0 ? saved[index] : 0);
      activePoll = { id: poll.id, player: poll.player, day: poll.day, options, counts, total: counts.reduce((a,b)=>a+b,0) };
    }
    return json({ entries: entryRows.results ?? [], poll: activePoll, owner, signedIn: Boolean(await getChatGPTUser()) });
  } catch (error) {
    console.error("Arena read failed", error);
    return json({ error: "数据暂时无法读取" }, 500);
  }
}

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "请求格式不正确" }, 400); }
  if (input.action === "vote") return json({ error: "请在视频评论区投票" }, 410);
  if (!(await isOwner())) return json({ error: "仅管理员可修改数据，请先登录管理员账号" }, 403);
  if (input.action === "entry") return addEntry(input);
  if (input.action === "update") return updateVideo(input);
  if (input.action === "updateReflection") return updateReflection(input);
  if (input.action === "poll") return setPoll(input);
  if (input.action === "tally") return setTally(input);
  if (input.action === "import") return importBackup(input);
  return json({ error: "未知操作" }, 400);
}

async function addEntry(input: Record<string, unknown>) {
  const type = input.type, player = input.player, day = input.day, title = input.title;
  const views = input.views, followers = input.followers, note = input.note;
  if (!["published", "rejected", "approved", "reflection"].includes(String(type)) || !validPlayer(player) || !validDay(day) || !validText(title, 100) || !validCount(views) || !validCount(followers) || typeof note !== "string" || note.length > (type === "reflection" ? 5000 : 500) || (type === "reflection" && !note.trim())) return json({ error: "记录字段不正确" }, 400);
  const database = db();
  if (type === "published") {
    const row = await database.prepare("SELECT COUNT(*) AS count FROM entries WHERE player = ? AND type = 'published'").bind(player).first<{ count: number }>();
    if ((row?.count ?? 0) >= 15) return json({ error: "这位 AI 已发布 15 条" }, 409);
  }
  if (type === "rejected") {
    const weekStart = day === 0 ? 0 : Math.floor((day - 1) / 7) * 7 + 1;
    const weekEnd = day === 0 ? 0 : Math.min(30, weekStart + 6);
    const row = await database.prepare("SELECT COUNT(*) AS count FROM entries WHERE player = ? AND type = 'rejected' AND day BETWEEN ? AND ?").bind(player, weekStart, weekEnd).first<{ count: number }>();
    if ((row?.count ?? 0) >= 2) return json({ error: "这位 AI 本周已被打回 2 次" }, 409);
  }
  const id = crypto.randomUUID();
  await database.prepare("INSERT INTO entries (id, type, player, day, title, views, followers, note, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, type, player, day, title.trim(), views, followers, note, Date.now()).run();
  return json({ ok: true, id });
}

async function updateVideo(input: Record<string, unknown>) {
  if (typeof input.id !== "string" || input.id.length > 80 || !validCount(input.views) || !validCount(input.followers)) return json({ error: "视频数据不正确" }, 400);
  const database = db();
  const existing = await database.prepare("SELECT id FROM entries WHERE id = ? AND type = 'published'").bind(input.id).first<{ id: string }>();
  if (!existing) return json({ error: "找不到这条视频" }, 404);
  await database.prepare("UPDATE entries SET views = ?, followers = ? WHERE id = ?").bind(input.views, input.followers, input.id).run();
  return json({ ok: true });
}

async function updateReflection(input: Record<string, unknown>) {
  if (typeof input.id !== "string" || input.id.length > 80 || !validText(input.title, 100) || !validText(input.note, 5000)) return json({ error: "总结内容不正确" }, 400);
  const existing = await db().prepare("SELECT id FROM entries WHERE id = ? AND type = 'reflection'").bind(input.id).first<{ id: string }>();
  if (!existing) return json({ error: "找不到这篇总结" }, 404);
  await db().prepare("UPDATE entries SET title = ?, note = ? WHERE id = ?").bind(input.title.trim(), input.note.trim(), input.id).run();
  return json({ ok: true });
}

async function setPoll(input: Record<string, unknown>) {
  const player = input.player, day = input.day, options = input.options;
  if (!validPlayer(player) || !validDay(day, 1) || !Array.isArray(options) || options.length < 2 || options.length > 3 || !options.every(x => validText(x, 100))) return json({ error: "候选题必须为 2～3 个" }, 400);
  const database = db();
  const id = crypto.randomUUID();
  await database.batch([
    database.prepare("UPDATE polls SET active = 0 WHERE active = 1"),
    database.prepare("INSERT INTO polls (id, player, day, options, results, active, created) VALUES (?, ?, ?, ?, ?, 1, ?)").bind(id, player, day, JSON.stringify(options.map(x => String(x).trim())), JSON.stringify(options.map(() => 0)), Date.now()),
  ]);
  return json({ ok: true, id });
}

async function setTally(input: Record<string, unknown>) {
  const poll = await currentPoll();
  if (!poll || input.pollId !== poll.id) return json({ error: "本轮候选题已更新，请刷新页面" }, 409);
  const options = JSON.parse(poll.options) as string[];
  const counts = input.counts;
  if (!Array.isArray(counts) || counts.length !== options.length || !counts.every(x => Number.isInteger(x) && x >= 0 && x <= 1_000_000_000)) return json({ error: "请按候选题顺序填写非负整数票数" }, 400);
  await db().prepare("UPDATE polls SET results = ? WHERE id = ?").bind(JSON.stringify(counts), poll.id).run();
  return json({ ok: true });
}

async function importBackup(input: Record<string, unknown>) {
  const backup = input.backup as Record<string, unknown> | undefined;
  if (!backup || !Array.isArray(backup.entries) || backup.entries.length > 200 || (backup.poll !== null && backup.poll !== undefined && typeof backup.poll !== "object")) return json({ error: "备份格式不正确" }, 400);
  const entries = backup.entries as Record<string, unknown>[];
  for (const e of entries) {
    if (!e || !["published", "rejected", "approved", "reflection"].includes(String(e.type)) || !validPlayer(e.player) || !validDay(e.day) || !validText(e.title, 100) || !validCount(e.views ?? null) || !validCount(e.followers ?? null) || typeof (e.note ?? "") !== "string" || String(e.note ?? "").length > (e.type === "reflection" ? 5000 : 500)) return json({ error: "备份中有无效记录" }, 400);
  }
  const poll = backup.poll as Record<string, unknown> | null | undefined;
  if (poll && (!validPlayer(poll.player) || !validDay(poll.day, 1) || !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 3 || !poll.options.every(x=>validText(x,100)))) return json({ error: "备份中的投票格式不正确" }, 400);
  const counts = poll && Array.isArray(poll.counts) && poll.counts.length === (poll.options as unknown[]).length && poll.counts.every(x => Number.isInteger(x) && x >= 0) ? poll.counts : poll ? (poll.options as unknown[]).map(() => 0) : [];
  const database = db();
  const statements = [database.prepare("DELETE FROM votes"), database.prepare("DELETE FROM polls"), database.prepare("DELETE FROM entries")];
  for (const e of entries) statements.push(database.prepare("INSERT INTO entries (id, type, player, day, title, views, followers, note, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), e.type, e.player, e.day, String(e.title).trim(), e.views ?? null, e.followers ?? null, e.note ?? "", Number.isFinite(e.created) ? e.created : Date.now()));
  if (poll) statements.push(database.prepare("INSERT INTO polls (id, player, day, options, results, active, created) VALUES (?, ?, ?, ?, ?, 1, ?)").bind(crypto.randomUUID(), poll.player, poll.day, JSON.stringify(poll.options), JSON.stringify(counts), Date.now()));
  await database.batch(statements);
  return json({ ok: true });
}
