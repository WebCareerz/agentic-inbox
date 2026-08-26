// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { CheckSquareIcon, CrownSimpleIcon } from "@phosphor-icons/react";

export const TIER_LABELS: Record<string, string> = { paid: "Paid", free: "Free", unknown: "Unclassified" };

/** Compact tier marker used in email lists, thread headers and CRM pages. */
export default function TierBadge({ tier, size = "sm" }: { tier?: string | null; size?: "sm" | "md" }) {
	if (!tier || tier === "unknown") return null;
	const base = size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[10px]";
	if (tier === "paid") {
		return (
			<span className={`inline-flex items-center gap-1 rounded-full bg-amber-500 text-white font-semibold uppercase tracking-wide shrink-0 ${base}`}>
				<CrownSimpleIcon size={size === "md" ? 12 : 10} weight="fill" />
				Paid
			</span>
		);
	}
	return (
		<span className={`inline-flex items-center rounded-full border border-kumo-line bg-kumo-tint text-kumo-subtle font-medium uppercase tracking-wide shrink-0 ${base}`}>
			{TIER_LABELS[tier] ?? tier}
		</span>
	);
}

/** Small marker for threads that have an open CRM task. */
export function OpenTaskMarker({ size = 14 }: { size?: number }) {
	return (
		<span className="inline-flex items-center text-kumo-brand shrink-0" title="Open task">
			<CheckSquareIcon size={size} weight="fill" />
		</span>
	);
}
