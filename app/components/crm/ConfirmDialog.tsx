// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog } from "@cloudflare/kumo";
import { useState } from "react";

export interface ConfirmRequest {
	title: string;
	/** One or two sentences describing exactly what will happen. */
	description?: React.ReactNode;
	confirmLabel?: string;
	/** Use the destructive style for irreversible actions. */
	danger?: boolean;
	onConfirm: () => Promise<void> | void;
}

interface ConfirmDialogProps {
	request: ConfirmRequest | null;
	onClose: () => void;
}

/**
 * Generic second-step confirmation. Keep a `ConfirmRequest | null` in state,
 * set it to ask, and render <ConfirmDialog request={…} onClose={…} />.
 */
export default function ConfirmDialog({ request, onClose }: ConfirmDialogProps) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const close = () => { if (!busy) { setError(null); onClose(); } };

	const confirm = async () => {
		if (!request) return;
		setBusy(true);
		setError(null);
		try {
			await request.onConfirm();
			onClose();
		} catch (e) {
			setError((e as Error).message || "Action failed.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog.Root open={!!request} onOpenChange={(o) => !o && close()}>
			<Dialog size="sm" className="p-6">
				<Dialog.Title className="text-base font-semibold mb-2">{request?.title}</Dialog.Title>
				{request?.description && <div className="text-sm text-kumo-strong">{request.description}</div>}
				{error && <div className="mt-3"><Banner variant="error" text={error} /></div>}
				<div className="flex justify-end gap-2 pt-5">
					<Button type="button" variant="ghost" size="sm" onClick={close} disabled={busy}>Cancel</Button>
					<Button type="button" variant={request?.danger ? "destructive" : "primary"} size="sm" onClick={confirm} loading={busy}>
						{request?.confirmLabel ?? "Confirm"}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
