// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Link as RouterLink } from "react-router";
import ContactDialog from "./ContactDialog";
import TaskDialog, { type TaskDialogState } from "./TaskDialog";
import TierBadge from "./TierBadge";

interface ContactActionsProps {
	/** External party's email address */
	email: string;
	name?: string | null;
	tier?: string | null;
	contactId?: string | null;
	mailboxId?: string;
	emailId?: string;
	/** Default title for a task created from this message. */
	subject?: string | null;
}

/**
 * Inline CRM controls next to a sender in the thread view: tier badge,
 * view/edit contact (dialog), new task (dialog), link to the CRM page.
 */
export default function ContactActions({ email, name, tier, contactId, mailboxId, emailId, subject }: ContactActionsProps) {
	const [contactOpen, setContactOpen] = useState(false);
	const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);

	return (
		<div className="flex items-center gap-1 flex-wrap">
			<TierBadge tier={tier} showUnknown={!!contactId} />
			<Tooltip content={contactId ? "View / edit customer" : "Add as customer"} side="bottom" asChild>
				<Button type="button" variant="ghost" shape="square" size="xs" icon={<PencilSimpleIcon size={14} />} onClick={() => setContactOpen(true)} aria-label="View or edit customer" />
			</Tooltip>
			{mailboxId && emailId && (
				<Tooltip content="New task from this message" side="bottom" asChild>
					<Button
						type="button"
						variant="ghost"
						shape="square"
						size="xs"
						icon={<PlusIcon size={14} />}
						onClick={() => setTaskDialog({ mode: "create", contactEmail: email, mailboxId, emailId, defaultTitle: subject ?? null })}
						aria-label="New task"
					/>
				</Tooltip>
			)}
			{contactId && (
				<RouterLink to={`/crm/contacts/${contactId}`} className="text-xs text-kumo-link hover:text-kumo-link-hover ml-1">
					CRM
				</RouterLink>
			)}
			<ContactDialog email={contactOpen ? email : null} name={name} onClose={() => setContactOpen(false)} />
			<TaskDialog state={taskDialog} onClose={() => setTaskDialog(null)} />
		</div>
	);
}
