// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable("contacts", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	name: text("name"),
	/** 'unknown' | 'free' | 'paid' — free-form so new tiers need no migration */
	tier: text("tier").notNull().default("unknown"),
	/** 'personal' | 'corporate' | 'automated' */
	email_kind: text("email_kind").notNull().default("corporate"),
	/** 'auto' | 'manual' */
	source: text("source").notNull().default("auto"),
	tags: text("tags").notNull().default("[]"),
	notes: text("notes"),
	metadata: text("metadata").notNull().default("{}"),
	first_seen_at: text("first_seen_at").notNull(),
	last_contact_at: text("last_contact_at"),
	created_at: text("created_at").notNull(),
	updated_at: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
	id: text("id").primaryKey(),
	contact_id: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
	title: text("title").notNull(),
	description: text("description"),
	/** 'open' | 'done' | 'cancelled' */
	status: text("status").notNull().default("open"),
	/** 'normal' | 'high' */
	priority: text("priority").notNull().default("normal"),
	due_at: text("due_at"),
	source_mailbox_id: text("source_mailbox_id"),
	source_email_id: text("source_email_id"),
	source_thread_id: text("source_thread_id"),
	/** 'replied' | 'released' | 'fixed' | 'other' */
	resolution_type: text("resolution_type"),
	resolution_note: text("resolution_note"),
	resolution_ref: text("resolution_ref"),
	created_at: text("created_at").notNull(),
	updated_at: text("updated_at").notNull(),
	completed_at: text("completed_at"),
});

export const activities = sqliteTable("activities", {
	id: text("id").primaryKey(),
	contact_id: text("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
	task_id: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
	/** 'email_in' | 'email_out' | 'tier_change' | 'note' | 'task_created' | 'task_done' | custom */
	type: text("type").notNull(),
	summary: text("summary").notNull(),
	ref: text("ref").notNull().default("{}"),
	created_at: text("created_at").notNull(),
});

export const CONTACT_TIERS = ["unknown", "free", "paid"] as const;
export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export const TASK_RESOLUTIONS = ["replied", "released", "fixed", "other"] as const;
export const EMAIL_KINDS = ["personal", "corporate", "automated"] as const;
