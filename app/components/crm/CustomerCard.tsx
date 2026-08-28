// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, CaretDownIcon, CaretUpIcon, CheckIcon, PencilSimpleIcon, PlusIcon, UserPlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import { useCrmContactByEmail } from "~/queries/crm";
import type { CrmTask } from "~/types";
import CompleteTaskDialog from "./CompleteTaskDialog";
import ContactDialog from "./ContactDialog";
import CreateCustomerDialog from "./CreateCustomerDialog";
import TaskDialog, { type TaskDialogState } from "./TaskDialog";
import TierBadge from "./TierBadge";

interface CustomerCardProps {
	/** The external party of the conversation. */
	email: string;
	name?: string | null;
	mailboxId?: string;
	/** Email a new task is linked to. */
	emailId?: string;
	/** Default title for a new task. */
	subject?: string | null;
	/** Body of the email being viewed — used by "Create customer from this email". */
	body?: string | null;
	senderEmail?: string | null;
	selfEmail?: string | null;
	threadId?: string | null;
}

/**
 * Compact CRM summary above a conversation: tier, notes, open tasks (click to
 * edit, one-click Done), plus edit-contact / add-task / open-page actions.
 * Every change goes through a dialog with an explicit confirm.
 */
export default function CustomerCard({ email, name, mailboxId, emailId, subject, body, senderEmail, selfEmail, threadId }: CustomerCardProps) {
	const { data: contact, isLoading } = useCrmContactByEmail(email);
	const [collapsed, setCollapsed] = useState(false);
	const [contactOpen, setContactOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [taskDialog, setTaskDialog] = useState<TaskDialogState>(null);
	const [completing, setCompleting] = useState<CrmTask | null>(null);

	if (!email || isLoading) return null;

	const openTasks = contact?.open_tasks ?? [];
	const displayName = contact?.name || name || email;
	const hasBody = !!contact && (!!contact.notes || openTasks.length > 0);

	return (
		<div className="mx-4 mt-3 rounded-lg border border-kumo-line bg-kumo-tint/30 md:mx-6">
			<div className="flex items-center gap-2 px-3 py-2">
				<button
					type="button"
					onClick={() => setCollapsed((c) => !c)}
					className={`shrink-0 text-kumo-subtle hover:text-kumo-default ${hasBody ? "" : "invisible"}`}
					aria-label={collapsed ? "Expand customer card" : "Collapse customer card"}
				>
					{collapsed ? <CaretDownIcon size={14} /> : <CaretUpIcon size={14} />}
				</button>
				<div className="min-w-0 flex-1 flex items-center gap-2">
					<span className="text-sm font-medium text-kumo-default truncate">{displayName}</span>
					{displayName !== email && <span className="text-xs text-kumo-subtle truncate hidden sm:inline">{email}</span>}
					<TierBadge tier={contact?.tier} showUnknown />
					{!contact && <span className="text-xs text-kumo-subtle">not a contact yet</span>}
					{openTasks.length > 0 && collapsed && (
						<button type="button" onClick={() => setCollapsed(false)} className="text-xs text-kumo-brand font-medium hover:underline">
							{openTasks.length} open task{openTasks.length === 1 ? "" : "s"}
						</button>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Tooltip content={contact ? "View / edit customer" : "Add as customer"} side="bottom" asChild>
						<Button type="button" size="xs" shape="square" variant="ghost" icon={<PencilSimpleIcon size={14} />} onClick={() => setContactOpen(true)} aria-label="View or edit customer" />
					</Tooltip>
					{body != null && (
						<Tooltip content="Create customer from this email (reads name, email, payment details)" side="bottom" asChild>
							<Button type="button" size="xs" shape="square" variant="ghost" icon={<UserPlusIcon size={14} />} onClick={() => setCreateOpen(true)} aria-label="Create customer from this email" />
						</Tooltip>
					)}
					<Tooltip content="New task from this email" side="bottom" asChild>
						<Button
							type="button"
							size="xs"
							shape="square"
							variant="ghost"
							icon={<PlusIcon size={14} />}
							onClick={() => setTaskDialog({ mode: "create", contactEmail: email, mailboxId: mailboxId ?? null, emailId: emailId ?? null, defaultTitle: subject ?? null })}
							aria-label="New task"
						/>
					</Tooltip>
					{contact && (
						<Tooltip content="Open customer page" side="bottom" asChild>
							<RouterLink to={`/crm/contacts/${contact.id}`} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default" aria-label="Open customer page">
								<ArrowSquareOutIcon size={14} />
							</RouterLink>
						</Tooltip>
					)}
				</div>
			</div>

			{!collapsed && hasBody && contact && (
				<div className="border-t border-kumo-line px-3 py-2 space-y-2">
					{contact.notes && <p className="text-xs text-kumo-strong whitespace-pre-wrap line-clamp-3">{contact.notes}</p>}
					{openTasks.length > 0 && (
						<ul className="space-y-1">
							{openTasks.map((t) => (
								<li key={t.id} className="flex items-center gap-2 text-xs">
									<button type="button" onClick={() => setTaskDialog({ mode: "edit", task: t })} className="flex-1 min-w-0 text-left truncate text-kumo-default hover:underline" title="Edit task">
										{t.title}
									</button>
									{t.priority === "high" && <span className="text-[10px] uppercase font-semibold text-kumo-danger shrink-0">High</span>}
									<span className="text-kumo-subtle shrink-0">{formatListDate(t.created_at)}</span>
									<Button type="button" size="xs" variant="secondary" icon={<CheckIcon size={12} />} onClick={() => setCompleting(t)}>Done</Button>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			<ContactDialog email={contactOpen ? email : null} name={name} onClose={() => setContactOpen(false)} />
			{body != null && (
				<CreateCustomerDialog
					open={createOpen}
					onClose={() => setCreateOpen(false)}
					body={body}
					senderEmail={senderEmail ?? undefined}
					selfEmails={selfEmail ? [selfEmail] : []}
					mailboxId={mailboxId}
					emailId={emailId}
					threadId={threadId}
					subject={subject}
				/>
			)}
			<TaskDialog state={taskDialog} onClose={() => setTaskDialog(null)} />
			<CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
		</div>
	);
}
