// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import {
	crmBulkUpsertContacts,
	crmImportFromMailboxes,
	crmCreateTask,
	crmDeleteTask,
	crmGetContact,
	crmGetContactByEmail,
	crmGetTask,
	crmListContacts,
	crmListTasks,
	crmLogActivity,
	crmLookupContacts,
	crmUpdateContact,
	crmUpdateTask,
	crmUpsertContact,
	RESOLUTION_VALUES,
	STATUS_VALUES,
	TIER_VALUES,
} from "../lib/crm-tools";

const TierSchema = z.enum(TIER_VALUES);
const StatusSchema = z.enum(STATUS_VALUES);
const ResolutionSchema = z.enum(RESOLUTION_VALUES);

const ContactPatchSchema = z.object({
	name: z.string().nullable().optional(),
	tier: TierSchema.optional(),
	notes: z.string().nullable().optional(),
	tags: z.array(z.string()).optional(),
	metadata: z.record(z.unknown()).optional(),
});

const ContactUpsertSchema = ContactPatchSchema.extend({ email: z.string().email() });

const TaskCreateSchema = z.object({
	title: z.string().optional(),
	description: z.string().nullable().optional(),
	priority: z.enum(["normal", "high"]).optional(),
	due_at: z.string().nullable().optional(),
	contact_email: z.string().email().nullable().optional(),
	contact_name: z.string().nullable().optional(),
	mailboxId: z.string().nullable().optional(),
	emailId: z.string().nullable().optional(),
	source_thread_id: z.string().nullable().optional(),
});

const TaskPatchSchema = z.object({
	title: z.string().optional(),
	description: z.string().nullable().optional(),
	status: StatusSchema.optional(),
	priority: z.enum(["normal", "high"]).optional(),
	due_at: z.string().nullable().optional(),
	resolution_type: ResolutionSchema.nullable().optional(),
	resolution_note: z.string().nullable().optional(),
	resolution_ref: z.string().nullable().optional(),
});

const ActivitySchema = z.object({
	contact_email: z.string().email().nullable().optional(),
	contact_id: z.string().nullable().optional(),
	task_id: z.string().nullable().optional(),
	type: z.string().min(1),
	summary: z.string().min(1),
	ref: z.record(z.unknown()).optional(),
});

const int = (v: string | undefined, d: number) => {
	const n = Number.parseInt(v ?? "", 10);
	return Number.isFinite(n) ? n : d;
};

export const crmRoutes = new Hono<{ Bindings: Env }>();

// ── Contacts ───────────────────────────────────────────────────────

crmRoutes.get("/contacts", async (c) => {
	const q = c.req.query();
	const result = await crmListContacts(c.env, {
		tier: q.tier || undefined,
		kind: q.kind || undefined,
		q: q.q || undefined,
		page: int(q.page, 1),
		limit: int(q.limit, 50),
	});
	return c.json(result);
});

crmRoutes.get("/contacts/lookup", async (c) => {
	const emails = (c.req.query("emails") || "").split(",").map((e) => e.trim()).filter(Boolean);
	return c.json(await crmLookupContacts(c.env, emails));
});

crmRoutes.post("/contacts/bulk", async (c) => {
	const body = z.object({ contacts: z.array(ContactUpsertSchema).min(1).max(500) }).parse(await c.req.json());
	return c.json(await crmBulkUpsertContacts(c.env, body.contacts));
});

crmRoutes.post("/import", async (c) => {
	const body = z.object({ includeCorporate: z.boolean().optional(), mailboxId: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
	return c.json(await crmImportFromMailboxes(c.env, body));
});

crmRoutes.get("/contacts/by-email/:email", async (c) => {
	const contact = await crmGetContactByEmail(c.env, decodeURIComponent(c.req.param("email")!));
	if (!contact) return c.json({ error: "Not found" }, 404);
	return c.json(contact);
});

crmRoutes.post("/contacts", async (c) => {
	const body = ContactUpsertSchema.parse(await c.req.json());
	return c.json(await crmUpsertContact(c.env, body), 201);
});

crmRoutes.get("/contacts/:id", async (c) => {
	const res = await crmGetContact(c.env, c.req.param("id")!);
	if (!res) return c.json({ error: "Not found" }, 404);
	return c.json(res);
});

crmRoutes.patch("/contacts/:id", async (c) => {
	const body = ContactPatchSchema.parse(await c.req.json());
	const contact = await crmUpdateContact(c.env, c.req.param("id")!, body);
	if (!contact) return c.json({ error: "Not found" }, 404);
	return c.json(contact);
});

// ── Tasks ──────────────────────────────────────────────────────────

crmRoutes.get("/tasks", async (c) => {
	const q = c.req.query();
	const result = await crmListTasks(c.env, {
		status: q.status || undefined,
		contact_id: q.contact_id || undefined,
		mailbox_id: q.mailbox_id || undefined,
		thread_id: q.thread_id || undefined,
		page: int(q.page, 1),
		limit: int(q.limit, 50),
	});
	return c.json(result);
});

crmRoutes.post("/tasks", async (c) => {
	const body = TaskCreateSchema.parse(await c.req.json());
	try {
		return c.json(await crmCreateTask(c.env, body), 201);
	} catch (e) {
		return c.json({ error: (e as Error).message }, 400);
	}
});

crmRoutes.get("/tasks/:id", async (c) => {
	const task = await crmGetTask(c.env, c.req.param("id")!);
	if (!task) return c.json({ error: "Not found" }, 404);
	return c.json(task);
});

crmRoutes.patch("/tasks/:id", async (c) => {
	const body = TaskPatchSchema.parse(await c.req.json());
	const task = await crmUpdateTask(c.env, c.req.param("id")!, body);
	if (!task) return c.json({ error: "Not found" }, 404);
	return c.json(task);
});

crmRoutes.delete("/tasks/:id", async (c) => {
	const ok = await crmDeleteTask(c.env, c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

// ── Activities ─────────────────────────────────────────────────────

crmRoutes.post("/activities", async (c) => {
	const body = ActivitySchema.parse(await c.req.json());
	return c.json(await crmLogActivity(c.env, body), 201);
});
