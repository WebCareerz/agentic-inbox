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
	"created date": "checkout_at",
	"created_at": "checkout_at",
	"created": "checkout_at",
	"date": "checkout_at",
	"paid at": "paid_at",
	"paid_at": "paid_at",
	"paid date": "paid_at",
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

// ── Payments export ────────────────────────────────────────────────

export type CsvKind = "payments" | "customers";

/** Payments exports carry a status + amount column alongside the customer email. */
export function detectCsvKind(text: string): CsvKind {
	const header = (parseCsv(text)[0] ?? []).map((h) => h.trim().toLowerCase());
	const has = (k: string) => header.some((h) => h === k || h.includes(k));
	return has("status") && (has("amount") || has("transaction")) ? "payments" : "customers";
}

export interface PaymentRow {
	email: string;
	status: string;
	date: string;
	amount: number | null;
	product?: string;
	method?: string;
	transactionId?: string;
	customerId?: string;
}

function findCol(lower: string[], candidates: string[]): number {
	for (const c of candidates) { const i = lower.indexOf(c); if (i >= 0) return i; }
	for (const c of candidates) { const i = lower.findIndex((h) => h.includes(c)); if (i >= 0) return i; }
	return -1;
}

/** Parse a payments export into one contact per email (latest paid payment wins, totals aggregated). */
export function paymentsCsvToContacts(text: string): { contacts: CsvContactRow[]; payments: number; unpaidRows: number; columns: string[] } {
	const rows = parseCsv(text);
	if (rows.length === 0) return { contacts: [], payments: 0, unpaidRows: 0, columns: [] };
	const header = rows[0].map((h) => h.trim());
	const lower = header.map((h) => h.toLowerCase());
	const col = {
		email: findCol(lower, ["customer email", "email", "customer_email"]),
		status: findCol(lower, ["status"]),
		date: findCol(lower, ["date", "created date", "paid at", "created_at"]),
		amount: findCol(lower, ["amount paid", "amount", "total"]),
		product: findCol(lower, ["product name", "product"]),
		method: findCol(lower, ["payment method", "method"]),
		txn: findCol(lower, ["transaction id", "transaction", "payment id"]),
		customer: findCol(lower, ["customer id", "customer_id"]),
	};
	if (col.email < 0) throw new Error(`No customer email column found. Headers: ${header.join(", ")}`);

	const byEmail = new Map<string, { latest: PaymentRow; count: number; total: number }>();
	let payments = 0;
	let unpaidRows = 0;
	for (const cells of rows.slice(1)) {
		const email = (cells[col.email] || "").trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
		const status = col.status >= 0 ? (cells[col.status] || "").trim().toLowerCase() : "paid";
		if (status !== "paid" && status !== "succeeded" && status !== "completed") { unpaidRows++; continue; }
		payments++;
		const rawAmount = col.amount >= 0 ? Number.parseFloat((cells[col.amount] || "").replace(/[^0-9.]/g, "")) : NaN;
		// Creem exports amounts in minor units (299 = $2.99); values with a decimal point are already major units.
		const amount = Number.isFinite(rawAmount) ? (/\./.test(cells[col.amount] || "") ? rawAmount : rawAmount / 100) : null;
		const row: PaymentRow = {
			email,
			status,
			date: col.date >= 0 ? (cells[col.date] || "").trim() : "",
			amount,
			product: col.product >= 0 ? (cells[col.product] || "").trim() || undefined : undefined,
			method: col.method >= 0 ? (cells[col.method] || "").trim() || undefined : undefined,
			transactionId: col.txn >= 0 ? (cells[col.txn] || "").trim() || undefined : undefined,
			customerId: col.customer >= 0 ? (cells[col.customer] || "").trim() || undefined : undefined,
		};
		const agg = byEmail.get(email);
		if (!agg) byEmail.set(email, { latest: row, count: 1, total: amount ?? 0 });
		else {
			agg.count++;
			agg.total += amount ?? 0;
			if (row.date > agg.latest.date) agg.latest = row;
		}
	}

	const contacts: CsvContactRow[] = [];
	for (const [email, { latest, count, total }] of byEmail) {
		const metadata: Record<string, string> = {};
		if (latest.date) metadata.paid_at = latest.date;
		if (latest.product) metadata.product = latest.product;
		if (latest.method) metadata.payment_method = latest.method;
		if (latest.amount != null) metadata.amount_paid = latest.amount.toFixed(2);
		if (latest.transactionId) metadata.transaction_id = latest.transactionId;
		if (latest.customerId) metadata.customer_id = latest.customerId;
		if (count > 1) { metadata.payments_count = String(count); metadata.total_paid = total.toFixed(2); }
		contacts.push({ email, metadata });
	}
	return { contacts, payments, unpaidRows, columns: header };
}
