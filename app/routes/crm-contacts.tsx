// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { CrownSimpleIcon, DownloadSimpleIcon, MagnifyingGlassIcon, PlusIcon, UploadSimpleIcon, UserIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import AddContactDialog from "~/components/crm/AddContactDialog";
import ImportContactsDialog from "~/components/crm/ImportContactsDialog";
import TierBadge from "~/components/crm/TierBadge";
import { useBulkUpsertContacts, useCrmContacts, useImportFromMailboxes } from "~/queries/crm";

const TIER_FILTERS = [
	{ value: "", label: "All classified" },
	{ value: "paid", label: "Paid" },
	{ value: "free", label: "Free" },
	{ value: "unknown", label: "Unclassified" },
];

export default function CrmContacts() {
	const [tier, setTier] = useState("");
	const [q, setQ] = useState("");
	const [addOpen, setAddOpen] = useState(false);
	const [bulkOpen, setBulkOpen] = useState(false);
	const [includeCorporate, setIncludeCorporate] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const bulk = useBulkUpsertContacts();
	const importMailboxes = useImportFromMailboxes();
	const toast = useKumoToastManager();

	const runImport = async () => {
		setConfirmOpen(false);
		try {
			const r = await importMailboxes.mutateAsync({ includeCorporate });
			toast.add({
				title: `Scanned ${r.emailsScanned} emails in ${r.mailboxes} mailbox${r.mailboxes === 1 ? "" : "es"}`,
				description: `${r.contactsCreated} new contacts, ${r.contactsTouched - r.contactsCreated} existing updated, ${r.skipped} skipped`,
			});
			if (r.contactsCreated > 0 && !tier) setTier("unknown");
		} catch (e) {
			toast.add({ title: (e as Error).message || "Import failed", variant: "error" });
		}
	};

	// "" = all classified (exclude unknown) — done client-side since the API filter is exact-match.
	const params = useMemo(() => ({ ...(tier ? { tier } : {}), ...(q ? { q } : {}), limit: "200" }), [tier, q]);
	const { data, isLoading } = useCrmContacts(params);
	const contacts = useMemo(() => (data?.contacts ?? []).filter((c) => tier || c.tier !== "unknown"), [data, tier]);

	// Clear selection when the filter changes so a stale selection can't be applied blindly.
	useEffect(() => { setSelected(new Set()); }, [tier, q]);

	const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.email));
	const toggleAll = () => setSelected(allSelected ? new Set() : new Set(contacts.map((c) => c.email)));
	const toggleOne = (email: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(email)) next.delete(email); else next.add(email); return next; });

	const applyTier = async (next: "free" | "paid") => {
		const emails = [...selected];
		if (emails.length === 0) return;
		try {
			const r = await bulk.mutateAsync(emails.map((email) => ({ email, tier: next })));
			toast.add({ title: `${r.created + r.updated} contact${r.created + r.updated === 1 ? "" : "s"} marked as ${next}` });
			setSelected(new Set());
		} catch (e) {
			toast.add({ title: (e as Error).message || "Update failed", variant: "error" });
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 flex-wrap">
				<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1">
					{TIER_FILTERS.map((f) => (
						<button
							key={f.value}
							type="button"
							onClick={() => setTier(f.value)}
							className={`rounded-md px-3 py-1 text-sm transition-colors ${tier === f.value ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}
						>
							{f.label}
						</button>
					))}
				</div>
				<div className="flex-1 min-w-[12rem] max-w-sm">
					<Input size="sm" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
				</div>
				<div className="flex items-center gap-2 ml-auto">
					<Button type="button" size="sm" variant="secondary" icon={<DownloadSimpleIcon size={14} />} onClick={() => setConfirmOpen(true)} loading={importMailboxes.isPending}>
						Import from mailboxes
					</Button>
					<Button type="button" size="sm" variant="secondary" icon={<UploadSimpleIcon size={14} />} onClick={() => setBulkOpen(true)}>
						Bulk add
					</Button>
					<Button type="button" size="sm" variant="primary" icon={<PlusIcon size={14} />} onClick={() => setAddOpen(true)}>
						Add contact
					</Button>
				</div>
			</div>

			{selected.size > 0 && (
				<div className="flex items-center gap-2 rounded-lg border border-kumo-brand/30 bg-kumo-brand/5 px-3 py-2">
					<span className="text-sm text-kumo-default font-medium">{selected.size} selected</span>
					<Button type="button" size="sm" variant="primary" icon={<UserIcon size={14} />} onClick={() => applyTier("free")} loading={bulk.isPending}>Mark as Free</Button>
					<Button type="button" size="sm" variant="secondary" icon={<CrownSimpleIcon size={14} />} onClick={() => applyTier("paid")} disabled={bulk.isPending}>Mark as Paid</Button>
					<Button type="button" size="sm" variant="ghost" icon={<XIcon size={14} />} onClick={() => setSelected(new Set())} disabled={bulk.isPending}>Clear</Button>
				</div>
			)}

			{isLoading ? (
				<div className="flex justify-center py-20"><Loader size="lg" /></div>
			) : contacts.length === 0 ? (
				<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 text-center">
					<MagnifyingGlassIcon size={28} className="mx-auto text-kumo-subtle" />
					<p className="mt-3 text-sm font-medium text-kumo-default">No contacts</p>
					<p className="mt-1 text-sm text-kumo-subtle">
						{tier === "unknown" ? "No auto-created contacts yet." : "Mark a sender as paid or free from a conversation, or add one above."}
					</p>
				</div>
			) : (
				<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-kumo-tint/50 text-xs uppercase tracking-wide text-kumo-subtle">
							<tr>
								<th className="pl-4 pr-1 py-2 w-8">
									<input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="cursor-pointer" />
								</th>
								<th className="px-3 py-2 text-left font-medium">Contact</th>
								<th className="px-4 py-2 text-left font-medium">Tier</th>
								<th className="px-4 py-2 text-left font-medium hidden md:table-cell">Kind</th>
								<th className="px-4 py-2 text-left font-medium">Open tasks</th>
								<th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Last contact</th>
							</tr>
						</thead>
						<tbody>
							{contacts.map((c) => (
								<tr key={c.id} className={`border-t border-kumo-line hover:bg-kumo-tint/40 ${selected.has(c.email) ? "bg-kumo-brand/5" : ""}`}>
									<td className="pl-4 pr-1 py-2.5">
										<input type="checkbox" checked={selected.has(c.email)} onChange={() => toggleOne(c.email)} aria-label={`Select ${c.email}`} className="cursor-pointer" />
									</td>
									<td className="px-3 py-2.5">
										<RouterLink to={`/crm/contacts/${c.id}`} className="no-underline">
											<div className="font-medium text-kumo-default">{c.name || c.email}</div>
											{c.name && <div className="text-xs text-kumo-subtle">{c.email}</div>}
										</RouterLink>
									</td>
									<td className="px-4 py-2.5"><TierBadge tier={c.tier} size="md" /></td>
									<td className="px-4 py-2.5 hidden md:table-cell text-kumo-subtle capitalize">{c.email_kind}</td>
									<td className="px-4 py-2.5">
										{c.open_task_count > 0 ? <Badge variant="secondary">{c.open_task_count}</Badge> : <span className="text-kumo-subtle">—</span>}
									</td>
									<td className="px-4 py-2.5 hidden sm:table-cell text-kumo-subtle">{c.last_contact_at ? formatListDate(c.last_contact_at) : "—"}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<AddContactDialog open={addOpen} onClose={() => setAddOpen(false)} />
			<ImportContactsDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />

			<Dialog.Root open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
				<Dialog size="base" className="p-6">
					<Dialog.Title className="text-lg font-semibold mb-2">Import contacts from mailboxes?</Dialog.Title>
					<div className="space-y-3 text-sm text-kumo-strong">
						<p>This scans the Inbox, Sent and Archive folders of <strong>every mailbox</strong> and creates a contact for each address you have exchanged email with.</p>
						<ul className="list-disc pl-5 space-y-1 text-kumo-subtle">
							<li>Only personal addresses (Gmail, Naver, iCloud…) are added by default; automated senders are always skipped.</li>
							<li>New contacts start as <em>Unclassified</em> — you still choose Paid / Free.</li>
							<li>Safe to re-run: existing contacts are updated, nothing is duplicated.</li>
							<li>Large mailboxes may take a while; the page waits until it finishes.</li>
						</ul>
						<label className="flex items-center gap-2 text-sm text-kumo-default cursor-pointer select-none pt-1">
							<input type="checkbox" checked={includeCorporate} onChange={(e) => setIncludeCorporate(e.target.checked)} />
							Also add corporate / custom-domain addresses
						</label>
					</div>
					<div className="flex justify-end gap-2 pt-5">
						<Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
						<Button type="button" variant="primary" size="sm" icon={<DownloadSimpleIcon size={14} />} onClick={runImport}>Start import</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
