// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, useKumoToastManager } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { csvToContacts, type CsvContactRow } from "~/lib/csv";
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

type Mode = "paste" | "csv";

/**
 * Bulk import: paste a list, or upload a CSV export (e.g. from Creem / Stripe).
 * CSV columns other than email/name are stored on the contact as metadata
 * (country, paid_at, customer_id, …). Everything is assigned the chosen tier.
 */
export default function ImportContactsDialog({ open, onClose }: ImportContactsDialogProps) {
	const toast = useKumoToastManager();
	const bulk = useBulkUpsertContacts();
	const fileRef = useRef<HTMLInputElement>(null);
	const [mode, setMode] = useState<Mode>("paste");
	const [text, setText] = useState("");
	const [csv, setCsv] = useState<{ name: string; rows: CsvContactRow[]; skipped: number; columns: string[] } | null>(null);
	const [tier, setTier] = useState<"paid" | "free">("paid");
	const [product, setProduct] = useState("");
	const [error, setError] = useState<string | null>(null);

	const pasted = useMemo(() => parseContactLines(text), [text]);
	const rows: CsvContactRow[] = mode === "csv" ? (csv?.rows ?? []) : pasted.map((c) => ({ ...c, metadata: {} }));

	const reset = () => { setText(""); setCsv(null); setProduct(""); setError(null); if (fileRef.current) fileRef.current.value = ""; };
	const close = () => { reset(); onClose(); };

	const loadFile = async (file: File) => {
		setError(null);
		try {
			const parsed = csvToContacts(await file.text());
			if (parsed.contacts.length === 0) throw new Error("No rows with a valid email address found.");
			setCsv({ name: file.name, rows: parsed.contacts, skipped: parsed.skipped, columns: parsed.columns });
		} catch (e) {
			setCsv(null);
			setError((e as Error).message || "Could not read the CSV file.");
		}
	};

	const submit = async () => {
		setError(null);
		const productName = product.trim();
		try {
			const res = await bulk.mutateAsync(rows.map((r) => ({
				email: r.email,
				name: r.name ?? null,
				tier,
				...(Object.keys(r.metadata).length || productName
					? { metadata: { ...r.metadata, ...(productName ? { product: productName } : {}), ...(mode === "csv" ? { import_source: csv?.name } : {}) } }
					: {}),
			})));
			toast.add({ title: `${res.created} created, ${res.updated} updated${res.failed.length ? `, ${res.failed.length} failed` : ""}` });
			if (res.failed.length) setError(res.failed.map((f) => `${f.email}: ${f.error}`).join("; "));
			else close();
		} catch (e) {
			setError((e as Error).message || "Import failed.");
		}
	};

	const metadataKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const r of rows) for (const k of Object.keys(r.metadata)) keys.add(k);
		return [...keys];
	}, [rows]);

	return (
		<Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
			<Dialog size="lg" className="p-6">
				<Dialog.Title className="text-lg font-semibold mb-1">Bulk add contacts</Dialog.Title>
				<p className="text-sm text-kumo-subtle mb-4">Existing contacts are updated to the chosen tier; names and extra columns are merged in.</p>
				<div className="space-y-3">
					{error && <Banner variant="error" text={error} />}

					<div className="flex items-center gap-3 flex-wrap">
						<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
							{(["paste", "csv"] as const).map((m) => (
								<button key={m} type="button" onClick={() => { setMode(m); setError(null); }} className={`rounded-md px-3 py-1 text-sm ${mode === m ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>
									{m === "paste" ? "Paste list" : "CSV file"}
								</button>
							))}
						</div>
						<div className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1 w-fit">
							{(["paid", "free"] as const).map((t) => (
								<button key={t} type="button" onClick={() => setTier(t)} className={`rounded-md px-3 py-1 text-sm capitalize ${tier === t ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>
									Mark as {t}
								</button>
							))}
						</div>
					</div>

					{mode === "paste" ? (
						<textarea
							value={text}
							onChange={(e) => setText(e.target.value)}
							rows={10}
							spellCheck={false}
							placeholder={PLACEHOLDER}
							className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 font-mono text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
						/>
					) : (
						<div className="space-y-3">
							<input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); }} />
							<div className="flex items-center gap-3">
								<Button type="button" size="sm" variant="secondary" icon={<UploadSimpleIcon size={14} />} onClick={() => fileRef.current?.click()}>
									{csv ? "Choose another file" : "Choose CSV file"}
								</Button>
								{csv && <span className="text-xs text-kumo-subtle truncate">{csv.name} · {csv.rows.length} contacts{csv.skipped ? `, ${csv.skipped} rows skipped` : ""}</span>}
							</div>
							<p className="text-xs text-kumo-subtle">Needs an <code>Email</code> column. <code>Name</code>, <code>Country</code>, <code>Created Date</code> (stored as paid date) and <code>Customer ID</code> are recognised; other columns are kept as extra fields.</p>
							{csv && (
								<div className="rounded-md border border-kumo-line overflow-x-auto max-h-56 overflow-y-auto">
									<table className="w-full text-xs">
										<thead className="bg-kumo-tint/50 text-kumo-subtle sticky top-0">
											<tr>
												<th className="px-2 py-1.5 text-left font-medium">Email</th>
												<th className="px-2 py-1.5 text-left font-medium">Name</th>
												{metadataKeys.map((k) => <th key={k} className="px-2 py-1.5 text-left font-medium">{k}</th>)}
											</tr>
										</thead>
										<tbody>
											{csv.rows.slice(0, 50).map((r) => (
												<tr key={r.email} className="border-t border-kumo-line">
													<td className="px-2 py-1 text-kumo-default whitespace-nowrap">{r.email}</td>
													<td className="px-2 py-1 text-kumo-strong whitespace-nowrap">{r.name ?? ""}</td>
													{metadataKeys.map((k) => <td key={k} className="px-2 py-1 text-kumo-subtle whitespace-nowrap">{r.metadata[k] ?? ""}</td>)}
												</tr>
											))}
										</tbody>
									</table>
									{csv.rows.length > 50 && <div className="px-2 py-1 text-xs text-kumo-subtle border-t border-kumo-line">… and {csv.rows.length - 50} more</div>}
								</div>
							)}
						</div>
					)}

					<Input label="Product (optional)" size="sm" placeholder="e.g. Timeline Visualizer Pro — saved on every imported contact" value={product} onChange={(e) => setProduct(e.target.value)} />

					<div className="flex items-center justify-between">
						<span className="text-xs text-kumo-subtle">{rows.length} contact{rows.length === 1 ? "" : "s"} ready</span>
						<div className="flex gap-2">
							<Button type="button" variant="ghost" size="sm" onClick={close} disabled={bulk.isPending}>Cancel</Button>
							<Button type="button" variant="primary" size="sm" onClick={submit} loading={bulk.isPending} disabled={rows.length === 0}>Import {rows.length || ""} as {tier}</Button>
						</div>
					</div>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
