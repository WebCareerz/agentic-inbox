// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	const src = text.replace(/^﻿/, "");
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') { field += '"'; i++; }
				else inQuotes = false;
			} else field += ch;
			continue;
		}
		if (ch === '"') inQuotes = true;
		else if (ch === ",") { row.push(field); field = ""; }
		else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && src[i + 1] === "\n") i++;
			row.push(field); field = "";
			if (row.some((c) => c.trim() !== "")) rows.push(row);
			row = [];
		} else field += ch;
	}
	row.push(field);
	if (row.some((c) => c.trim() !== "")) rows.push(row);
	return rows;
}

export interface CsvContactRow {
	email: string;
	name?: string;
	metadata: Record<string, string>;
}

const EMAIL_KEYS = ["email", "e-mail", "customer email", "email address"];
const NAME_KEYS = ["name", "customer name", "full name"];
/** Well-known columns mapped to stable metadata keys. Everything else keeps its header (snake_cased). */
const METADATA_KEYS: Record<string, string> = {
	"country": "country",
	"customer id": "customer_id",
	"customer_id": "customer_id",
	"created date": "paid_at",
	"created_at": "paid_at",
	"created": "paid_at",
	"date": "paid_at",
	"paid at": "paid_at",
	"paid_at": "paid_at",
};

/**
 * Turn a CSV with a header row into contact rows. Requires an email column;
 * other columns become metadata. Rows without a valid email are dropped.
 */
export function csvToContacts(text: string): { contacts: CsvContactRow[]; skipped: number; columns: string[] } {
	const rows = parseCsv(text);
	if (rows.length === 0) return { contacts: [], skipped: 0, columns: [] };
	const header = rows[0].map((h) => h.trim());
	const lower = header.map((h) => h.toLowerCase());
	const emailIdx = lower.findIndex((h) => EMAIL_KEYS.includes(h));
	if (emailIdx < 0) throw new Error(`No email column found. Headers: ${header.join(", ")}`);
	const nameIdx = lower.findIndex((h) => NAME_KEYS.includes(h));

	const contacts: CsvContactRow[] = [];
	const seen = new Set<string>();
	let skipped = 0;
	for (const cells of rows.slice(1)) {
		const email = (cells[emailIdx] || "").trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) { skipped++; continue; }
		seen.add(email);
		const metadata: Record<string, string> = {};
		header.forEach((h, i) => {
			if (i === emailIdx || i === nameIdx) return;
			const value = (cells[i] || "").trim();
			if (!value) return;
			const key = METADATA_KEYS[lower[i]] ?? lower[i].replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
			if (key) metadata[key] = value;
		});
		const name = nameIdx >= 0 ? (cells[nameIdx] || "").trim() : "";
		contacts.push(name ? { email, name, metadata } : { email, metadata });
	}
	return { contacts, skipped, columns: header };
}
