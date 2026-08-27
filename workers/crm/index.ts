// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * CrmDO — single global Durable Object holding customer records, tasks and
 * the activity log. Email data stays in the per-mailbox MailboxDO; the two
 * are linked by email address + email/thread IDs.
 */
import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as schema from "../db/crm-schema";
import type { Env } from "../types";
import { applyMigrations } from "../durableObject/migrations";
import { crmMigrations } from "./migrations";
import { classifyEmail, shouldAutoCreateContact } from "../../shared/email-domains";

export type Contact = typeof schema.contacts.$inferSelect;
export type Task = typeof schema.tasks.$inferSelect;
export type Activity = typeof schema.activities.$inferSelect;

export interface ContactSummary {
	id: string;
	email: string;
	name: string | null;
	tier: string;
	email_kind: string;
	last_contact_at?: string | null;
	country?: string | null;
	paid_at?: string | null;
	open_task_count: number;
}

export interface TaskWithContact extends Task {
	contact_email: string | null;
	contact_name: string | null;
	contact_tier: string | null;
}

export interface RecordEmailInput {
	direction: "in" | "out";
	/** The external party's address (sender for inbound, recipient for outbound). */
	email: string;
	name?: string | null;
	mailboxId: string;
	emailId: string;
	threadId?: string | null;
	subject?: string | null;
	/** Timestamp of the email (defaults to now). Used for backfills. */
	at?: string | null;
	/** Create the contact even for corporate addresses (never for automated ones). */
	force?: boolean;
}

export interface ListContactsOptions {
	tier?: string;
	kind?: string;
	q?: string;
	page?: number;
	limit?: number;
}

export interface ListTasksOptions {
	status?: string;
	contact_id?: string;
	mailbox_id?: string;
	thread_id?: string;
	page?: number;
	limit?: number;
}

export interface UpsertContactInput {
	email: string;
	name?: string | null;
	tier?: string;
	notes?: string | null;
	tags?: string[];
	metadata?: Record<string, unknown>;
}

export interface CreateTaskInput {
	title: string;
	description?: string | null;
	priority?: string;
	due_at?: string | null;
	contact_email?: string | null;
	contact_name?: string | null;
	source_mailbox_id?: string | null;
	source_email_id?: string | null;
	source_thread_id?: string | null;
}

export interface UpdateTaskInput {
	title?: string;
	description?: string | null;
	status?: string;
	priority?: string;
	due_at?: string | null;
	resolution_type?: string | null;
	resolution_note?: string | null;
	resolution_ref?: string | null;
}

const now = () => new Date().toISOString();
const normalizeEmail = (e: string) => e.trim().toLowerCase();

