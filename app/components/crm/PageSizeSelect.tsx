// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useState } from "react";

export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** Per-list page size, remembered in localStorage under `key`. */
export function usePageSize(key: string, fallback: PageSize = 20): [PageSize, (n: PageSize) => void] {
	// Start with the fallback on both server and client (no hydration mismatch), then apply the saved value after mount.
	const [size, setSize] = useState<PageSize>(fallback);
	useEffect(() => {
		try {
			const v = Number(localStorage.getItem(key));
			if ((PAGE_SIZES as readonly number[]).includes(v)) setSize(v as PageSize);
		} catch { /* ignore */ }
	}, [key]);
	const update = (n: PageSize) => {
		setSize(n);
		try { localStorage.setItem(key, String(n)); } catch { /* ignore */ }
	};
	return [size, update];
}

export default function PageSizeSelect({ value, onChange }: { value: PageSize; onChange: (n: PageSize) => void }) {
	return (
		<label className="flex items-center gap-1.5 text-xs text-kumo-subtle">
			Per page
			<select
				value={value}
				onChange={(e) => onChange(Number(e.target.value) as PageSize)}
				className="rounded-md border border-kumo-line bg-kumo-base px-2 py-1 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
			>
				{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
			</select>
		</label>
	);
}
