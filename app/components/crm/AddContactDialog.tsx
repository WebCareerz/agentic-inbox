// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, useKumoToastManager } from "@cloudflare/kumo";
import { useState } from "react";
import { useUpsertContact } from "~/queries/crm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddContactDialogProps {
	open: boolean;
	onClose: () => void;
}

/** Add a single contact with validated email, optional name and a tier. */
export default function AddContactDialog({ open, onClose }: AddContactDialogProps) {
	const toast = useKumoToastManager();
	const upsert = useUpsertContact();
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [tier, setTier] = useState<"paid" | "free">("free");
	const [error, setError] = useState<string | null>(null);

	const trimmed = email.trim().toLowerCase();
	const emailValid = EMAIL_RE.test(trimmed);
	const showEmailError = email.length > 0 && !emailValid;

	const reset = () => { setEmail(""); setName(""); setTier("free"); setError(null); };
	const close = () => { reset(); onClose(); };

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!emailValid) { setError("Enter a valid email address."); return; }
		setError(null);
		try {
			await upsert.mutateAsync({ email: trimmed, tier, name: name.trim() || null });
			toast.add({ title: `${trimmed} added as ${tier}` });
			close();
		} catch (err) {
			setError((err as Error).message || "Failed to add contact.");
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
			<Dialog size="base" className="p-6">
				<Dialog.Title className="text-lg font-semibold mb-4">Add contact</Dialog.Title>
				<form onSubmit={submit} className="space-y-4">
					{error && <Banner variant="error" text={error} />}
					<div>
						<Input
							label="Email"
							type="email"
							size="sm"
							placeholder="customer@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							autoFocus
						/>
						{showEmailError && <p className="mt-1 text-xs text-kumo-danger">Not a valid email address.</p>}
					</div>
					<Input label="Name (optional)" size="sm" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
					<div>
						<span className="text-sm font-medium text-kumo-default mb-1.5 block">Tier</span>
						<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
							{(["free", "paid"] as const).map((t) => (
								<button
									key={t}
									type="button"
									onClick={() => setTier(t)}
									className={`rounded-md px-3 py-1 text-sm capitalize ${tier === t ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}
								>
									{t}
								</button>
							))}
						</div>
					</div>
					<div className="flex justify-end gap-2 pt-2">
						<Button type="button" variant="ghost" size="sm" onClick={close} disabled={upsert.isPending}>Cancel</Button>
						<Button type="submit" variant="primary" size="sm" loading={upsert.isPending} disabled={!emailValid}>Add contact</Button>
					</div>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
