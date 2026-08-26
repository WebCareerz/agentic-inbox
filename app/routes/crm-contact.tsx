// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowSquareOutIcon, ArrowDownLeftIcon, ArrowUpRightIcon, CheckIcon, ChatsCircleIcon, CrownSimpleIcon, UserIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import { formatListDate } from "shared/dates";
import CompleteTaskDialog, { RESOLUTION_OPTIONS } from "~/components/crm/CompleteTaskDialog";
import TierBadge from "~/components/crm/TierBadge";
import { taskEmailLink, useCrmContact, useUpdateContact } from "~/queries/crm";
import type { CrmActivity, CrmTask } from "~/types";

interface ActivityRef { mailboxId?: string | null; emailId?: string | null; threadId?: string | null }

function parseRef(ref: string): ActivityRef {
	try { return JSON.parse(ref) as ActivityRef; } catch { return {}; }
}

function emailLink(ref: ActivityRef): string | null {
	if (!ref.mailboxId || !ref.emailId) return null;
	return `/mailbox/${encodeURIComponent(ref.mailboxId)}/emails/inbox?email=${encodeURIComponent(ref.emailId)}`;
}

type TimelineItem =
	| { kind: "thread"; key: string; at: string; subject: string; messages: (CrmActivity & { parsed: ActivityRef })[] }
	| { kind: "single"; key: string; at: string; activity: CrmActivity; parsed: ActivityRef };

/** Merge email_in / email_out activities that belong to the same thread into one conversation card. */
function buildTimeline(activities: CrmActivity[]): TimelineItem[] {
	const threads = new Map<string, TimelineItem & { kind: "thread" }>();
	const items: TimelineItem[] = [];
	for (const a of activities) {
		const parsed = parseRef(a.ref);
		if ((a.type === "email_in" || a.type === "email_out") && (parsed.threadId || parsed.emailId)) {
			const key = `thread:${parsed.threadId || parsed.emailId}`;
			let t = threads.get(key);
			if (!t) {
				t = { kind: "thread", key, at: a.created_at, subject: "", messages: [] };
				threads.set(key, t);
				items.push(t);
			}
			t.messages.push({ ...a, parsed });
			if (a.created_at > t.at) t.at = a.created_at;
		} else {
			items.push({ kind: "single", key: a.id, at: a.created_at, activity: a, parsed });
		}
	}
	for (const t of threads.values()) {
		t.messages.sort((x, y) => (x.created_at < y.created_at ? -1 : 1));
		const first = t.messages.find((m) => m.type === "email_in") ?? t.messages[0];
		t.subject = first.summary.replace(/^(Received|Sent):\s*/, "").replace(/^(re|fwd?):\s*/i, "").trim() || "(no subject)";
	}
	return items.sort((x, y) => (x.at > y.at ? -1 : 1));
}

