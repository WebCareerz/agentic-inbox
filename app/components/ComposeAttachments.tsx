// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { PaperclipIcon, XIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import { formatBytes } from "~/lib/utils";

/**
 * Cloudflare Email Service caps a message at 5 MiB including attachments.
 * Base64 inflates payloads by ~33%, so keep raw file bytes under ~3.5 MB.
 */
export const MAX_ATTACHMENTS_BYTES = 3.5 * 1024 * 1024;

interface ComposeAttachmentsProps {
	attachments: File[];
	onAdd: (files: File[]) => string | null;
	onRemove: (index: number) => void;
	disabled?: boolean;
	onError?: (message: string) => void;
}

/** "Attach" button + list of selected files for the compose form. */
export default function ComposeAttachments({ attachments, onAdd, onRemove, disabled, onError }: ComposeAttachmentsProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const total = attachments.reduce((sum, f) => sum + f.size, 0);

	return (
		<div className="space-y-2">
			<input
				ref={inputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => {
					const files = Array.from(e.target.files ?? []);
					if (files.length) {
						const err = onAdd(files);
						if (err) onError?.(err);
					}
					e.target.value = "";
				}}
			/>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					icon={<PaperclipIcon size={14} />}
					onClick={() => inputRef.current?.click()}
					disabled={disabled}
				>
					Attach
				</Button>
				{attachments.length > 0 && (
					<span className="text-xs text-kumo-subtle">
						{attachments.length} file{attachments.length === 1 ? "" : "s"} · {formatBytes(total)} / {formatBytes(MAX_ATTACHMENTS_BYTES)}
					</span>
				)}
			</div>
			{attachments.length > 0 && (
				<ul className="flex flex-wrap gap-2">
					{attachments.map((file, i) => (
						<li
							key={`${file.name}-${file.size}-${i}`}
							className="flex items-center gap-1.5 rounded-md border border-kumo-line bg-kumo-tint/40 px-2 py-1 text-xs text-kumo-default max-w-full"
						>
							<PaperclipIcon size={12} className="text-kumo-subtle shrink-0" />
							<span className="truncate max-w-[14rem]" title={file.name}>{file.name}</span>
							<span className="text-kumo-subtle shrink-0">{formatBytes(file.size)}</span>
							<button
								type="button"
								onClick={() => onRemove(i)}
								disabled={disabled}
								className="ml-0.5 text-kumo-subtle hover:text-kumo-default shrink-0"
								aria-label={`Remove ${file.name}`}
							>
								<XIcon size={12} />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
