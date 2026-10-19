import { integer, sqliteTable, text, primaryKey } from "drizzle-orm/sqlite-core";

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  player: text("player").notNull(),
  day: integer("day").notNull(),
  title: text("title").notNull(),
  views: integer("views"),
  followers: integer("followers"),
  note: text("note").notNull().default(""),
  created: integer("created").notNull(),
});

export const polls = sqliteTable("polls", {
  id: text("id").primaryKey(),
  player: text("player").notNull(),
  day: integer("day").notNull(),
  options: text("options").notNull(),
  results: text("results").notNull().default("[]"),
  active: integer("active").notNull().default(1),
  created: integer("created").notNull(),
});

export const votes = sqliteTable("votes", {
  pollId: text("poll_id").notNull(),
  voterId: text("voter_id").notNull(),
  choice: integer("choice").notNull(),
  created: integer("created").notNull(),
}, (table) => [primaryKey({ columns: [table.pollId, table.voterId] })]);
