// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useUpdateTask } from "~/queries/crm";
import type { CrmTask, TaskResolution } from "~/types";

export const RESOLUTION_OPTIONS: { value: TaskResolution; label: string; hint: string }[] = [
	{ value: "replied", label: "Replied", hint: "Answered the customer by email" },
	{ value: "released", label: "Released", hint: "Shipped a version that addresses it" },
	{ value: "fixed", label: "Fixed", hint: "Code / config change, not yet released" },
	{ value: "other", label: "Other", hint: "Anything else — describe in the note" },
];

interface CompleteTaskDialogProps {
	task: CrmTask | null;
	onClose: () => void;
}

/** Choose how a task was resolved, then mark it done. */
export default function CompleteTaskDialog({ task, onClose }: CompleteTaskDialogProps) {
	const toast = useKumoToastManager();
	const updateTask = useUpdateTask();
	const [type, setType] = useState<TaskResolution>("replied");
	const [note, setNote] = useState("");
	const [ref, setRef] = useState("");
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!task) return;
		setError(null);
		try {
			await updateTask.mutateAsync({ id: task.id, status: "done", resolution_type: type, resolution_note: note.trim() || null, resolution_ref: ref.trim() || null });
			toast.add({ title: "Task completed" });
			onClose();
		} catch (e) {
			setError((e as Error).message || "Failed to complete task.");
		}
	};

	return (
		<Dialog.Root open={!!task} onOpenChange={(open) => !open && onClose()}>
			<Dialog size="base" className="p-6">
				<Dialog.Title className="text-lg font-semibold mb-1">Complete task</Dialog.Title>
				<p className="text-sm text-kumo-subtle mb-4 truncate">{task?.title}</p>
				<div className="space-y-4">
					{error && <Banner variant="error" text={error} />}
					<div className="grid grid-cols-2 gap-2">
						{RESOLUTION_OPTIONS.map((opt) => (
							<button
								key={opt.value}
								type="button"
								onClick={() => setType(opt.value)}
								className={`rounded-md border p-3 text-left transition-colors ${type === opt.value ? "border-kumo-brand bg-kumo-brand/5" : "border-kumo-line hover:bg-kumo-tint"}`}
							>
								<div className="text-sm font-medium text-kumo-default">{opt.label}</div>
								<div className="text-xs text-kumo-subtle mt-0.5">{opt.hint}</div>
							</button>
						))}
					</div>
					<Input label="Note" size="sm" placeholder="e.g. Fixed in v1.4.2, or what you told the customer" value={note} onChange={(e) => setNote(e.target.value)} />
					<Input label="Reference (optional)" size="sm" placeholder="Version, commit, URL…" value={ref} onChange={(e) => setRef(e.target.value)} />
					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={updateTask.isPending}>Cancel</Button>
						<Button type="button" variant="primary" size="sm" onClick={submit} loading={updateTask.isPending}>Mark done</Button>
					</div>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
