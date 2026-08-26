// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { CaretLeftIcon, CheckSquareIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { NavLink, Outlet, Link as RouterLink } from "react-router";

const NAV = [
	{ to: "/crm", label: "Contacts", icon: <UsersThreeIcon size={16} />, end: true },
	{ to: "/crm/tasks", label: "Tasks", icon: <CheckSquareIcon size={16} />, end: false },
];

/** Layout for the CRM section: header + sub-navigation. */
export default function CrmLayout() {
	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
				<div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
					<div>
						<RouterLink to="/" className="inline-flex items-center gap-1 text-sm text-kumo-subtle hover:text-kumo-default no-underline">
							<CaretLeftIcon size={14} /> Mailboxes
						</RouterLink>
						<h1 className="text-2xl font-bold text-kumo-default mt-1">Customers</h1>
					</div>
					<nav className="flex items-center gap-1 rounded-lg border border-kumo-line bg-kumo-base p-1">
						{NAV.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								end={item.end}
								className={({ isActive }) =>
									`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm no-underline transition-colors ${isActive ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`
								}
							>
								{item.icon}
								{item.label}
							</NavLink>
						))}
					</nav>
				</div>
				<Outlet />
			</div>
		</div>
	);
}
