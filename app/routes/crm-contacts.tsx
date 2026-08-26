// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { DownloadSimpleIcon, MagnifyingGlassIcon, PlusIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import ImportContactsDialog from "~/components/crm/ImportContactsDialog";
import TierBadge from "~/components/crm/TierBadge";
import { useCrmContacts, useImportFromMailboxes, useUpsertContact } from "~/queries/crm";

const TIER_FILTERS = [
	{ value: "", label: "All classified" },
	{ value: "paid", label: "Paid" },
	{ value: "free", label: "Free" },
	{ value: "unknown", label: "Unclassified" },
];

export default function CrmContacts() {
	const [tier, setTier] = useState("");
	const [q, setQ] = useState("");
	const [newEmail, setNewEmail] = useState("");
	const [bulkOpen, setBulkOpen] = useState(false);
	const [includeCorporate, setIncludeCorporate] = useState(false);
	const upsert = useUpsertContact();
	const importMailboxes = useImportFromMailboxes();
	const toast = useKumoToastManager();

	const runImport = async () => {
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

	const addContact = async (e: React.FormEvent) => {
		e.preventDefault();
		const email = newEmail.trim();
		if (!email) return;
		await upsert.mutateAsync({ email, tier: "free" });
		setNewEmail("");
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
					<label className="flex items-center gap-1.5 text-xs text-kumo-subtle cursor-pointer select-none">
						<input type="checkbox" checked={includeCorporate} onChange={(e) => setIncludeCorporate(e.target.checked)} />
						include corporate
					</label>
					<Button type="button" size="sm" variant="secondary" icon={<DownloadSimpleIcon size={14} />} onClick={runImport} loading={importMailboxes.isPending}>
						Import from mailboxes
					</Button>
					<Button type="button" size="sm" variant="secondary" icon={<UploadSimpleIcon size={14} />} onClick={() => setBulkOpen(true)}>
						Bulk add
					</Button>
				</div>
				<form onSubmit={addContact} className="flex items-center gap-1">
					<div className="w-56">
						<Input size="sm" type="email" placeholder="Add contact by email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
					</div>
					<Button type="submit" size="sm" variant="secondary" icon={<PlusIcon size={14} />} loading={upsert.isPending} disabled={!newEmail.trim()}>
						Add
					</Button>
				</form>
			</div>

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
								<th className="px-4 py-2 text-left font-medium">Contact</th>
								<th className="px-4 py-2 text-left font-medium">Tier</th>
								<th className="px-4 py-2 text-left font-medium hidden md:table-cell">Kind</th>
								<th className="px-4 py-2 text-left font-medium">Open tasks</th>
								<th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Last contact</th>
							</tr>
						</thead>
						<tbody>
							{contacts.map((c) => (
								<tr key={c.id} className="border-t border-kumo-line hover:bg-kumo-tint/40">
									<td className="px-4 py-2.5">
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

			<ImportContactsDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
		</div>
	);
}
