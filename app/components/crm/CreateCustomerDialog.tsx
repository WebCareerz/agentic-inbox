// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, useKumoToastManager } from "@cloudflare/kumo";
import { CrownSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { extractCustomer } from "~/lib/extract-customer";
import { htmlToPlainText } from "~/lib/utils";
import { useUpsertContact } from "~/queries/crm";
import api from "~/services/api";
import TierBadge from "./TierBadge";

interface CreateCustomerDialogProps {
	open: boolean;
	onClose: () => void;
	/** Email body (HTML or text) to extract from. */
	body: string;
	senderEmail?: string;
	selfEmails?: string[];
	mailboxId?: string;
	emailId?: string;
	threadId?: string | null;
	subject?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ISO timestamp → yyyy-mm-dd in the viewer's local timezone (for <input type="date">). */
function toLocalDateInput(iso: string): string {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * "Create customer from this email": pre-fills email / name / payment facts
 * parsed from the body, lets the user correct them, then upserts the contact
 * (with metadata) and logs a payment / note activity linked to the email.
 */
export default function CreateCustomerDialog({ open, onClose, body, senderEmail, selfEmails, mailboxId, emailId, threadId, subject }: CreateCustomerDialogProps) {
	const toast = useKumoToastManager();
	const upsert = useUpsertContact();
	const extracted = useMemo(() => {
		if (!open) return null;
		const text = /<[a-z][\s\S]*>/i.test(body) ? htmlToPlainText(body) : body;
		return extractCustomer(text, { selfEmails, senderEmail });
	}, [open, body, selfEmails, senderEmail]);

	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [tier, setTier] = useState<"paid" | "free">("paid");
	const [product, setProduct] = useState("");
	const [amount, setAmount] = useState("");
	const [paidAt, setPaidAt] = useState("");
	const [orderNo, setOrderNo] = useState("");
	const [notes, setNotes] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!extracted) return;
		setEmail(extracted.emails[0] ?? "");
		setName(extracted.name ?? "");
		setTier(extracted.looksLikePayment ? "paid" : "free");
		setProduct(extracted.product ?? "");
		setAmount(extracted.amount ?? "");
		setPaidAt(extracted.paidAt ? toLocalDateInput(extracted.paidAt) : "");
		setOrderNo(extracted.orderNo ?? "");
		setNotes("");
		setError(null);
	}, [extracted]);

	const emailValid = EMAIL_RE.test(email.trim());

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!emailValid) { setError("Enter a valid customer email."); return; }
		setError(null);
		const metadata: Record<string, string> = {};
		if (product.trim()) metadata.product = product.trim();
		if (amount.trim()) metadata.amount_paid = amount.trim();
		if (paidAt.trim()) metadata.paid_at = new Date(paidAt.trim()).toISOString();
		if (orderNo.trim()) metadata.order_no = orderNo.trim();
		try {
			const contact = await upsert.mutateAsync({ email: email.trim().toLowerCase(), tier, name: name.trim() || undefined, notes: notes.trim() || undefined, ...(Object.keys(metadata).length ? { metadata } : {}) });
			// Timeline entry pointing back at this email.
			try {
				await api.crmLogActivity({
					contact_id: contact.id,
					type: tier === "paid" ? "payment" : "note",
					summary: tier === "paid"
						? `Payment recorded from email${product.trim() ? `: ${product.trim()}` : ""}${amount.trim() ? ` · $${amount.trim()}` : ""}${orderNo.trim() ? ` · ${orderNo.trim()}` : ""}`
						: `Customer created from email${subject ? `: ${subject}` : ""}`,
					ref: { mailboxId: mailboxId ?? null, emailId: emailId ?? null, threadId: threadId ?? null },
				});
			} catch { /* activity is best-effort */ }
			toast.add({ title: `${email.trim()} saved as ${tier}` });
			onClose();
		} catch (err) {
			setError((err as Error).message || "Failed to save customer.");
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
			<Dialog size="base" className="p-6">
				<Dialog.Title className="text-lg font-semibold mb-1">Create customer from this email</Dialog.Title>
				<p className="text-sm text-kumo-subtle mb-4">
					{extracted?.looksLikePayment ? "This looks like a payment notification — details below were read from the email, please check them." : "Fields below are guesses from the email body — edit anything that's wrong."}
				</p>
				<form onSubmit={submit} className="space-y-4">
					{error && <Banner variant="error" text={error} />}
					<div>
						<Input label="Customer email" type="email" size="sm" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="customer@example.com" />
						{extracted && extracted.emails.length > 1 && (
							<div className="mt-1 flex flex-wrap gap-1">
								{extracted.emails.map((e) => (
									<button key={e} type="button" onClick={() => setEmail(e)} className={`rounded-full border px-2 py-0.5 text-xs ${email === e ? "border-kumo-brand text-kumo-default" : "border-kumo-line text-kumo-subtle hover:text-kumo-default"}`}>{e}</button>
								))}
							</div>
						)}
						{email && !emailValid && <p className="mt-1 text-xs text-kumo-danger">Not a valid email address.</p>}
					</div>
					<Input label="Name" size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
					<div>
						<span className="text-sm font-medium text-kumo-default mb-1.5 block">Tier</span>
						<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
							<button type="button" onClick={() => setTier("paid")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${tier === "paid" ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}><CrownSimpleIcon size={13} weight="fill" />Paid</button>
							<button type="button" onClick={() => setTier("free")} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${tier === "free" ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}><UserIcon size={13} weight="fill" />Free</button>
							<span className="ml-2"><TierBadge tier={tier} /></span>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<Input label="Product" size="sm" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Timeline Visualizer Pro" />
						<Input label="Amount (USD)" size="sm" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2.99" />
						<Input label="Paid on" type="date" size="sm" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
						<Input label="Order no." size="sm" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} placeholder="ORD-…" />
					</div>
					<div>
						<label className="text-sm font-medium text-kumo-default mb-1.5 block">Notes (optional)</label>
						<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link" />
					</div>
					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={upsert.isPending}>Cancel</Button>
						<Button type="submit" variant="primary" size="sm" loading={upsert.isPending} disabled={!emailValid}>Save customer</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
