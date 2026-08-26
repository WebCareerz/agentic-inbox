// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import { formatListDate } from "shared/dates";
import { taskEmailLink, useCreateTask, useUpdateTask } from "~/queries/crm";
import type { CrmTask } from "~/types";
import CompleteTaskDialog, { RESOLUTION_OPTIONS } from "./CompleteTaskDialog";
import ConfirmDialog, { type ConfirmRequest } from "./ConfirmDialog";

/** Create a new task (from an email or standalone). */
export interface TaskDialogCreate {
	mode: "create";
	contactEmail?: string | null;
	mailboxId?: string | null;
	emailId?: string | null;
	/** Default title, usually the email subject. */
	defaultTitle?: string | null;
}

/** Edit an existing task. */
export interface TaskDialogEdit {
	mode: "edit";
	task: CrmTask;
}

export type TaskDialogState = TaskDialogCreate | TaskDialogEdit | null;

interface TaskDialogProps {
	state: TaskDialogState;
	onClose: () => void;
}

/** Create / edit dialog for a CRM task, with status actions for existing ones. */
export default function TaskDialog({ state, onClose }: TaskDialogProps) {
	const toast = useKumoToastManager();
	const createTask = useCreateTask();
	const updateTask = useUpdateTask();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<"normal" | "high">("normal");
	const [error, setError] = useState<string | null>(null);
	const [completing, setCompleting] = useState<CrmTask | null>(null);
	const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

	useEffect(() => {
		if (!state) return;
		setError(null);
		if (state.mode === "edit") {
			setTitle(state.task.title);
			setDescription(state.task.description ?? "");
			setPriority(state.task.priority === "high" ? "high" : "normal");
		} else {
			setTitle(state.defaultTitle?.trim() || "");
			setDescription("");
			setPriority("normal");
		}
	}, [state]);

	if (!state) return null;
	const isEdit = state.mode === "edit";
	const task = isEdit ? state.task : null;
	const busy = createTask.isPending || updateTask.isPending;
	const titleValid = title.trim().length > 0;

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!titleValid) { setError("Title is required."); return; }
		setError(null);
		try {
			if (isEdit && task) {
				await updateTask.mutateAsync({ id: task.id, title: title.trim(), description: description.trim() || null, priority });
				toast.add({ title: "Task updated" });
			} else if (state.mode === "create") {
				await createTask.mutateAsync({
					title: title.trim(),
					description: description.trim() || null,
					priority,
					mailboxId: state.mailboxId ?? null,
					emailId: state.emailId ?? null,
					contact_email: state.contactEmail ?? null,
				});
				toast.add({ title: "Task created" });
			}
			onClose();
		} catch (err) {
			setError((err as Error).message || "Failed to save task.");
		}
	};

	const setStatus = (status: "open" | "cancelled") => {
		if (!task) return;
		setConfirm({
			title: status === "open" ? "Reopen task?" : "Cancel task?",
			description: status === "open"
				? <>“{task.title}” goes back to <strong>Open</strong>; its resolution note is cleared.</>
				: <>“{task.title}” is marked <strong>Cancelled</strong>. It can be reopened later.</>,
			confirmLabel: status === "open" ? "Reopen" : "Cancel task",
			onConfirm: async () => {
				await updateTask.mutateAsync({ id: task.id, status });
				toast.add({ title: status === "open" ? "Task reopened" : "Task cancelled" });
				onClose();
			},
		});
	};

	const link = task ? taskEmailLink(task) : null;
	const resolution = task?.resolution_type ? RESOLUTION_OPTIONS.find((o) => o.value === task.resolution_type)?.label : null;

	return (
		<>
			<Dialog.Root open={!!state && !completing && !confirm} onOpenChange={(o) => !o && onClose()}>
				<Dialog size="base" className="p-6">
					<Dialog.Title className="text-lg font-semibold mb-1">{isEdit ? "Task" : "New task"}</Dialog.Title>
					{task && (
						<p className="text-xs text-kumo-subtle mb-4 flex items-center gap-2 flex-wrap">
							<span className="capitalize">{task.status}</span>
							{task.status === "done" && resolution && <span>· {resolution}{task.resolution_note ? `: ${task.resolution_note}` : ""}</span>}
							<span>· created {formatListDate(task.created_at)}</span>
							{task.contact_email && <span>· {task.contact_name || task.contact_email}</span>}
							{link && <RouterLink to={link} className="text-kumo-link" onClick={onClose}>Open email</RouterLink>}
						</p>
					)}
					{!task && state.mode === "create" && state.contactEmail && (
						<p className="text-xs text-kumo-subtle mb-4">For {state.contactEmail}{state.emailId ? " · linked to this email" : ""}</p>
					)}
					<form onSubmit={submit} className="space-y-4">
						{error && <Banner variant="error" text={error} />}
						<Input label="Title" size="sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" required autoFocus />
						<div>
							<label className="text-sm font-medium text-kumo-default mb-1.5 block">Description (optional)</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={4}
								className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
								placeholder="Details, what the customer asked for, how you plan to handle it"
							/>
						</div>
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">Priority</span>
							<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
								{(["normal", "high"] as const).map((p) => (
									<button key={p} type="button" onClick={() => setPriority(p)} className={`rounded-md px-3 py-1 text-sm capitalize ${priority === p ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>
										{p}
									</button>
								))}
							</div>
						</div>
						<div className="flex items-center justify-between gap-2 pt-2">
							<div className="flex items-center gap-2">
								{task?.status === "open" && (
									<>
										<Button type="button" variant="secondary" size="sm" onClick={() => setCompleting(task)} disabled={busy}>Mark done…</Button>
										<Button type="button" variant="ghost" size="sm" onClick={() => setStatus("cancelled")} disabled={busy}>Cancel task</Button>
									</>
								)}
								{task && task.status !== "open" && (
									<Button type="button" variant="secondary" size="sm" onClick={() => setStatus("open")} disabled={busy}>Reopen</Button>
								)}
							</div>
							<div className="flex items-center gap-2">
								<Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>
								<Button type="submit" variant="primary" size="sm" loading={busy} disabled={!titleValid}>{isEdit ? "Save" : "Create task"}</Button>
							</div>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
			<CompleteTaskDialog task={completing} onClose={() => { setCompleting(null); onClose(); }} />
			<ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
		</>
	);
}
