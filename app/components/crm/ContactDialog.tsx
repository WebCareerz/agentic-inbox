// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { CrownSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import { useCrmContactByEmail, useUpsertContact } from "~/queries/crm";
import type { CrmTask } from "~/types";
import TaskDialog, { type TaskDialogState } from "./TaskDialog";
import TierBadge from "./TierBadge";

interface ContactDialogProps {
	/** Email of the contact to show; the dialog is closed when null. */
	email: string | null;
	/** Fallback display name (e.g. from the email's From header) when creating. */
	name?: string | null;
	onClose: () => void;
}

const TIERS: { value: "paid" | "free" | "unknown"; label: string; icon?: React.ReactNode }[] = [
	{ value: "paid", label: "Paid", icon: <CrownSimpleIcon size={13} weight="fill" /> },
	{ value: "free", label: "Free", icon: <UserIcon size={13} weight="fill" /> },
	{ value: "unknown", label: "Unclassified" },
];

/** View + edit a contact (tier, name, notes) with explicit Save; lists open tasks. */
export default function ContactDialog({ email, name, onClose }: ContactDialogProps) {
	const toast = useKumoToastManager();
	const { data: contact, isLoading } = useCrmContactByEmail(email ?? undefined);
	const upsert = useUpsertContact();
	const [tier, setTier] = useState<"paid" | "free" | "unknown">("unknown");
	const [displayName, setDisplayName] = useState("");
	const [notes, setNotes] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);

	useEffect(() => {
		if (!email) return;
		setError(null);
		setTier((contact?.tier as "paid" | "free" | "unknown") ?? "unknown");
		setDisplayName(contact?.name ?? name ?? "");
		setNotes(contact?.notes ?? "");
	}, [email, contact, name]);

	const dirty = !!email && (
		tier !== ((contact?.tier as string) ?? "unknown") ||
		(displayName.trim() || null) !== (contact?.name ?? null) ||
		(notes.trim() || null) !== (contact?.notes ?? null)
	);

	const save = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!email) return;
		setError(null);
		try {
			await upsert.mutateAsync({ email, tier, name: displayName.trim() || null, notes: notes.trim() || null });
			toast.add({ title: "Contact saved" });
			onClose();
		} catch (err) {
			setError((err as Error).message || "Failed to save contact.");
		}
	};

	const openTasks: CrmTask[] = contact?.open_tasks ?? [];

	return (
		<>
			<Dialog.Root open={!!email && !taskDialog} onOpenChange={(o) => !o && onClose()}>
				<Dialog size="base" className="p-6">
					<Dialog.Title className="text-lg font-semibold mb-1">Customer</Dialog.Title>
					<p className="text-sm text-kumo-subtle mb-4 flex items-center gap-2 min-w-0">
						<span className="truncate">{email}</span>
						<TierBadge tier={contact?.tier} />
						{!isLoading && !contact && <span className="text-xs">· not a contact yet — saving will create one</span>}
					</p>
					{isLoading ? (
						<div className="flex justify-center py-8"><Loader size="base" /></div>
					) : (
						<form onSubmit={save} className="space-y-4">
							{error && <Banner variant="error" text={error} />}
							<div>
								<span className="text-sm font-medium text-kumo-default mb-1.5 block">Tier</span>
								<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
									{TIERS.map((t) => (
										<button key={t.value} type="button" onClick={() => setTier(t.value)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${tier === t.value ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>
											{t.icon}{t.label}
										</button>
									))}
								</div>
							</div>
							<Input label="Name" size="sm" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
							<div>
								<label className="text-sm font-medium text-kumo-default mb-1.5 block">Notes</label>
								<textarea
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									rows={4}
									className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
									placeholder="Plan, product, anything worth remembering"
								/>
							</div>
							{contact && (
								<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
									<dt className="text-kumo-subtle">Kind</dt><dd className="capitalize text-kumo-default">{contact.email_kind}</dd>
									<dt className="text-kumo-subtle">First seen</dt><dd className="text-kumo-default">{formatListDate(contact.first_seen_at)}</dd>
									<dt className="text-kumo-subtle">Last contact</dt><dd className="text-kumo-default">{contact.last_contact_at ? formatListDate(contact.last_contact_at) : "—"}</dd>
									<dt className="text-kumo-subtle">Open tasks</dt><dd className="text-kumo-default">{openTasks.length}</dd>
								</dl>
							)}
							{openTasks.length > 0 && (
								<ul className="divide-y divide-kumo-line rounded-md border border-kumo-line">
									{openTasks.map((t) => (
										<li key={t.id}>
											<button type="button" onClick={() => setTaskDialog({ mode: "edit", task: t })} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-kumo-tint">
												<span className="flex-1 min-w-0 truncate text-kumo-default">{t.title}</span>
												{t.priority === "high" && <span className="text-[10px] uppercase font-semibold text-kumo-danger">High</span>}
												<span className="text-xs text-kumo-subtle shrink-0">{formatListDate(t.created_at)}</span>
											</button>
										</li>
									))}
								</ul>
							)}
							<div className="flex items-center justify-between pt-2">
								{contact ? (
									<RouterLink to={`/crm/contacts/${contact.id}`} className="text-sm text-kumo-link" onClick={onClose}>Open full page</RouterLink>
								) : <span />}
								<div className="flex items-center gap-2">
									<Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={upsert.isPending}>Cancel</Button>
									<Button type="submit" variant="primary" size="sm" loading={upsert.isPending} disabled={!dirty}>Save</Button>
								</div>
							</div>
						</form>
					)}
				</Dialog>
			</Dialog.Root>
			<TaskDialog state={taskDialog} onClose={() => setTaskDialog(null)} />
		</>
	);
}
