// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { formatListDate } from "shared/dates";

/** Friendly labels for well-known metadata keys; anything else is shown with its raw key. */
const LABELS: Record<string, string> = {
	country: "Country",
	checkout_at: "Checkout at",
	paid_at: "Paid at",
	customer_id: "Customer ID",
	product: "Product",
	amount_paid: "Amount paid",
	total_paid: "Total paid",
	payments_count: "Payments",
	payment_method: "Payment method",
	transaction_id: "Transaction ID",
	order_no: "Order no.",
	import_source: "Imported from",
};
const ORDER = ["product", "amount_paid", "paid_at", "payment_method", "payments_count", "total_paid", "country", "checkout_at", "order_no", "transaction_id", "customer_id", "import_source"];

export function parseMetadata(value: unknown): Record<string, unknown> {
	if (!value) return {};
	if (typeof value === "string") {
		try { const v = JSON.parse(value); return v && typeof v === "object" ? (v as Record<string, unknown>) : {}; } catch { return {}; }
	}
	return typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function formatValue(key: string, value: unknown): string {
	if (value == null || value === "") return "—";
	const str = String(value);
	if (key.endsWith("_at") && !Number.isNaN(Date.parse(str))) return formatListDate(str);
	return str;
}

/** Definition list of a contact's metadata (payment info etc.). Renders nothing when empty. */
export default function ContactMetadata({ metadata, className = "" }: { metadata: unknown; className?: string }) {
	const data = parseMetadata(metadata);
	const keys = [...ORDER.filter((k) => k in data), ...Object.keys(data).filter((k) => !ORDER.includes(k)).sort()];
	if (keys.length === 0) return null;
	return (
		<dl className={`grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${className}`}>
			{keys.map((k) => (
				<div key={k} className="contents">
					<dt className="text-kumo-subtle">{LABELS[k] ?? k.replace(/_/g, " ")}</dt>
					<dd className="text-kumo-default break-all">{formatValue(k, data[k])}</dd>
				</div>
			))}
		</dl>
	);
}
