// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface SignatureSettings {
	enabled: boolean;
	text: string;
	html?: string;
}

export interface MailboxSettings {
	fromName?: string;
	forwarding?: { enabled: boolean; email: string };
	signature?: SignatureSettings;
	autoReply?: { enabled: boolean; subject: string; message: string };
	agentSystemPrompt?: string;
}

export interface Mailbox {
	id: string;
	email: string;
	name: string;
	settings?: MailboxSettings;
}

export interface Email {
	id: string;
	thread_id?: string | null;
	folder_id?: string | null;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string;
	bcc?: string;
	date: string;
	read: boolean;
	starred: boolean;
	body?: string | null;
	in_reply_to?: string | null;
	email_references?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	attachments?: Attachment[];
	snippet?: string | null;
	// Thread aggregate fields (only present in threaded list view)
	thread_count?: number;
	thread_unread_count?: number;
	participants?: string;
	needs_reply?: boolean;
	has_draft?: boolean;
	// CRM decoration (external party of the thread/email)
	contact_tier?: string;
	contact_id?: string;
	contact_email?: string;
	has_open_task?: boolean;
}

export type ContactTier = "unknown" | "free" | "paid";
export type TaskStatus = "open" | "done" | "cancelled";
export type TaskResolution = "replied" | "released" | "fixed" | "other";

export interface CrmContact {
	id: string;
	email: string;
	name: string | null;
	tier: string;
	email_kind: string;
	source: string;
	tags: string[] | string;
	notes: string | null;
	metadata: Record<string, unknown> | string;
	first_seen_at: string;
	last_contact_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CrmContactSummary {
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

export interface CrmTask {
	id: string;
	contact_id: string | null;
	title: string;
	description: string | null;
	status: string;
	priority: string;
	due_at: string | null;
	source_mailbox_id: string | null;
	source_email_id: string | null;
	source_thread_id: string | null;
	resolution_type: string | null;
	resolution_note: string | null;
	resolution_ref: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	contact_email?: string | null;
	contact_name?: string | null;
	contact_tier?: string | null;
}

export interface CrmActivity {
	id: string;
	contact_id: string | null;
	task_id: string | null;
	type: string;
	summary: string;
	ref: string;
	created_at: string;
}

export interface Attachment {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string;
	disposition?: string;
}

export interface Folder {
	id: string;
	name: string;
	unreadCount: number;
}
