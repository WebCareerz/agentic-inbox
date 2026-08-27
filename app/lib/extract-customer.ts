// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Best-effort extraction of customer / payment facts from an email body
 * (e.g. a Creem "Cha-ching!" sale notification). Everything is a guess the
 * user reviews in a dialog before saving — nothing here is authoritative.
 */

export interface ExtractedCustomer {
	/** Candidate customer addresses found in the body, most likely first. */
	emails: string[];
	name?: string;
	orderNo?: string;
	paidAt?: string; // ISO date if parseable
	paidAtRaw?: string;
	product?: string;
	amount?: string; // "2.99"
	currency?: string;
	looksLikePayment: boolean;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const IGNORED_DOMAINS = ["creem.io", "stripe.com", "paypal.com", "lemonsqueezy.com", "paddle.com"];
const IGNORED_LOCAL = /^(no-?reply|noreply|notifications?|support|billing|info|hello|team|mailer-daemon|postmaster)$/i;

function labelValue(lines: string[], label: RegExp): string | undefined {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const m = line.match(label);
		if (!m) continue;
		// "Label: value" / "Label | value" on one line, or value on the next non-empty line
		const inline = line.slice(m.index! + m[0].length).replace(/^[\s:：|]+/, "").split(" | ")[0].trim();
		if (inline) return inline;
		for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
			const next = lines[j].trim();
			if (next) return next;
		}
	}
	return undefined;
}

export function extractCustomer(plainText: string, options: { selfEmails?: string[]; senderEmail?: string } = {}): ExtractedCustomer {
	const text = plainText.replace(/\r/g, "");
	const lines = text.split("\n").map((l) => l.trim());
	const self = new Set((options.selfEmails ?? []).map((e) => e.toLowerCase()));
	const sender = options.senderEmail?.toLowerCase();

	const found = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
	const emails = found.filter((e) => {
		if (self.has(e) || e === sender) return false;
		const [local, domain] = e.split("@");
		if (IGNORED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return false;
		if (IGNORED_LOCAL.test(local)) return false;
		return true;
	});
	// Prefer an address that appears right after an "Email" label.
	const labelled = labelValue(lines, /^Email\b/i)?.match(EMAIL_RE)?.[0]?.toLowerCase();
	if (labelled && emails.includes(labelled)) { emails.splice(emails.indexOf(labelled), 1); emails.unshift(labelled); }

	const name = labelValue(lines, /^(Customer\s+)?Name\b/i);
	const orderNo = text.match(/\bORD[-_][A-Z0-9]{6,}\b/i)?.[0]
		?? labelValue(lines, /^Order\s*(?:No\.?|Number|ID)\b/i)?.match(/[A-Z0-9][A-Z0-9_-]{5,}/i)?.[0];
	const paidAtRaw = labelValue(lines, /^(Date|Paid\s+on|Purchased\s+on)\b/i);
	const parsedDate = paidAtRaw ? Date.parse(paidAtRaw) : NaN;
	const paidAt = Number.isNaN(parsedDate) ? undefined : new Date(parsedDate).toISOString();

	// First money amount; the product is usually the nearest preceding non-empty line.
	let amount: string | undefined;
	let currency: string | undefined;
	let product: string | undefined;
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/(?:^|\s)(\$|€|£|US\$|USD\s?)\s?(\d+(?:[.,]\d{2})?)\b/);
		if (!m) continue;
		amount = m[2].replace(",", ".");
		currency = m[1].startsWith("$") || m[1].startsWith("US") ? "USD" : m[1] === "€" ? "EUR" : "GBP";
		const inline = lines[i].slice(0, m.index).replace(/\s*\|\s*$/, "").trim();
		const NOISE = /^(subtotal|total|tax|vat|amount|price|units?\s*\d+|qty|quantity|order summary)/i;
		if (inline && !NOISE.test(inline)) product = inline;
		else for (let j = i - 1; j >= Math.max(0, i - 3); j--) { if (lines[j] && !NOISE.test(lines[j])) { product = lines[j]; break; } }
		break;
	}

	const looksLikePayment = !!(orderNo || (amount && /paid|payment|order|transaction|receipt|cha-ching|purchase/i.test(text)));
	return { emails, name: name && name.length <= 80 ? name : undefined, orderNo, paidAt, paidAtRaw, product, amount, currency, looksLikePayment };
}
