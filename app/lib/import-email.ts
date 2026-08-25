// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { escapeHtml } from "~/lib/utils";

export interface ImportedEmail {
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	/** HTML body ready for the rich text editor. */
	body: string;
}

function toAddressList(value: unknown): string {
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(", ");
	if (typeof value === "string") return value.trim();
	return "";
}

/** Convert plain text (with \n line breaks) to simple HTML paragraphs, auto-linking URLs. */
export function plainTextToHtml(text: string): string {
	const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
	return paragraphs
		.map((para) => {
			const lines = para.split("\n").map((line) =>
				escapeHtml(line).replace(
					/https?:\/\/[^\s<]+/g,
					(url) => `<a href="${url}">${url}</a>`,
				),
			);
			return `<p>${lines.join("<br>") || "<br>"}</p>`;
		})
		.join("");
}

/**
 * Parse a pasted JSON object like { to, subject, body, cc?, bcc? } into compose fields.
 * Accepts a single object, or an array (the first element is used).
 * Throws with a user-facing message on invalid input.
 */
export function parseImportedEmail(raw: string): ImportedEmail {
	let data: unknown;
	try {
		data = JSON.parse(raw.trim());
	} catch {
		throw new Error("Invalid JSON. Paste a single object like { \"to\": ..., \"subject\": ..., \"body\": ... }.");
	}
	if (Array.isArray(data)) data = data[0];
	if (!data || typeof data !== "object") throw new Error("JSON must be an object with to / subject / body fields.");

	return importOne(data as Record<string, unknown>);
}

export interface ImportedEmailBatch {
	emails: ImportedEmail[];
	/** Per-item errors, keyed by array index (0-based) or the item's `id` if present. */
	errors: { index: number; id?: string; message: string }[];
}

function importOne(obj: Record<string, unknown>): ImportedEmail {
	const to = toAddressList(obj.to);
	const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
	const bodyRaw = typeof obj.body === "string" ? obj.body : "";
	if (!to && !subject && !bodyRaw) throw new Error("No to / subject / body fields found.");
	const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(bodyRaw);
	return {
		to,
		cc: toAddressList(obj.cc),
		bcc: toAddressList(obj.bcc),
		subject,
		body: looksLikeHtml ? bodyRaw : plainTextToHtml(bodyRaw),
	};
}

/**
 * Parse a JSON file containing an array of { to, subject, body, ... } objects
 * (a single object is also accepted). Invalid items are reported in `errors`
 * instead of aborting the whole batch.
 */
export function parseImportedEmails(raw: string): ImportedEmailBatch {
	let data: unknown;
	try {
		data = JSON.parse(raw.trim());
	} catch {
		throw new Error("Invalid JSON file.");
	}
	const items = Array.isArray(data) ? data : [data];
	if (items.length === 0) throw new Error("The JSON array is empty.");

	const batch: ImportedEmailBatch = { emails: [], errors: [] };
	items.forEach((item, index) => {
		const id = item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string"
			? ((item as Record<string, unknown>).id as string)
			: undefined;
		try {
			if (!item || typeof item !== "object") throw new Error("Item is not an object.");
			batch.emails.push(importOne(item as Record<string, unknown>));
		} catch (err: unknown) {
			batch.errors.push({ index, id, message: err instanceof Error ? err.message : "Invalid item." });
		}
	});
	return batch;
}
