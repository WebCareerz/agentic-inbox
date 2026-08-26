// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, CaretDownIcon, CaretUpIcon, CheckIcon, CrownSimpleIcon, PlusIcon, UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import { useCreateTask, useCrmContactByEmail, useUpsertContact } from "~/queries/crm";
import type { CrmTask } from "~/types";
import CompleteTaskDialog from "./CompleteTaskDialog";
import TierBadge from "./TierBadge";

interface CustomerCardProps {
	/** The external party of the conversation. */
	email: string;
	name?: string | null;
	mailboxId?: string;
	/** Email to attach a newly created task to. */
	emailId?: string;
}

/**
 * Compact CRM summary shown above a conversation: tier, notes, open tasks
 * with a one-click "Done", and shortcuts to mark tier / add a task / open
 * the full customer page.
 */
export default function CustomerCard({ email, name, mailboxId, emailId }: CustomerCardProps) {
	const toast = useKumoToastManager();
	const { data: contact, isLoading } = useCrmContactByEmail(email);
	const upsert = useUpsertContact();
	const createTask = useCreateTask();
	const [collapsed, setCollapsed] = useState(false);
	const [completing, setCompleting] = useState<CrmTask | null>(null);

	if (!email || isLoading) return null;

	const busy = upsert.isPending || createTask.isPending;
	const openTasks = contact?.open_tasks ?? [];

	const setTier = async (tier: "paid" | "free") => {
		try {
			await upsert.mutateAsync({ email, tier, ...(name && !contact?.name ? { name } : {}) });
			toast.add({ title: `${email} marked as ${tier}` });
		} catch (e) {
			toast.add({ title: (e as Error).message || "Failed to update contact", variant: "error" });
		}
	};
	const addTask = async () => {
		try {
			await createTask.mutateAsync({ mailboxId, emailId, contact_email: email });
			toast.add({ title: "Task created" });
		} catch (e) {
			toast.add({ title: (e as Error).message || "Failed to create task", variant: "error" });
		}
	};

	const displayName = contact?.name || name || email;

	return (
		<div className="mx-4 mt-3 rounded-lg border border-kumo-line bg-kumo-tint/30 md:mx-6">
			<div className="flex items-center gap-2 px-3 py-2">
				<button type="button" onClick={() => setCollapsed((c) => !c)} className="shrink-0 text-kumo-subtle hover:text-kumo-default" aria-label={collapsed ? "Expand customer card" : "Collapse customer card"}>
					{collapsed ? <CaretDownIcon size={14} /> : <CaretUpIcon size={14} />}
				</button>
				<div className="min-w-0 flex-1 flex items-center gap-2">
					<span className="text-sm font-medium text-kumo-default truncate">{displayName}</span>
					{displayName !== email && <span className="text-xs text-kumo-subtle truncate hidden sm:inline">{email}</span>}
					<TierBadge tier={contact?.tier} />
					{!contact && <span className="text-xs text-kumo-subtle">not a contact yet</span>}
					{openTasks.length > 0 && collapsed && (
						<span className="text-xs text-kumo-brand font-medium">{openTasks.length} open task{openTasks.length === 1 ? "" : "s"}</span>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Tooltip content="Mark as paid" side="bottom" asChild>
						<Button type="button" size="xs" shape="square" variant={contact?.tier === "paid" ? "secondary" : "ghost"} icon={<CrownSimpleIcon size={14} weight={contact?.tier === "paid" ? "fill" : "regular"} />} onClick={() => setTier("paid")} disabled={busy || contact?.tier === "paid"} aria-label="Mark as paid" />
					</Tooltip>
					<Tooltip content="Mark as free" side="bottom" asChild>
						<Button type="button" size="xs" shape="square" variant={contact?.tier === "free" ? "secondary" : "ghost"} icon={<UserIcon size={14} weight={contact?.tier === "free" ? "fill" : "regular"} />} onClick={() => setTier("free")} disabled={busy || contact?.tier === "free"} aria-label="Mark as free" />
					</Tooltip>
					{mailboxId && emailId && (
						<Tooltip content="Add task from this email" side="bottom" asChild>
							<Button type="button" size="xs" shape="square" variant="ghost" icon={<PlusIcon size={14} />} onClick={addTask} disabled={busy} aria-label="Add task" />
						</Tooltip>
					)}
					{contact && (
						<Tooltip content="Open customer page" side="bottom" asChild>
							<RouterLink to={`/crm/contacts/${contact.id}`} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default" aria-label="Open customer page">
								<ArrowSquareOutIcon size={14} />
							</RouterLink>
						</Tooltip>
					)}
				</div>
			</div>

			{!collapsed && contact && (contact.notes || openTasks.length > 0) && (
				<div className="border-t border-kumo-line px-3 py-2 space-y-2">
					{contact.notes && (
						<p className="text-xs text-kumo-strong whitespace-pre-wrap line-clamp-3">{contact.notes}</p>
					)}
					{openTasks.length > 0 && (
						<ul className="space-y-1">
							{openTasks.map((t) => (
								<li key={t.id} className="flex items-center gap-2 text-xs">
									<span className="flex-1 min-w-0 truncate text-kumo-default">{t.title}</span>
									<span className="text-kumo-subtle shrink-0">{formatListDate(t.created_at)}</span>
									<Button type="button" size="xs" variant="secondary" icon={<CheckIcon size={12} />} onClick={() => setCompleting(t)}>Done</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			<CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
		</div>
	);
}
