// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Shared CRM operations used by the HTTP API, the MCP server and the
 * in-app agent. Thin wrappers over the global CrmDO so all three surfaces
 * behave identically.
 */
import type { Env } from "../types";
import type { CrmDO, CreateTaskInput, ListContactsOptions, ListTasksOptions, UpdateTaskInput, UpsertContactInput } from "../crm";
import { CONTACT_TIERS, TASK_RESOLUTIONS, TASK_STATUSES } from "../db/crm-schema";
import { getMailboxStub, listMailboxes } from "./email-helpers";
import { Folders } from "../../shared/folders";

export function getCrmStub(env: Env): DurableObjectStub<CrmDO> {
	return env.CRM.get(env.CRM.idFromName("crm"));
}

export const TIER_VALUES = CONTACT_TIERS;
export const STATUS_VALUES = TASK_STATUSES;
export const RESOLUTION_VALUES = TASK_RESOLUTIONS;

export function assertTier(tier: string): asserts tier is (typeof CONTACT_TIERS)[number] {
	if (!(CONTACT_TIERS as readonly string[]).includes(tier)) throw new Error(`Invalid tier "${tier}". Allowed: ${CONTACT_TIERS.join(", ")}`);
}

// ── Contacts ───────────────────────────────────────────────────────

export async function crmGetContactByEmail(env: Env, email: string) {
	const stub = getCrmStub(env);
	const contact = await stub.getContactByEmail(email);
	if (!contact) return null;
	const { tasks } = await stub.listTasks({ contact_id: contact.id, status: "open", limit: 50 });
	return { ...contact, tags: safeParse(contact.tags, []), metadata: safeParse(contact.metadata, {}), open_tasks: tasks };
}

export async function crmGetContact(env: Env, id: string) {
	const res = await getCrmStub(env).getContact(id);
	if (!res) return null;
	return { ...res, contact: { ...res.contact, tags: safeParse(res.contact.tags, []), metadata: safeParse(res.contact.metadata, {}) } };
}

export async function crmListContacts(env: Env, options: ListContactsOptions) {
	return getCrmStub(env).listContacts(options);
}

export async function crmUpsertContact(env: Env, input: UpsertContactInput) {
	if (input.tier !== undefined) assertTier(input.tier);
	return getCrmStub(env).upsertContact(input);
}

export async function crmUpdateContact(env: Env, id: string, patch: Omit<UpsertContactInput, "email">) {
	if (patch.tier !== undefined) assertTier(patch.tier);
	return getCrmStub(env).updateContact(id, patch);
}

export async function crmLookupContacts(env: Env, emails: string[]) {
	return getCrmStub(env).getContactsByEmails(emails);
}

export async function crmBulkUpsertContacts(env: Env, items: UpsertContactInput[], options: { protectPaid?: boolean } = {}) {
	for (const item of items) if (item.tier !== undefined) assertTier(item.tier);
	return getCrmStub(env).bulkUpsertContacts(items, options);
}

export interface ImportStats {
	mailboxes: number;
	emailsScanned: number;
	contactsCreated: number;
	contactsTouched: number;
	skipped: number;
}

/**
 * Backfill contacts from every mailbox's Inbox and Sent folders. Idempotent:
 * re-running only updates timestamps and never duplicates activities.
 */
export async function crmImportFromMailboxes(env: Env, options: { includeCorporate?: boolean; mailboxId?: string } = {}): Promise<ImportStats> {
	const stats: ImportStats = { mailboxes: 0, emailsScanned: 0, contactsCreated: 0, contactsTouched: 0, skipped: 0 };
	const crm = getCrmStub(env);
	const mailboxes = options.mailboxId ? [{ id: options.mailboxId }] : await listMailboxes(env.BUCKET);
	for (const { id: mailboxId } of mailboxes) {
		stats.mailboxes++;
		const stub = getMailboxStub(env, mailboxId);
		const self = mailboxId.toLowerCase();
		for (const folder of [Folders.INBOX, Folders.SENT, Folders.ARCHIVE]) {
			for (let page = 1; page <= 200; page++) {
				const emails = (await stub.getEmails({ folder, page, limit: 100, sortColumn: "date", sortDirection: "ASC" })) as {
					id: string; sender?: string | null; recipient?: string | null; subject?: string | null; date?: string | null; thread_id?: string | null; raw_headers?: string | null;
				}[];
				if (!emails.length) break;
				for (const email of emails) {
					stats.emailsScanned++;
					const sender = (email.sender || "").toLowerCase();
					const isOut = sender === self;
					const party = isOut ? firstAddress(email.recipient) : sender;
					if (!party || party === self) { stats.skipped++; continue; }
					const res = await crm.recordEmail({
						direction: isOut ? "out" : "in",
						email: party,
						name: isOut ? null : senderNameFromHeaders(email.raw_headers),
						mailboxId,
						emailId: email.id,
						threadId: email.thread_id ?? null,
						subject: email.subject ?? "",
						at: email.date ?? null,
						force: !!options.includeCorporate,
					});
					if (res.skipped) stats.skipped++;
					else { stats.contactsTouched++; if (res.created) stats.contactsCreated++; }
				}
				if (emails.length < 100) break;
			}
		}
	}
	return stats;
}

// ── Tasks ──────────────────────────────────────────────────────────

export async function crmListTasks(env: Env, options: ListTasksOptions) {
	return getCrmStub(env).listTasks(options);
}

export async function crmGetTask(env: Env, id: string) {
	return getCrmStub(env).getTask(id);
}

/**
 * Create a task. When mailboxId + emailId are given, the email is looked up
 * to fill in the contact (the external party), thread and a default title.
 */
