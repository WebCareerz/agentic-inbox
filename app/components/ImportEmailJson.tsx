// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button } from "@cloudflare/kumo";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

interface ImportEmailJsonProps {
	/** Applies the pasted JSON to the form. Returns an error message, or null on success. */
	onImport: (raw: string) => string | null;
	disabled?: boolean;
}

const PLACEHOLDER = `{
  "to": "someone@example.com",
  "subject": "Hello",
  "body": "First paragraph\\n\\nSecond paragraph"
}`;

/** Collapsible "Import JSON" section for the compose form. */
export default function ImportEmailJson({ onImport, disabled }: ImportEmailJsonProps) {
	const [open, setOpen] = useState(false);
	const [raw, setRaw] = useState("");
	const [error, setError] = useState<string | null>(null);

	const apply = () => {
		const err = onImport(raw);
		setError(err);
		if (!err) {
			setRaw("");
			setOpen(false);
		}
	};

	if (!open) {
		return (
			<Button
				type="button"
				variant="ghost"
				size="sm"
				icon={<DownloadSimpleIcon size={14} />}
				onClick={() => setOpen(true)}
				disabled={disabled}
			>
				Import JSON
			</Button>
		);
	}

	return (
		<div className="rounded-md border border-kumo-line bg-kumo-tint/40 p-3 space-y-2">
			<div className="text-xs text-kumo-subtle">
				Paste a JSON object with <code>to</code>, <code>subject</code> and <code>body</code> (optional <code>cc</code> / <code>bcc</code>). Other fields are ignored.
			</div>
			{error && <Banner variant="error" text={error} />}
			<textarea
				value={raw}
				onChange={(e) => setRaw(e.target.value)}
				placeholder={PLACEHOLDER}
				rows={8}
				spellCheck={false}
				className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 font-mono text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
			/>
			<div className="flex items-center justify-end gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => { setOpen(false); setError(null); }}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onClick={apply}
					disabled={!raw.trim() || disabled}
				>
					Apply
				</Button>
			</div>
		</div>
	);
}