export default function CrmContactDetail() {
	const { contactId } = useParams<{ contactId: string }>();
	const toast = useKumoToastManager();
	const { data, isLoading } = useCrmContact(contactId);
	const update = useUpdateContact();
	const [name, setName] = useState("");
	const [notes, setNotes] = useState("");
	const [completing, setCompleting] = useState<CrmTask | null>(null);

	useEffect(() => {
		if (data) {
			setName(data.contact.name ?? "");
			setNotes(data.contact.notes ?? "");
		}
	}, [data]);

	if (isLoading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (!data) return <div className="text-sm text-kumo-subtle">Contact not found.</div>;
	const { contact, tasks, activities } = data;
	const timeline = buildTimeline(activities);

	const setTier = async (tier: "paid" | "free" | "unknown") => {
		await update.mutateAsync({ id: contact.id, tier });
		toast.add({ title: `Marked as ${tier}` });
	};
	const saveDetails = async () => {
		await update.mutateAsync({ id: contact.id, name: name.trim() || null, notes: notes.trim() || null });
		toast.add({ title: "Contact saved" });
	};

	const dirty = (name.trim() || null) !== (contact.name ?? null) || (notes.trim() || null) !== (contact.notes ?? null);
	const openTasks = tasks.filter((t) => t.status === "open");
	const closedTasks = tasks.filter((t) => t.status !== "open");

	return (
		<div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
			<div className="space-y-4">
				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<h2 className="text-lg font-semibold text-kumo-default truncate">{contact.name || contact.email}</h2>
							<p className="text-sm text-kumo-subtle truncate">{contact.email}</p>
						</div>
						<TierBadge tier={contact.tier} size="md" />
					</div>
					<div className="mt-4 flex items-center gap-2">
						<Button size="sm" variant={contact.tier === "paid" ? "primary" : "secondary"} icon={<CrownSimpleIcon size={14} />} onClick={() => setTier("paid")} disabled={update.isPending || contact.tier === "paid"}>Paid</Button>
						<Button size="sm" variant={contact.tier === "free" ? "primary" : "secondary"} icon={<UserIcon size={14} />} onClick={() => setTier("free")} disabled={update.isPending || contact.tier === "free"}>Free</Button>
						{contact.tier !== "unknown" && (
							<Button size="sm" variant="ghost" onClick={() => setTier("unknown")} disabled={update.isPending}>Clear</Button>
						)}
					</div>
					<dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
						<dt className="text-kumo-subtle">Kind</dt><dd className="capitalize text-kumo-default">{contact.email_kind}</dd>
						<dt className="text-kumo-subtle">Source</dt><dd className="capitalize text-kumo-default">{contact.source}</dd>
						<dt className="text-kumo-subtle">First seen</dt><dd className="text-kumo-default">{formatListDate(contact.first_seen_at)}</dd>
						<dt className="text-kumo-subtle">Last contact</dt><dd className="text-kumo-default">{contact.last_contact_at ? formatListDate(contact.last_contact_at) : "—"}</dd>
					</dl>
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5 space-y-3">
					<Input label="Name" size="sm" value={name} onChange={(e) => setName(e.target.value)} />
					<div>
						<label className="text-sm font-medium text-kumo-default mb-1.5 block">Notes</label>
						<textarea
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							rows={5}
							className="w-full rounded-md border border-kumo-line bg-kumo-base p-2 text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-link"
							placeholder="Plan, product, anything worth remembering"
						/>
					</div>
					<div className="flex justify-end">
						<Button size="sm" variant="primary" onClick={saveDetails} loading={update.isPending} disabled={!dirty}>Save</Button>
					</div>
				</div>
			</div>

			<div className="space-y-4">
				<section className="rounded-xl border border-kumo-line bg-kumo-base">
					<h3 className="px-5 py-3 text-sm font-semibold text-kumo-default border-b border-kumo-line">Open tasks ({openTasks.length})</h3>
					{openTasks.length === 0 ? (
						<p className="px-5 py-4 text-sm text-kumo-subtle">Nothing open.</p>
					) : (
						<ul className="divide-y divide-kumo-line">
							{openTasks.map((t) => <TaskRow key={t.id} task={t} onComplete={() => setCompleting(t)} />)}
						</ul>
					)}
				</section>
				{closedTasks.length > 0 && (
					<section className="rounded-xl border border-kumo-line bg-kumo-base">
						<h3 className="px-5 py-3 text-sm font-semibold text-kumo-default border-b border-kumo-line">Closed tasks ({closedTasks.length})</h3>
						<ul className="divide-y divide-kumo-line">
							{closedTasks.map((t) => <TaskRow key={t.id} task={t} />)}
						</ul>
					</section>
				)}
				<section className="rounded-xl border border-kumo-line bg-kumo-base">
					<h3 className="px-5 py-3 text-sm font-semibold text-kumo-default border-b border-kumo-line">Timeline</h3>
					{timeline.length === 0 ? (
						<p className="px-5 py-4 text-sm text-kumo-subtle">No activity yet.</p>
					) : (
						<ul className="divide-y divide-kumo-line">
							{timeline.map((item) =>
								item.kind === "thread" ? (
									<li key={item.key} className="px-5 py-3 text-sm">
										<div className="flex items-center gap-2 min-w-0">
											<ChatsCircleIcon size={16} className="text-kumo-subtle shrink-0" />
											<span className="font-medium text-kumo-default truncate">{item.subject}</span>
											<span className="text-xs text-kumo-subtle shrink-0">{item.messages.length} message{item.messages.length === 1 ? "" : "s"} · {formatListDate(item.at)}</span>
										</div>
										<ul className="mt-1.5 ml-6 space-y-1">
											{item.messages.map((m) => {
												const link = emailLink(m.parsed);
												const label = m.type === "email_in" ? "Received" : "Sent";
												const Icon = m.type === "email_in" ? ArrowDownLeftIcon : ArrowUpRightIcon;
												const inner = (
													<span className="inline-flex items-center gap-1.5 text-xs">
														<Icon size={12} className={m.type === "email_in" ? "text-kumo-brand" : "text-kumo-subtle"} />
														<span className="text-kumo-default">{label}</span>
														<span className="text-kumo-subtle">· {formatListDate(m.created_at)}</span>
													</span>
												);
												return (
													<li key={m.id}>
														{link ? (
															<RouterLink to={link} className="no-underline hover:underline inline-flex items-center gap-1">
																{inner}<ArrowSquareOutIcon size={11} className="text-kumo-subtle" />
															</RouterLink>
														) : inner}
													</li>
												);
											})}
										</ul>
									</li>
								) : (
									<li key={item.key} className="px-5 py-2.5 text-sm">
										{(() => {
											const link = emailLink(item.parsed);
											const body = (
												<>
													<div className="text-kumo-default">{item.activity.summary}</div>
													<div className="text-xs text-kumo-subtle">{item.activity.type.replace(/_/g, " ")} · {formatListDate(item.activity.created_at)}</div>
												</>
											);
											return link ? <RouterLink to={link} className="block no-underline hover:underline">{body}</RouterLink> : body;
										})()}
									</li>
								),
							)}
						</ul>
					)}
				</section>
			</div>

			<CompleteTaskDialog task={completing} onClose={() => setCompleting(null)} />
		</div>
	);
}

function TaskRow({ task, onComplete }: { task: CrmTask; onComplete?: () => void }) {
	const link = taskEmailLink(task);
	const resolution = RESOLUTION_OPTIONS.find((o) => o.value === task.resolution_type)?.label;
	return (
		<li className="flex items-center gap-3 px-5 py-2.5">
			<div className="flex-1 min-w-0">
				<div className={`text-sm truncate ${task.status === "open" ? "text-kumo-default" : "text-kumo-subtle line-through"}`}>{task.title}</div>
				<div className="text-xs text-kumo-subtle">
					{formatListDate(task.created_at)}
					{task.status === "done" && resolution ? ` · ${resolution}${task.resolution_note ? `: ${task.resolution_note}` : ""}` : ""}
					{task.status === "cancelled" ? " · cancelled" : ""}
				</div>
			</div>
			{link && (
				<RouterLink to={link} className="inline-flex items-center justify-center h-7 w-7 rounded-md text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default" aria-label="Open email">
					<ArrowSquareOutIcon size={15} />
				</RouterLink>
			)}
			{onComplete && <Button size="xs" variant="primary" icon={<CheckIcon size={13} />} onClick={onComplete}>Done</Button>}
		</li>
	);
}