export async function crmCreateTask(
	env: Env,
	input: Omit<CreateTaskInput, "title"> & { title?: string; mailboxId?: string | null; emailId?: string | null },
) {
	let title = input.title?.trim() || "";
	let contactEmail = input.contact_email ?? null;
	let contactName = input.contact_name ?? null;
	let threadId = input.source_thread_id ?? null;
	let emailId = input.source_email_id ?? input.emailId ?? null;
	const mailboxId = input.source_mailbox_id ?? input.mailboxId ?? null;

	if (mailboxId && emailId) {
		const email = (await getMailboxStub(env, mailboxId).getEmail(emailId)) as { subject?: string | null; sender?: string | null; recipient?: string | null; thread_id?: string | null; raw_headers?: string | null } | null;
		if (!email) throw new Error("Email not found");
		if (!title) title = email.subject?.trim() || "(no subject)";
		threadId = threadId ?? email.thread_id ?? null;
		if (!contactEmail) {
			const sender = (email.sender || "").toLowerCase();
			const isSelf = sender === mailboxId.toLowerCase();
			contactEmail = isSelf ? firstAddress(email.recipient) : sender;
			if (!isSelf && !contactName) contactName = senderNameFromHeaders(email.raw_headers);
		}
	}
	if (!title) throw new Error("Task title is required");
	return getCrmStub(env).createTask({
		title,
		description: input.description ?? null,
		priority: input.priority,
		due_at: input.due_at ?? null,
		contact_email: contactEmail,
		contact_name: contactName,
		source_mailbox_id: mailboxId,
		source_email_id: emailId,
		source_thread_id: threadId,
	});
}

export async function crmUpdateTask(env: Env, id: string, patch: UpdateTaskInput) {
	if (patch.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(patch.status)) {
		throw new Error(`Invalid status "${patch.status}". Allowed: ${TASK_STATUSES.join(", ")}`);
	}
	if (patch.resolution_type != null && !(TASK_RESOLUTIONS as readonly string[]).includes(patch.resolution_type)) {
		throw new Error(`Invalid resolution_type "${patch.resolution_type}". Allowed: ${TASK_RESOLUTIONS.join(", ")}`);
	}
	return getCrmStub(env).updateTask(id, patch);
}

export async function crmCompleteTask(env: Env, id: string, resolution: { type: string; note?: string | null; ref?: string | null }) {
	return crmUpdateTask(env, id, { status: "done", resolution_type: resolution.type, resolution_note: resolution.note ?? null, resolution_ref: resolution.ref ?? null });
}

export async function crmDeleteTask(env: Env, id: string) {
	return getCrmStub(env).deleteTask(id);
}

export async function crmLogActivity(env: Env, input: { contact_email?: string | null; contact_id?: string | null; task_id?: string | null; type: string; summary: string; ref?: Record<string, unknown> }) {
	return getCrmStub(env).logActivity(input);
}

// ── Inbox decoration ───────────────────────────────────────────────

/**
 * Attach `contact_tier` / `contact_id` (based on the external party) and
 * `has_open_task` to a list of emails or threads. Never throws — CRM
 * decoration must not break mail listing.
 */
export async function decorateWithCrm<T extends { sender?: string | null; recipient?: string | null; participants?: string | null; thread_id?: string | null }>(
	env: Env,
	mailboxId: string,
	rows: T[],
): Promise<(T & { contact_tier?: string; contact_id?: string; contact_email?: string; has_open_task?: boolean })[]> {
	if (rows.length === 0) return rows;
	try {
		const self = mailboxId.toLowerCase();
		const external = rows.map((r) => externalParty(r, self));
		const stub = getCrmStub(env);
		const [contacts, openThreads] = await Promise.all([
			stub.getContactsByEmails(external.filter((e): e is string => !!e)),
			stub.getThreadsWithOpenTasks(rows.map((r) => r.thread_id).filter((t): t is string => !!t)),
		]);
		const openSet = new Set(openThreads);
		return rows.map((r, i) => {
			const email = external[i];
			const c = email ? contacts[email] : undefined;
			return {
				...r,
				...(c && email ? { contact_tier: c.tier, contact_id: c.id, contact_email: email } : {}),
				...(r.thread_id && openSet.has(r.thread_id) ? { has_open_task: true } : {}),
			};
		});
	} catch (e) {
		console.error("CRM decoration failed:", (e as Error).message);
		return rows;
	}
}

/** Pick the non-self address for a row: a participant, the sender, or the first recipient. */
function externalParty(row: { sender?: string | null; recipient?: string | null; participants?: string | null }, self: string): string | null {
	const candidates = [
		...(row.participants || "").split(","),
		row.sender || "",
		...(row.recipient || "").split(","),
	]
		.map((s) => s.trim().toLowerCase())
		.filter((s) => s && s !== self);
	return candidates[0] ?? null;
}

function firstAddress(list: string | null | undefined): string | null {
	const first = (list || "").split(",")[0]?.trim().toLowerCase();
	return first || null;
}

/** Extract the display name from the stored From header, if any. */
function senderNameFromHeaders(rawHeaders: string | null | undefined): string | null {
	if (!rawHeaders) return null;
	try {
		const headers = JSON.parse(rawHeaders) as { key: string; value: string }[];
		const from = headers.find((h) => h.key?.toLowerCase() === "from")?.value || "";
		const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
		return m ? m[1].trim() : null;
	} catch {
		return null;
	}
}

function safeParse<T>(text: string | null | undefined, fallback: T): T {
	if (!text) return fallback;
	try {
		return JSON.parse(text) as T;
	} catch {
		return fallback;
	}
}
