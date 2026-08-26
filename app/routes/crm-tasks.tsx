// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Loader, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, ArrowCounterClockwiseIcon, CheckIcon, CheckSquareIcon, PencilSimpleIcon, ProhibitIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import CompleteTaskDialog, { RESOLUTION_OPTIONS } from "~/components/crm/CompleteTaskDialog";
import ConfirmDialog, { type ConfirmRequest } from "~/components/crm/ConfirmDialog";
import TaskDialog, { type TaskDialogState } from "~/components/crm/TaskDialog";
import TierBadge from "~/components/crm/TierBadge";
import { taskEmailLink, useCrmTasks, useDeleteTask, useUpdateTask } from "~/queries/crm";
import type { CrmTask } from "~/types";

const STATUS_FILTERS = [
	{ value: "open", label: "Open" },
	{ value: "done", label: "Done" },
	{ value: "cancelled", label: "Cancelled" },
];

function resolutionLabel(type: string | null) {
	return RESOLUTION_OPTIONS.find((o) => o.value === type)?.label ?? type ?? "";
}

export default function CrmTasks() {
	const toast = useKumoToastManager();
	const [status, setStatus] = useState("open");
	const [completing, setCompleting] = useState<CrmTask | null>(null);
	const [editing, setEditing] = useState<TaskDialogState>(null);
	const updateTask = useUpdateTask();
	const deleteTask = useDeleteTask();
	const params = useMemo(() => ({ status, limit: "200" }), [status]);
	const { data, isLoading } = useCrmTasks(params);
	const tasks = data?.tasks ?? [];

	const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

	const reopen = (task: CrmTask) => setConfirm({
		title: "Reopen task?",
		description: <>“{task.title}” goes back to <strong>Open</strong>; its resolution note is cleared.</>,
		confirmLabel: "Reopen",
		onConfirm: async () => { await updateTask.mutateAsync({ id: task.id, status: "open" }); toast.add({ title: "Task reopened" }); },
	});
	const cancel = (task: CrmTask) => setConfirm({
		title: "Cancel task?",
		description: <>“{task.title}” is marked <strong>Cancelled</strong>. It stays in the Cancelled list and can be reopened later.</>,
		confirmLabel: "Cancel task",
		onConfirm: async () => { await updateTask.mutateAsync({ id: task.id, status: "cancelled" }); toast.add({ title: "Task cancelled" }); },
	});
	const remove = (task: CrmTask) => setConfirm({
		title: "Delete task permanently?",
		description: <>“{task.title}” will be removed. This cannot be undone.</>,
		confirmLabel: "Delete",
		danger: true,
		onConfirm: async () => { await deleteTask.mutateAsync(task.id); toast.add({ title: "Task deleted" }); },
	});

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 flex-wrap">
				<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1">
					{STATUS_FILTERS.map((f) => (
						<button
							key={f.value}
							type="button"
							onClick={() => setStatus(f.value)}
							className={`rounded-md px-3 py-1 text-sm transition-colors ${status === f.value ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}
						>
							{f.label}
						</button>
					))}
				</div>
				{data && <span className="text-sm text-kumo-subtle">{data.total} task{data.total === 1 ? "" : "s"}</span>}
			</div>

			{isLoading ? (
				<div className="flex justify-center py-20"><Loader size="lg" /></div>
			) : tasks.length === 0 ? (
				<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 text-center">
					<CheckSquareIcon size={28} className="mx-auto text-kumo-subtle" />
					<p className="mt-3 text-sm font-medium text-kumo-default">No {status} tasks</p>
					<p className="mt-1 text-sm text-kumo-subtle">Open a conversation and click the task icon next to the sender to add one.</p>
				</div>
			) : (
				<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden divide-y divide-kumo-line">
					{tasks.map((task) => {
						const link = taskEmailLink(task);
						return (
							<div key={task.id} className="flex items-start gap-3 px-4 py-3 hover:bg-kumo-tint/40">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<button type="button" onClick={() => setEditing({ mode: "edit", task })} className={`text-sm font-medium text-left hover:underline ${task.status === "open" ? "text-kumo-default" : "text-kumo-subtle line-through"}`} title="Edit task">{task.title}</button>
										{task.priority === "high" && <span className="text-[10px] uppercase font-semibold text-kumo-danger">High</span>}
										<TierBadge tier={task.contact_tier} />
									</div>
									<div className="mt-0.5 text-xs text-kumo-subtle flex items-center gap-2 flex-wrap">
										{task.contact_email && (
											task.contact_id
												? <RouterLink to={`/crm/contacts/${task.contact_id}`} className="text-kumo-link no-underline hover:underline">{task.contact_name || task.contact_email}</RouterLink>
												: <span>{task.contact_name || task.contact_email}</span>
										)}
										{task.source_mailbox_id && <span>via {task.source_mailbox_id}</span>}
										<span>· {formatListDate(task.created_at)}</span>
										{task.status === "done" && task.resolution_type && (
											<span className="text-kumo-success">
												· {resolutionLabel(task.resolution_type)}{task.resolution_note ? `: ${task.resolution_note}` : ""}{task.resolution_ref ? ` (${task.resolution_ref})` : ""}
											</span>
										)}
									</div>
									{task.description && <p className="mt-1 text-xs text-kumo-strong whitespace-pre-wrap">{task.description}</p>}
								</div>
								<div className="flex items-center gap-1 shrink-0">
									<Tooltip content="Edit task" side="bottom" asChild>
										<Button type="button" size="xs" variant="ghost" shape="square" icon={<PencilSimpleIcon size={14} />} onClick={() => setEditing({ mode: "edit", task })} aria-label="Edit task" />
									</Tooltip>
									{link && (
										<Tooltip content="Open email" side="bottom" asChild>
											<RouterLink to={link} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default" aria-label="Open email">
												<ArrowSquareOutIcon size={15} />
											</RouterLink>
										</Tooltip>
									)}
									{task.status === "open" ? (
										<>
											<Button type="button" size="xs" variant="primary" icon={<CheckIcon size={13} />} onClick={() => setCompleting(task)}>Done</Button>
											<Tooltip content="Cancel task" side="bottom" asChild>
												<Button type="button" size="xs" variant="ghost" shape="square" icon={<ProhibitIcon size={14} />} onClick={() => cancel(task)} aria-label="Cancel task" />
											</Tooltip>
										</>
									) : (
										<>
											<Tooltip content="Reopen" side="bottom" asChild>
												<Button type="button" size="xs" variant="ghost" shape="square" icon={<ArrowCounterClockwiseIcon size={14} />} onClick={() => reopen(task)} aria-label="Reopen task" />
											</Tooltip>
											<Tooltip content="Delete" side="bottom" asChild>
												<Button type="button" size="xs" variant="ghost" shape="square" icon={<TrashIcon size={14} />} onClick={() => remove(task)} aria-label="Delete task" />
											</Tooltip>
										</>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			<CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
			<TaskDialog state={editing} onClose={() => setEditing(null)} />
			<ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
		</div>
	);
}
