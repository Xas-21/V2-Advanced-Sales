/** Re-exports permission helpers used by CRM / Accounts (tag admin = system admin only). */
export {
    isAdminUser,
    isSystemAdmin,
    can,
    canManageManualTimeline,
    canDeleteAccounts,
} from './userPermissions';
