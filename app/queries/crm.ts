// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { CrmTask } from "~/types";

export const crmKeys = {
	all: ["crm"] as const,
	contacts: (params: Record<string, string>) => ["crm", "contacts", params] as const,
	contact: (id: string) => ["crm", "contact", id] as const,
	tasks: (params: Record<string, string>) => ["crm", "tasks", params] as const,
};

/** Invalidate CRM data and email lists (badges/task flags live on email rows). */
function useInvalidateCrm() {
	const qc = useQueryClient();
	return () => {
		qc.invalidateQueries({ queryKey: crmKeys.all });
		qc.invalidateQueries({ queryKey: ["emails"] });
	};
}

export function useCrmContacts(params: Record<string, string>) {
	return useQuery({ queryKey: crmKeys.contacts(params), queryFn: () => api.crmListContacts(params) });
}

export function useCrmContact(id: string | undefined) {
	return useQuery({ queryKey: crmKeys.contact(id ?? ""), queryFn: () => api.crmGetContact(id!), enabled: !!id });
}

export function useCrmTasks(params: Record<string, string>) {
	return useQuery({ queryKey: crmKeys.tasks(params), queryFn: () => api.crmListTasks(params) });
}

export function useUpsertContact() {
	const invalidate = useInvalidateCrm();
	return useMutation({
		mutationFn: (body: { email: string; tier?: string; name?: string | null; notes?: string | null; tags?: string[] }) => api.crmUpsertContact(body),
		onSuccess: invalidate,
	});
}

export function useUpdateContact() {
	const invalidate = useInvalidateCrm();
	return useMutation({
		mutationFn: ({ id, ...body }: { id: string; tier?: string; name?: string | null; notes?: string | null; tags?: string[] }) => api.crmUpdateContact(id, body),
		onSuccess: invalidate,
	});
}

export function useBulkUpsertContacts() {
	const invalidate = useInvalidateCrm();
	return useMutation({ mutationFn: (contacts: Parameters<typeof api.crmBulkUpsertContacts>[0]) => api.crmBulkUpsertContacts(contacts), onSuccess: invalidate });
}

export function useImportFromMailboxes() {
	const invalidate = useInvalidateCrm();
	return useMutation({ mutationFn: (body: { includeCorporate?: boolean }) => api.crmImportFromMailboxes(body), onSuccess: invalidate });
}

export function useCreateTask() {
	const invalidate = useInvalidateCrm();
	return useMutation({
		mutationFn: (body: Parameters<typeof api.crmCreateTask>[0]) => api.crmCreateTask(body),
		onSuccess: invalidate,
	});
}

export function useUpdateTask() {
	const invalidate = useInvalidateCrm();
	return useMutation({
		mutationFn: ({ id, ...body }: { id: string } & Parameters<typeof api.crmUpdateTask>[1]) => api.crmUpdateTask(id, body),
		onSuccess: invalidate,
	});
}

export function useDeleteTask() {
	const invalidate = useInvalidateCrm();
	return useMutation({ mutationFn: (id: string) => api.crmDeleteTask(id), onSuccess: invalidate });
}

export function taskEmailLink(task: CrmTask): string | null {
	if (!task.source_mailbox_id || !task.source_email_id) return null;
	return `/mailbox/${encodeURIComponent(task.source_mailbox_id)}/emails/inbox?email=${encodeURIComponent(task.source_email_id)}`;
}
