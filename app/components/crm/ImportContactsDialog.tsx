// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, useKumoToastManager } from "@cloudflare/kumo";
import { useMemo, useState } from "react";
import { useBulkUpsertContacts } from "~/queries/crm";

interface ImportContactsDialogProps {
	open: boolean;
	onClose: () => void;
}

/** Parse "email, name" / "email name" / bare email lines; ignores everything else. */
export function parseContactLines(text: string): { email: string; name?: string }[] {
	const out: { email: string; name?: string }[] = [];
	const seen = new Set<string>();
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(/([^\s,;<>"]+@[^\s,;<>"]+)/);
		if (!m) continue;
		const email = m[1].toLowerCase();
		if (seen.has(email)) continue;
		seen.add(email);
		const name = line.replace(m[0], "").replace(/[<>",;]+/g, " ").replace(/\s+/g, " ").trim();
		out.push(name ? { email, name } : { email });
	}
	return out;
}

const PLACEHOLDER = `alice@example.com, Alice Chen
bob@gmail.com Bob
carol@icloud.com`;

/** Paste a list of emails (optionally with names) and assign them a tier in one go. */
export default function ImportContactsDialog({ open, onClose }: ImportContactsDialogProps) {
	const toast = useKumoToastManager();
	const bulk = useBulkUpsertContacts();
	const [text, setText] = useState("");
	const [tier, setTier] = useState<"paid" | "free">("paid");
	const [error, setError] = useState<string | null>(null);
	const parsed = useMemo(() => parseContactLines(text), [text]);

	const submit = async () => {
		setError(null);
		try {
			const res = await bulk.mutateAsync(parsed.map((c) => ({ ...c, tier })));
			toast.add({ title: `${res.created} created, ${res.updated} updated${res.failed.length ? `, ${res.failed.length} failed` : ""}` });
			if (res.failed.length) setError(res.failed.map((f) => `${f.email}: ${f.error}`).join("; "));
			else { setText(""); onClose(); }
		} catch (e) {
			setError((e as Error).message || "Import failed.");
		}
	};

	return (
		<Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
			<Dialog size="base" className="p-6">
				<Dialog.Title className="text-lg font-semibold mb-1">Bulk add contacts</Dialog.Title>
				<p className="text-sm text-kumo-subtle mb-4">One per line: <code>email, name</code> — name optional. Existing contacts are updated to the chosen tier.</p>
				<div className="space-y-3">
					{error && <Banner variant="error" text={error} />}
					<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
						{(["paid", "free"] as const).map((t) => (
							<button key={t} type="button" onClick={() => setTier(t)} className={`rounded-md px-3 py-1 text-sm capitalize ${tier === t ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>
								Mark as {t}
							</button>
						))}
					</div>
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={10}
						spellCheck={false}
						placeholder={PLACEHOLDER}
						className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 font-mono text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
					/>
					<div className="flex items-center justify-between">
						<span className="text-xs text-kumo-subtle">{parsed.length} address{parsed.length === 1 ? "" : "es"} detected</span>
						<div className="flex gap-2">
							<Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={bulk.isPending}>Cancel</Button>
							<Button type="button" variant="primary" size="sm" onClick={submit} loading={bulk.isPending} disabled={parsed.length === 0}>Import {parsed.length || ""}</Button>
						</div>
					</div>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
