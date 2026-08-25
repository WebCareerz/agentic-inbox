// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { parseImportedEmails } from "~/lib/import-email";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";

interface ImportDraftsButtonProps {
	mailboxId: string;
}

/**
 * "Import drafts" button: pick a JSON file (array of { to, subject, body, ... })
 * and create one draft per item in the current mailbox.
 */
export default function ImportDraftsButton({ mailboxId }: ImportDraftsButtonProps) {
	const toastManager = useKumoToastManager();
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);

	const handleFile = async (file: File) => {
		setIsImporting(true);
		try {
			const batch = parseImportedEmails(await file.text());
			let created = 0;
			const failed = [...batch.errors];
			for (const [i, email] of batch.emails.entries()) {
				try {
					await api.saveDraft(mailboxId, {
						to: email.to,
						cc: email.cc || undefined,
						bcc: email.bcc || undefined,
						subject: email.subject,
						body: email.body,
					});
					created++;
				} catch (err: unknown) {
					failed.push({ index: i, message: err instanceof Error ? err.message : "Failed to save draft." });
				}
			}
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
			queryClient.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });

			if (failed.length === 0) {
				toastManager.add({ title: `Created ${created} draft${created === 1 ? "" : "s"}` });
			} else {
				const detail = failed.map((f) => `#${f.id ?? f.index + 1}: ${f.message}`).join("; ");
				toastManager.add({
					title: `Created ${created} draft${created === 1 ? "" : "s"}, ${failed.length} skipped`,
					description: detail,
					variant: created > 0 ? "warning" : "error",
				});
			}
		} catch (err: unknown) {
			toastManager.add({
				title: err instanceof Error ? err.message : "Failed to import drafts.",
				variant: "error",
			});
		} finally {
			setIsImporting(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	};

	return (
		<>
			<input
				ref={inputRef}
				type="file"
				accept=".json,application/json"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) void handleFile(file);
				}}
			/>
			<Tooltip content="Import drafts from JSON file" side="bottom" asChild>
				<Button
					variant="ghost"
					shape="square"
					size="sm"
					icon={<UploadSimpleIcon size={18} />}
					loading={isImporting}
					disabled={isImporting}
					onClick={() => inputRef.current?.click()}
					aria-label="Import drafts from JSON file"
				/>
			</Tooltip>
		</>
	);
}
