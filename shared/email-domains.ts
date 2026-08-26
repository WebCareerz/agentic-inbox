// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Classify an email address as personal (public webmail), corporate
 * (custom / company domain) or automated (no-reply style sender).
 *
 * Domain list vendored from https://github.com/Kikobeats/free-email-domains
 * (shared/free-email-domains.json). Heuristic only — a person on their own
 * domain reads as "corporate"; that's acceptable because manual actions
 * (set tier / create task) still create the contact.
 */
import freeDomains from "./free-email-domains.json";

export type EmailKind = "personal" | "corporate" | "automated";

const FREE_DOMAINS = new Set<string>(freeDomains as string[]);

/** Local-part prefixes that indicate an automated / bulk sender. */
const AUTOMATED_LOCAL_PARTS = [
	"noreply",
	"no-reply",
	"no_reply",
	"donotreply",
	"do-not-reply",
	"mailer-daemon",
	"postmaster",
	"bounce",
	"bounces",
	"notification",
	"notifications",
	"newsletter",
	"alerts",
	"alert",
	"system",
	"robot",
	"bot",
];

export function classifyEmail(address: string): EmailKind {
	const email = address.trim().toLowerCase();
	const at = email.lastIndexOf("@");
	if (at <= 0) return "corporate";
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);

	const localBase = local.split("+")[0];
	if (AUTOMATED_LOCAL_PARTS.some((p) => localBase === p || localBase.startsWith(`${p}-`) || localBase.startsWith(`${p}.`) || localBase.startsWith(`${p}_`))) {
		return "automated";
	}

	if (FREE_DOMAINS.has(domain)) return "personal";
	// Handle regional subdomains like yahoo.co.uk already in list; strip one
	// label and retry for things like "mail.example-webmail.com".
	const dot = domain.indexOf(".");
	if (dot > 0 && FREE_DOMAINS.has(domain.slice(dot + 1))) return "personal";
	return "corporate";
}

/** Whether a sender should get an automatic CRM contact record. */
export function shouldAutoCreateContact(address: string): boolean {
	return classifyEmail(address) === "personal";
}
