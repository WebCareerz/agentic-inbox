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

	const obj = data as Record<string, unknown>;
	const to = toAddressList(obj.to);
	const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
	const bodyRaw = typeof obj.body === "string" ? obj.body : "";
	if (!to && !subject && !bodyRaw) throw new Error("No to / subject / body fields found in the JSON.");

	const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(bodyRaw);
	return {
		to,
		cc: toAddressList(obj.cc),
		bcc: toAddressList(obj.bcc),
		subject,
		body: looksLikeHtml ? bodyRaw : plainTextToHtml(bodyRaw),
	};
}