export class CrmDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;
	db: ReturnType<typeof drizzle>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.db = drizzle(this.ctx.storage, { schema });
		applyMigrations(this.ctx.storage.sql, crmMigrations, this.ctx.storage);
	}

	// ── Contacts ───────────────────────────────────────────────────

	async getContactByEmail(emailRaw: string): Promise<Contact | null> {
		const email = normalizeEmail(emailRaw);
		return this.db.select().from(schema.contacts).where(eq(schema.contacts.email, email)).get() ?? null;
	}

	async getContact(id: string): Promise<{ contact: Contact; tasks: Task[]; activities: Activity[] } | null> {
		const contact = this.db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).get();
		if (!contact) return null;
		const tasks = this.db.select().from(schema.tasks).where(eq(schema.tasks.contact_id, id)).orderBy(desc(schema.tasks.created_at)).all();
		const activities = this.db.select().from(schema.activities).where(eq(schema.activities.contact_id, id)).orderBy(desc(schema.activities.created_at)).limit(100).all();
		return { contact, tasks, activities };
	}

	/** Batch lookup for inbox decoration: email → { id, tier, email_kind }. */
	async getContactsByEmails(emails: string[]): Promise<Record<string, { id: string; tier: string; email_kind: string; name: string | null }>> {
		const list = [...new Set(emails.map(normalizeEmail).filter(Boolean))].slice(0, 500);
		if (list.length === 0) return {};
		const rows = this.db
			.select({ id: schema.contacts.id, email: schema.contacts.email, tier: schema.contacts.tier, email_kind: schema.contacts.email_kind, name: schema.contacts.name })
			.from(schema.contacts)
			.where(inArray(schema.contacts.email, list))
			.all();
		const out: Record<string, { id: string; tier: string; email_kind: string; name: string | null }> = {};
		for (const r of rows) out[r.email] = { id: r.id, tier: r.tier, email_kind: r.email_kind, name: r.name };
		return out;
	}

	async listContacts(options: ListContactsOptions = {}): Promise<{ contacts: ContactSummary[]; total: number }> {
		const { tier, kind, q } = options;
		const page = Math.max(options.page ?? 1, 1);
		const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
		const conditions: SQL[] = [];
		if (tier) conditions.push(eq(schema.contacts.tier, tier));
		if (kind) conditions.push(eq(schema.contacts.email_kind, kind));
		if (q) {
			const pattern = `%${q.trim().toLowerCase()}%`;
			conditions.push(or(like(schema.contacts.email, pattern), like(sql`LOWER(${schema.contacts.name})`, pattern))!);
		}
		const where = conditions.length ? and(...conditions) : undefined;

		const openCount = sql<number>`(SELECT COUNT(*) FROM tasks t WHERE t.contact_id = ${schema.contacts.id} AND t.status = 'open')`;
		const rows = this.db
			.select({
				id: schema.contacts.id,
				email: schema.contacts.email,
				name: schema.contacts.name,
				tier: schema.contacts.tier,
				email_kind: schema.contacts.email_kind,
				last_contact_at: schema.contacts.last_contact_at,
				country: sql<string | null>`json_extract(${schema.contacts.metadata}, '$.country')`,
				paid_at: sql<string | null>`json_extract(${schema.contacts.metadata}, '$.paid_at')`,
				open_task_count: openCount,
			})
			.from(schema.contacts)
			.where(where)
			.orderBy(desc(schema.contacts.last_contact_at))
			.limit(limit)
			.offset((page - 1) * limit)
			.all();
		const totalRow = this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.contacts).where(where).get();
		return { contacts: rows.map((r) => ({ ...r, open_task_count: Number(r.open_task_count) })), total: Number(totalRow?.c ?? 0) };
	}

	/** Create-or-update a contact from an explicit (manual) action. */
	async upsertContact(input: UpsertContactInput): Promise<Contact> {
		const email = normalizeEmail(input.email);
		if (!email.includes("@")) throw new Error("Invalid email address");
		const ts = now();
		const existing = await this.getContactByEmail(email);
		if (existing) {
			const patch: Partial<Contact> = { updated_at: ts, source: "manual" };
			if (input.name !== undefined) patch.name = input.name;
			if (input.tier !== undefined) patch.tier = input.tier;
			if (input.notes !== undefined) patch.notes = input.notes;
			if (input.tags !== undefined) patch.tags = JSON.stringify(input.tags);
			if (input.metadata !== undefined) patch.metadata = JSON.stringify({ ...safeJson(existing.metadata), ...input.metadata });
			this.db.update(schema.contacts).set(patch).where(eq(schema.contacts.id, existing.id)).run();
			if (input.tier !== undefined && input.tier !== existing.tier) {
				this.insertActivity({ contact_id: existing.id, type: "tier_change", summary: `Tier changed: ${existing.tier} → ${input.tier}`, ref: { from: existing.tier, to: input.tier } });
			}
			return (await this.getContactByEmail(email))!;
		}
		const contact: Contact = {
			id: crypto.randomUUID(),
			email,
			name: input.name ?? null,
			tier: input.tier ?? "unknown",
			email_kind: classifyEmail(email),
			source: "manual",
			tags: JSON.stringify(input.tags ?? []),
			notes: input.notes ?? null,
			metadata: JSON.stringify(input.metadata ?? {}),
			first_seen_at: ts,
			last_contact_at: null,
			created_at: ts,
			updated_at: ts,
		};
		this.db.insert(schema.contacts).values(contact).run();
		if (contact.tier !== "unknown") {
			this.insertActivity({ contact_id: contact.id, type: "tier_change", summary: `Tier set: ${contact.tier}`, ref: { from: null, to: contact.tier } });
		}
		return contact;
	}

	async updateContact(id: string, patch: Omit<UpsertContactInput, "email">): Promise<Contact | null> {
		const existing = this.db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).get();
		if (!existing) return null;
		return this.upsertContact({ email: existing.email, ...patch });
	}

	/**
	 * Called on every inbound/outbound email. Auto-creates a contact only for
	 * personal addresses; otherwise just updates last_contact_at if the
	 * contact already exists. Always logs an activity when a contact exists.
	 */
	async recordEmail(input: RecordEmailInput): Promise<{ contactId: string | null; created: boolean; skipped: boolean }> {
		const email = normalizeEmail(input.email);
		if (!email.includes("@")) return { contactId: null, created: false, skipped: true };
		const ts = now();
		const at = input.at && !Number.isNaN(Date.parse(input.at)) ? new Date(input.at).toISOString() : ts;
		let contact = await this.getContactByEmail(email);
		let created = false;
		if (!contact) {
			const kind = classifyEmail(email);
			const allowed = input.force ? kind !== "automated" : shouldAutoCreateContact(email);
			if (!allowed) return { contactId: null, created: false, skipped: true };
			contact = {
				id: crypto.randomUUID(),
				email,
				name: input.name?.trim() || null,
				tier: "unknown",
				email_kind: kind,
				source: "auto",
				tags: "[]",
				notes: null,
				metadata: "{}",
				first_seen_at: at,
				last_contact_at: at,
				created_at: ts,
				updated_at: ts,
			};
			this.db.insert(schema.contacts).values(contact).run();
			created = true;
		} else {
			const patch: Partial<Contact> = { updated_at: ts };
			if (!contact.last_contact_at || contact.last_contact_at < at) patch.last_contact_at = at;
			if (contact.first_seen_at > at) patch.first_seen_at = at;
			if (!contact.name && input.name?.trim()) patch.name = input.name.trim();
			this.db.update(schema.contacts).set(patch).where(eq(schema.contacts.id, contact.id)).run();
		}
		// Idempotent: one activity per email (backfills may be re-run).
		const dup = [...this.ctx.storage.sql.exec(
			`SELECT 1 FROM activities WHERE contact_id = ?1 AND type IN ('email_in','email_out') AND ref LIKE ?2 LIMIT 1`,
			contact.id,
			`%"emailId":${JSON.stringify(input.emailId)}%`,
		)];
		if (dup.length === 0) {
			this.insertActivity({
				contact_id: contact.id,
				type: input.direction === "in" ? "email_in" : "email_out",
				summary: `${input.direction === "in" ? "Received" : "Sent"}: ${input.subject || "(no subject)"}`,
				ref: { mailboxId: input.mailboxId, emailId: input.emailId, threadId: input.threadId ?? null },
				at,
			});
		}
		return { contactId: contact.id, created, skipped: false };
	}

	/** Manual bulk create/update (e.g. paste a list of paying customers). */
	async bulkUpsertContacts(items: UpsertContactInput[]): Promise<{ created: number; updated: number; failed: { email: string; error: string }[] }> {
		const result = { created: 0, updated: 0, failed: [] as { email: string; error: string }[] };
		for (const item of items) {
			try {
				const existed = !!(await this.getContactByEmail(item.email));
				await this.upsertContact(item);
				if (existed) result.updated++; else result.created++;
			} catch (e) {
				result.failed.push({ email: item.email, error: (e as Error).message });
			}
		}
		return result;
	}

	// ── Tasks ──────────────────────────────────────────────────────

	async listTasks(options: ListTasksOptions = {}): Promise<{ tasks: TaskWithContact[]; total: number }> {
		const page = Math.max(options.page ?? 1, 1);
		const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
		const conditions: SQL[] = [];
		if (options.status) conditions.push(eq(schema.tasks.status, options.status));
		if (options.contact_id) conditions.push(eq(schema.tasks.contact_id, options.contact_id));
		if (options.mailbox_id) conditions.push(eq(schema.tasks.source_mailbox_id, options.mailbox_id));
		if (options.thread_id) conditions.push(eq(schema.tasks.source_thread_id, options.thread_id));
		const where = conditions.length ? and(...conditions) : undefined;
		const rows = this.db
			.select({
				task: schema.tasks,
				contact_email: schema.contacts.email,
				contact_name: schema.contacts.name,
				contact_tier: schema.contacts.tier,
			})
			.from(schema.tasks)
			.leftJoin(schema.contacts, eq(schema.tasks.contact_id, schema.contacts.id))
			.where(where)
			.orderBy(desc(schema.tasks.created_at))
			.limit(limit)
			.offset((page - 1) * limit)
			.all();
		const totalRow = this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.tasks).where(where).get();
		return {
			tasks: rows.map((r) => ({ ...r.task, contact_email: r.contact_email ?? null, contact_name: r.contact_name ?? null, contact_tier: r.contact_tier ?? null })),
			total: Number(totalRow?.c ?? 0),
		};
	}

	async getTask(id: string): Promise<TaskWithContact | null> {
		const row = this.db
			.select({ task: schema.tasks, contact_email: schema.contacts.email, contact_name: schema.contacts.name, contact_tier: schema.contacts.tier })
			.from(schema.tasks)
			.leftJoin(schema.contacts, eq(schema.tasks.contact_id, schema.contacts.id))
			.where(eq(schema.tasks.id, id))
			.get();
		if (!row) return null;
		return { ...row.task, contact_email: row.contact_email ?? null, contact_name: row.contact_name ?? null, contact_tier: row.contact_tier ?? null };
	}

	/** Thread IDs (from the given set) that have at least one open task. */
	async getThreadsWithOpenTasks(threadIds: string[]): Promise<string[]> {
		const ids = [...new Set(threadIds.filter(Boolean))].slice(0, 500);
		if (ids.length === 0) return [];
		const rows = this.db
			.selectDistinct({ t: schema.tasks.source_thread_id })
			.from(schema.tasks)
			.where(and(eq(schema.tasks.status, "open"), inArray(schema.tasks.source_thread_id, ids)))
			.all();
		return rows.map((r) => r.t).filter((t): t is string => !!t);
	}

	async createTask(input: CreateTaskInput): Promise<TaskWithContact> {
		const title = input.title.trim();
		if (!title) throw new Error("Task title is required");
		let contactId: string | null = null;
		if (input.contact_email) {
			// Manual action: always creates the contact, regardless of email kind.
			const contact = await this.upsertContact({ email: input.contact_email, name: input.contact_name ?? undefined });
			contactId = contact.id;
		}
		const ts = now();
		const task: Task = {
			id: crypto.randomUUID(),
			contact_id: contactId,
			title,
			description: input.description ?? null,
			status: "open",
			priority: input.priority ?? "normal",
			due_at: input.due_at ?? null,
			source_mailbox_id: input.source_mailbox_id ?? null,
			source_email_id: input.source_email_id ?? null,
			source_thread_id: input.source_thread_id ?? null,
			resolution_type: null,
			resolution_note: null,
			resolution_ref: null,
			created_at: ts,
			updated_at: ts,
			completed_at: null,
		};
		this.db.insert(schema.tasks).values(task).run();
		this.insertActivity({ contact_id: contactId, task_id: task.id, type: "task_created", summary: `Task created: ${title}`, ref: { mailboxId: task.source_mailbox_id, emailId: task.source_email_id, threadId: task.source_thread_id } });
		return (await this.getTask(task.id))!;
	}

	async updateTask(id: string, patch: UpdateTaskInput): Promise<TaskWithContact | null> {
		const existing = this.db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
		if (!existing) return null;
		const ts = now();
		const data: Partial<Task> = { updated_at: ts };
		if (patch.title !== undefined) data.title = patch.title.trim() || existing.title;
		if (patch.description !== undefined) data.description = patch.description;
		if (patch.priority !== undefined) data.priority = patch.priority;
		if (patch.due_at !== undefined) data.due_at = patch.due_at;
		if (patch.resolution_type !== undefined) data.resolution_type = patch.resolution_type;
		if (patch.resolution_note !== undefined) data.resolution_note = patch.resolution_note;
		if (patch.resolution_ref !== undefined) data.resolution_ref = patch.resolution_ref;
		if (patch.status !== undefined && patch.status !== existing.status) {
			data.status = patch.status;
			data.completed_at = patch.status === "done" ? ts : null;
			if (patch.status === "open") {
				data.resolution_type = null;
				data.resolution_note = null;
				data.resolution_ref = null;
			}
		}
		this.db.update(schema.tasks).set(data).where(eq(schema.tasks.id, id)).run();
		if (data.status === "done") {
			const how = data.resolution_type ?? existing.resolution_type ?? "other";
			const note = data.resolution_note ?? existing.resolution_note;
			this.insertActivity({ contact_id: existing.contact_id, task_id: id, type: "task_done", summary: `Task done (${how})${note ? `: ${note}` : ""}: ${existing.title}`, ref: { resolution_type: how, resolution_ref: data.resolution_ref ?? existing.resolution_ref ?? null } });
		} else if (data.status === "cancelled") {
			this.insertActivity({ contact_id: existing.contact_id, task_id: id, type: "task_cancelled", summary: `Task cancelled: ${existing.title}`, ref: {} });
		}
		return this.getTask(id);
	}

	async deleteTask(id: string): Promise<boolean> {
		const existing = this.db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.id, id)).get();
		if (!existing) return false;
		this.db.delete(schema.tasks).where(eq(schema.tasks.id, id)).run();
		return true;
	}

	// ── Activities ─────────────────────────────────────────────────

	async logActivity(input: { contact_email?: string | null; contact_id?: string | null; task_id?: string | null; type: string; summary: string; ref?: Record<string, unknown> }): Promise<Activity> {
		let contactId = input.contact_id ?? null;
		if (!contactId && input.contact_email) {
			const c = await this.upsertContact({ email: input.contact_email });
			contactId = c.id;
		}
		return this.insertActivity({ contact_id: contactId, task_id: input.task_id ?? null, type: input.type, summary: input.summary, ref: input.ref ?? {} });
	}

	private insertActivity(input: { contact_id: string | null; task_id?: string | null; type: string; summary: string; ref: Record<string, unknown>; at?: string }): Activity {
		const activity: Activity = {
			id: crypto.randomUUID(),
			contact_id: input.contact_id,
			task_id: input.task_id ?? null,
			type: input.type,
			summary: input.summary.slice(0, 500),
			ref: JSON.stringify(input.ref ?? {}),
			created_at: input.at ?? now(),
		};
		this.db.insert(schema.activities).values(activity).run();
		return activity;
	}
}

function safeJson(text: string | null | undefined): Record<string, unknown> {
	if (!text) return {};
	try {
		const v = JSON.parse(text);
		return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}
