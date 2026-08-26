// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface EncodedAttachment {
	content: string; // base64
	filename: string;
	type: string;
	disposition: "attachment";
}

export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.slice(result.indexOf(",") + 1)); // strip data:*;base64, prefix
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

/** Encode selected files into the API attachment payload. */
export async function encodeAttachments(files: File[]): Promise<EncodedAttachment[]> {
	return Promise.all(files.map(async (file) => ({
		content: await fileToBase64(file),
		filename: file.name,
		type: file.type || "application/octet-stream",
		disposition: "attachment" as const,
	})));
}
