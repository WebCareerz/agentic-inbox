// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { CheckSquareIcon, CrownSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { Link as RouterLink } from "react-router";
import { useCreateTask, useUpsertContact } from "~/queries/crm";
import TierBadge from "./TierBadge";

interface ContactActionsProps {
	/** External party's email address */
	email: string;
	name?: string | null;
	tier?: string | null;
	contactId?: string | null;
	hasOpenTask?: boolean;
	mailboxId?: string;
	emailId?: string;
}

/**
 * Inline CRM controls shown next to a sender in the thread view:
 * tier badge, quick "Paid / Free" toggle, and "Add task".
 */
export default function ContactActions({ email, name, tier, contactId, hasOpenTask, mailboxId, emailId }: ContactActionsProps) {
	const toast = useKumoToastManager();
	const upsert = useUpsertContact();
	const createTask = useCreateTask();

	const setTier = async (next: "paid" | "free") => {
		try {
			await upsert.mutateAsync({ email, tier: next, ...(name ? { name } : {}) });
			toast.add({ title: `${email} marked as ${next}` });
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

	const busy = upsert.isPending || createTask.isPending;

	return (
		<div className="flex items-center gap-1 flex-wrap">
			<TierBadge tier={tier} />
			<Tooltip content={tier === "paid" ? "Paid customer" : "Mark as paid customer"} side="bottom" asChild>
				<Button
					type="button"
					variant={tier === "paid" ? "secondary" : "ghost"}
					shape="square"
					size="xs"
					icon={<CrownSimpleIcon size={14} weight={tier === "paid" ? "fill" : "regular"} />}
					onClick={() => setTier("paid")}
					disabled={busy || tier === "paid"}
					aria-label="Mark as paid"
				/>
			</Tooltip>
			<Tooltip content={tier === "free" ? "Free user" : "Mark as free user"} side="bottom" asChild>
				<Button
					type="button"
					variant={tier === "free" ? "secondary" : "ghost"}
					shape="square"
					size="xs"
					icon={<UserIcon size={14} weight={tier === "free" ? "fill" : "regular"} />}
					onClick={() => setTier("free")}
					disabled={busy || tier === "free"}
					aria-label="Mark as free"
				/>
			</Tooltip>
			{mailboxId && emailId && (
				<Tooltip content={hasOpenTask ? "Add another task" : "Add to tasks"} side="bottom" asChild>
					<Button
						type="button"
						variant={hasOpenTask ? "secondary" : "ghost"}
						shape="square"
						size="xs"
						icon={<CheckSquareIcon size={14} weight={hasOpenTask ? "fill" : "regular"} />}
						onClick={addTask}
						disabled={busy}
						aria-label="Add task"
					/>
				</Tooltip>
			)}
			{contactId && (
				<RouterLink to={`/crm/contacts/${contactId}`} className="text-xs text-kumo-link hover:text-kumo-link-hover ml-1">
					CRM
				</RouterLink>
			)}
		</div>
	);
}
