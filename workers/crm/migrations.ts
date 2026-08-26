// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Migration } from "../durableObject/migrations";

export const crmMigrations: Migration[] = [
	{
		name: "1_crm_initial",
		sql: `
			CREATE TABLE contacts (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL UNIQUE,
				name TEXT,
				tier TEXT NOT NULL DEFAULT 'unknown',
				email_kind TEXT NOT NULL DEFAULT 'corporate',
				source TEXT NOT NULL DEFAULT 'auto',
				tags TEXT NOT NULL DEFAULT '[]',
				notes TEXT,
				metadata TEXT NOT NULL DEFAULT '{}',
				first_seen_at TEXT NOT NULL,
				last_contact_at TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE INDEX idx_contacts_tier ON contacts(tier);
			CREATE INDEX idx_contacts_last_contact ON contacts(last_contact_at);

			CREATE TABLE tasks (
				id TEXT PRIMARY KEY,
				contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
				title TEXT NOT NULL,
				description TEXT,
				status TEXT NOT NULL DEFAULT 'open',
				priority TEXT NOT NULL DEFAULT 'normal',
				due_at TEXT,
				source_mailbox_id TEXT,
				source_email_id TEXT,
				source_thread_id TEXT,
				resolution_type TEXT,
				resolution_note TEXT,
				resolution_ref TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				completed_at TEXT
			);
			CREATE INDEX idx_tasks_status ON tasks(status);
			CREATE INDEX idx_tasks_contact ON tasks(contact_id);
			CREATE INDEX idx_tasks_thread ON tasks(source_thread_id);

			CREATE TABLE activities (
				id TEXT PRIMARY KEY,
				contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
				task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
				type TEXT NOT NULL,
				summary TEXT NOT NULL,
				ref TEXT NOT NULL DEFAULT '{}',
				created_at TEXT NOT NULL
			);
			CREATE INDEX idx_activities_contact ON activities(contact_id, created_at);
		`,
	},
];
