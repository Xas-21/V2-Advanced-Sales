/**
 * Role-based permissions for Advanced Sales.
 * Users may override role defaults via permissionGrants / permissionRevokes (string[]).
 */

export const USER_ROLE_OPTIONS = [
    'Admin',
    'General Manager',
    'Head of Sales',
    'Sales Manager',
    'Sales Executive',
    'Sales Coordinator',
] as const;

export type UserRoleId = (typeof USER_ROLE_OPTIONS)[number];

export const ALL_PERMISSION_IDS = [
    'reports.access',
    'tasks.deleteAny',
    'accounts.delete',
    'contracts.delete',
    'requests.delete',
    'requests.deletePayments',
    'crm.deleteCalls',
    'accounts.timelineManual',
    'mutate.operational',
    'settings.admin',
    'settings.globalStaff',
] as const;

export type PermissionId = (typeof ALL_PERMISSION_IDS)[number];

export const PERMISSION_LABELS: Record<PermissionId, string> = {
    'reports.access': 'Access Reports page',
    'tasks.deleteAny': 'Delete any task (To-Do)',
    'accounts.delete': 'Delete accounts',
    'contracts.delete': 'Delete contracts',
    'requests.delete': 'Delete requests',
    'requests.deletePayments': 'Delete request payment / deposit lines',
    'crm.deleteCalls': 'Delete sales calls',
    'accounts.timelineManual': 'Edit / delete manual timeline activities',
    'mutate.operational': 'Create & edit operational data (not view-only)',
    'settings.admin': 'Settings: Properties, Configurations, property tools',
    'settings.globalStaff': 'Global Staff Management (all users)',
};

function permSet(...ids: PermissionId[]): Set<PermissionId> {
    return new Set(ids);
}

/** Defaults before grants/revokes. Admin uses a shortcut in getEffectivePermissionSet. */
export const ROLE_DEFAULTS: Record<UserRoleId, Set<PermissionId>> = {
    Admin: permSet(...ALL_PERMISSION_IDS),
    'General Manager': permSet('reports.access'),
    'Head of Sales': permSet(
        'mutate.operational',
        'reports.access',
        'tasks.deleteAny',
        'accounts.delete',
        'contracts.delete',
        'requests.delete',
        'requests.deletePayments',
        'crm.deleteCalls',
        'accounts.timelineManual'
    ),
    'Sales Manager': permSet('mutate.operational'),
    'Sales Executive': permSet('mutate.operational'),
    'Sales Coordinator': permSet('mutate.operational'),
};

export function normalizeUserRole(user: any): UserRoleId {
    const r = String(user?.role ?? '').trim().toLowerCase();
    if (!r) return 'Sales Executive';
    if (r === 'admin' || r === 'administrator') return 'Admin';
    if (r.includes('general manager') || r === 'gm') return 'General Manager';
    if (
        r.includes('head of sales') ||
        r === 'hod' ||
        (r.includes('head') && r.includes('sales'))
    ) {
        return 'Head of Sales';
    }
    if (r.includes('sales manager')) return 'Sales Manager';
    if (r.includes('sales coordinator')) return 'Sales Coordinator';
    if (r.includes('sales executive')) return 'Sales Executive';
    if (r === 'sales team' || r === 'staff') return 'Sales Executive';
    if (r.includes('sales manager') || r === 'sales manager') return 'Sales Manager';
    return 'Sales Executive';
}

export function getEffectivePermissionSet(user: any): Set<PermissionId> {
    const role = normalizeUserRole(user);
    if (role === 'Admin') {
        return new Set(ALL_PERMISSION_IDS);
    }
    const base = ROLE_DEFAULTS[role];
    const out = new Set(base);
    const grants: string[] = Array.isArray(user?.permissionGrants) ? user.permissionGrants : [];
    const revokes: string[] = Array.isArray(user?.permissionRevokes) ? user.permissionRevokes : [];
    for (const g of grants) {
        if ((ALL_PERMISSION_IDS as readonly string[]).includes(g)) out.add(g as PermissionId);
    }
    for (const rv of revokes) {
        out.delete(rv as PermissionId);
    }
    return out;
}

export function can(user: any, perm: PermissionId): boolean {
    return getEffectivePermissionSet(user).has(perm);
}

export function isSystemAdmin(user: any): boolean {
    return normalizeUserRole(user) === 'Admin';
}

/** Legacy name: only true system admins (tag / global admin UI). */
export function isAdminUser(user: any): boolean {
    return isSystemAdmin(user);
}

export function canAccessReports(user: any): boolean {
    return can(user, 'reports.access');
}

export function canDeleteTasks(user: any): boolean {
    return can(user, 'tasks.deleteAny');
}

export function canDeleteAccounts(user: any): boolean {
    return can(user, 'accounts.delete');
}

export function canDeleteContracts(user: any): boolean {
    return can(user, 'contracts.delete');
}

export function canDeleteRequests(user: any): boolean {
    return can(user, 'requests.delete');
}

export function canDeleteRequestPayments(user: any): boolean {
    return can(user, 'requests.deletePayments');
}

export function canDeleteSalesCalls(user: any): boolean {
    return can(user, 'crm.deleteCalls');
}

export function canManageManualTimeline(user: any): boolean {
    return can(user, 'accounts.timelineManual');
}

export function canMutateOperational(user: any): boolean {
    return can(user, 'mutate.operational');
}

export function canAccessSettingsAdmin(user: any): boolean {
    return can(user, 'settings.admin');
}

export function canAccessGlobalStaff(user: any): boolean {
    return can(user, 'settings.globalStaff');
}

/**
 * When saving a user from admin UI: compute grant/revoke arrays from role + desired set.
 */
export function diffPermissionsAgainstRole(
    roleDisplay: string,
    selected: Set<PermissionId>
): { permissionGrants: PermissionId[]; permissionRevokes: PermissionId[] } {
    const role = normalizeUserRole({ role: roleDisplay });
    if (role === 'Admin') {
        return { permissionGrants: [], permissionRevokes: [] };
    }
    const defaults = ROLE_DEFAULTS[role];
    const grants: PermissionId[] = [];
    const revokes: PermissionId[] = [];
    for (const p of ALL_PERMISSION_IDS) {
        const d = defaults.has(p);
        const s = selected.has(p);
        if (d && !s) revokes.push(p);
        if (!d && s) grants.push(p);
    }
    return { permissionGrants: grants, permissionRevokes: revokes };
}

export function getDefaultPermissionSetForRoleDisplay(roleDisplay: string): Set<PermissionId> {
    const role = normalizeUserRole({ role: roleDisplay });
    if (role === 'Admin') return new Set(ALL_PERMISSION_IDS);
    return new Set(ROLE_DEFAULTS[role]);
}
