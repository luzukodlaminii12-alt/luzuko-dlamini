import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// A gallery project shown in "The Work 3D" (section "d3") or "Motion Graphics" (section "mg").
export const projects = pgTable("projects", {
  id: serial().primaryKey(),
  section: text().notNull(),
  title: text().notNull().default(""),
  position: integer().notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// A photo or video inside a project. `blobKey` is set for uploaded files; seeded files use a static `url`.
export const media = pgTable("media", {
  id: serial().primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  url: text().notNull(),
  blobKey: text("blob_key"),
  kind: text().notNull().default("i"),
  position: integer().notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Rows in the "Digital Footprint" section.
export const links = pgTable("links", {
  id: serial().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  badge: text().notNull().default(""),
  url: text().notNull().default(""),
  position: integer().notNull().default(0),
});

// Simple key/value site settings (contact email, app link, app card text and image).
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: text().notNull().default(""),
});
