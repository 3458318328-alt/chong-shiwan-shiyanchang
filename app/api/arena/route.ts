import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

type Entry = {
  id: string; type: string; player: string; day: number; title: string;
  views: number | null; followers: number | null; note: string; created: number;
};
type Poll = { id: string; player: string; day: number; options: string; active: number; created: number };

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
function cookieVoter(request: Request) {
  const match = request.headers.get("cookie")?.match(/(?:^|;\s*)arena_voter=([0-9a-f-]{36})(?:;|$)/i);
  return match?.[1] ?? null;
}
async function currentPoll() {
  return db().prepare("SELECT id, player, day, options, active, created FROM polls WHERE active = 1 ORDER BY created DESC LIMIT 1").first<Poll>();
}

export async function GET(request: Request) {
  try {
    const database = db();
    const [entryRows, poll, owner] = await Promise.all([
      database.prepare("SELECT id, type, player, day, title, views, followers, note, created FROM entries ORDER BY created ASC").all<Entry>(),
      currentPoll(),
      isOwner(),
    ]);
    let ballot: { index: number; pollId: string } | null = null;
    let activePoll: { id: string; player: string; day: number; options: string[]; counts: number[]; total: number } | null = null;
    if (poll) {
      const options = JSON.parse(poll.options) as string[];
      const counts = Array(options.length).fill(0) as number[];
      const tally = await database.prepare("SELECT choice, COUNT(*) AS count FROM votes WHERE poll_id = ? GROUP BY choice").bind(poll.id).all<{ choice: number; count: number }>();
      for (const row of tally.results ?? []) if (row.choice >= 0 && row.choice < counts.length) counts[row.choice] = row.count;
      const voter = cookieVoter(request);
      if (voter) {
        const vote = await database.prepare("SELECT choice FROM votes WHERE poll_id = ? AND voter_id = ?").bind(poll.id, voter).first<{ choice: number }>();
        if (vote) ballot = { pollId: poll.id, index: vote.choice };
      }
      activePoll = { id: poll.id, player: poll.player, day: poll.day, options, counts, total: counts.reduce((a,b)=>a+b,0) };
    }
    return json({ entries: entryRows.results ?? [], poll: activePoll, vote: ballot, owner, signedIn: Boolean(await getChatGPTUser()) });
  } catch (error) {
    console.error("Arena read failed", error);
    return json({ error: "数据暂时无法读取" }, 500);
  }
}

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try { input = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "请求格式不正确" }, 400); }
  if (input.action === "vote") return vote(request, input);
  if (!(await isOwner())) return json({ error: "仅管理员可修改数据，请先登录管理员账号" }, 403);
  if (input.action === "entry") return addEntry(input);
  if (input.action === "update") return updateVideo(input);
  if (input.action === "poll") return setPoll(input);
  if (input.action === "import") return importBackup(input);
  return json({ error: "未知操作" }, 400);
}

async function addEntry(input: Record<string, unknown>) {
  const type = input.type, player = input.player, day = input.day, title = input.title;
  const views = input.views, followers = input.followers, note = input.note;
  if (!["published", "rejected", "approved", "reflection"].includes(String(type)) || !validPlayer(player) || !validDay(day) || !validText(title, 100) || !validCount(views) || !validCount(followers) || typeof note !== "string" || note.length > 500) return json({ error: "记录字段不正确" }, 400);
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

async function setPoll(input: Record<string, unknown>) {
  const player = input.player, day = input.day, options = input.options;
  if (!validPlayer(player) || !validDay(day, 1) || !Array.isArray(options) || options.length < 2 || options.length > 3 || !options.every(x => validText(x, 100))) return json({ error: "候选题必须为 2～3 个" }, 400);
  const database = db();
  const id = crypto.randomUUID();
  await database.batch([
    database.prepare("UPDATE polls SET active = 0 WHERE active = 1"),
    database.prepare("INSERT INTO polls (id, player, day, options, active, created) VALUES (?, ?, ?, ?, 1, ?)").bind(id, player, day, JSON.stringify(options.map(x => String(x).trim())), Date.now()),
  ]);
  return json({ ok: true, id });
}

async function vote(request: Request, input: Record<string, unknown>) {
  const poll = await currentPoll();
  const choice = input.choice;
  if (!poll || input.pollId !== poll.id) return json({ error: "本轮投票已更新，请刷新页面" }, 409);
  const options = JSON.parse(poll.options) as string[];
  if (!Number.isInteger(choice) || Number(choice) < 0 || Number(choice) >= options.length) return json({ error: "请选择有效选项" }, 400);
  const voter = cookieVoter(request) ?? crypto.randomUUID();
  await db().prepare("INSERT INTO votes (poll_id, voter_id, choice, created) VALUES (?, ?, ?, ?) ON CONFLICT(poll_id, voter_id) DO UPDATE SET choice = excluded.choice, created = excluded.created").bind(poll.id, voter, choice, Date.now()).run();
  return json({ ok: true }, 200, { "Set-Cookie": `arena_voter=${voter}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` });
}

async function importBackup(input: Record<string, unknown>) {
  const backup = input.backup as Record<string, unknown> | undefined;
  if (!backup || !Array.isArray(backup.entries) || backup.entries.length > 200 || (backup.poll !== null && backup.poll !== undefined && typeof backup.poll !== "object")) return json({ error: "备份格式不正确" }, 400);
  const entries = backup.entries as Record<string, unknown>[];
  for (const e of entries) {
    if (!e || !["published", "rejected", "approved", "reflection"].includes(String(e.type)) || !validPlayer(e.player) || !validDay(e.day) || !validText(e.title, 100) || !validCount(e.views ?? null) || !validCount(e.followers ?? null) || typeof (e.note ?? "") !== "string" || String(e.note ?? "").length > 500) return json({ error: "备份中有无效记录" }, 400);
  }
  const poll = backup.poll as Record<string, unknown> | null | undefined;
  if (poll && (!validPlayer(poll.player) || !validDay(poll.day, 1) || !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 3 || !poll.options.every(x=>validText(x,100)))) return json({ error: "备份中的投票格式不正确" }, 400);
  const database = db();
  const statements = [database.prepare("DELETE FROM votes"), database.prepare("DELETE FROM polls"), database.prepare("DELETE FROM entries")];
  for (const e of entries) statements.push(database.prepare("INSERT INTO entries (id, type, player, day, title, views, followers, note, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), e.type, e.player, e.day, String(e.title).trim(), e.views ?? null, e.followers ?? null, e.note ?? "", Number.isFinite(e.created) ? e.created : Date.now()));
  if (poll) statements.push(database.prepare("INSERT INTO polls (id, player, day, options, active, created) VALUES (?, ?, ?, ?, 1, ?)").bind(crypto.randomUUID(), poll.player, poll.day, JSON.stringify(poll.options), Date.now()));
  await database.batch(statements);
  return json({ ok: true });
}
