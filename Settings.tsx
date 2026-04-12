import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie, Legend, LineChart, Line
} from 'recharts';
import {
    Settings as SettingsIcon, Building, BedDouble, DollarSign, Users,
    User, Upload, Save, Edit, Plus, Trash2, X, Check, Mail, Phone, Shield,
    MapPin, Layout, Box, FileText, List, ChevronDown, ChevronRight, Monitor,
    TrendingUp, Calculator, CalendarDays, ChevronLeft, CheckSquare, Zap, CheckCircle2, Download, Clock,
    UserMinus, RefreshCw, Tags, UtensilsCrossed
} from 'lucide-react';
import { apiUrl } from './backendApi';
import {
    loadSegmentsForProperty,
    saveSegmentsForProperty,
    loadAccountTypesForProperty,
    saveAccountTypesForProperty,
} from './propertyTaxonomy';
import {
    loadMealPlansForProperty,
    saveMealPlansForProperty,
    loadEventPackagesForProperty,
    saveEventPackagesForProperty,
    EVENT_PACKAGE_TIMING_OPTIONS,
    type MealPlanEntry,
    type EventPackageEntry,
    type EventPackageTimingId,
} from './propertyMealsPackages';
import {
    USER_ROLE_OPTIONS,
    ALL_PERMISSION_IDS,
    PERMISSION_LABELS,
    normalizeUserRole,
    getEffectivePermissionSet,
    isSystemAdmin,
    ROLE_DEFAULTS,
    type PermissionId,
} from './userPermissions';
import {
    PROFILE_MONTH_LABELS,
    buildProfileActivityLog,
    countCallsInMonth,
    countCallsInYear,
    countOpenPipelineInYmdRange,
    countRequestsInYmdRange,
    filterUserAccounts,
    filterUserCrmLeads,
    monthlySalesCallTarget,
    monthRangeRevenueSeries,
    sumRevenueInYmdRange,
    taskAssignedToUser,
    ymdBoundsForCalendarMonth,
    ymdBoundsForCalendarYear,
} from './userProfileMetrics';
import { formatCurrencyAmount, resolveCurrencyCode, type CurrencyCode } from './currency';

const USER_MODAL_PERMISSIONS = ALL_PERMISSION_IDS.filter(
    (p) => p !== 'settings.admin' && p !== 'settings.globalStaff'
);

interface SettingsProps {
    theme: any;
    currentUser: any;
    activeProperty?: any;
    sharedRequests?: any[];
    accounts?: any[];
    crmLeads?: Record<string, any[]>;
    tasks?: any[];
    onOpenTasks?: () => void;
    currency?: CurrencyCode;
}

// Mock Data
const initialProperties: any[] = [];

const initialRoomTypes: any[] = [];

const initialVenues: any[] = [];

const initialUsers: any[] = [];

const defaultTaxesForProperty = (propertyId: string) => [
    { id: 'vat', label: 'VAT (Value Added Tax)', rate: 15, scope: { accommodation: true, transport: true, foodAndBeverage: true, events: true }, propertyId },
    { id: 'muni', label: 'Municipality Fee', rate: 10, scope: { accommodation: true, transport: false, foodAndBeverage: false, events: true }, propertyId },
    { id: 'service', label: 'Service Fee', rate: 12, scope: { accommodation: true, transport: false, foodAndBeverage: true, events: false }, propertyId },
];

export default function Settings({
    theme,
    currentUser,
    activeProperty,
    sharedRequests = [],
    accounts = [],
    crmLeads = {},
    tasks = [],
    onOpenTasks,
    currency = 'SAR',
}: SettingsProps) {
    const colors = theme.colors;
    const selectedCurrency = resolveCurrencyCode(currency);
    const formatMoney = (amountSar: number, maxFractionDigits = 0) =>
        formatCurrencyAmount(amountSar, selectedCurrency, { maximumFractionDigits: maxFractionDigits });
    const appIsAdmin = isSystemAdmin(currentUser);
    const [activeTab, setActiveTab] = useState('profile');
    const [properties, setProperties] = useState(initialProperties);
    const [roomTypes, setRoomTypes] = useState(initialRoomTypes);
    const [venues, setVenues] = useState(initialVenues);
    const [users, setUsers] = useState(initialUsers);
    const [managingProperty, setManagingProperty] = useState<any>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    useEffect(() => {
        fetch(apiUrl('/api/users'))
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setUsers(data);
            })
            .catch(err => console.error("Error fetching users:", err));

        fetch(apiUrl('/api/properties'))
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setProperties(data);
            })
            .catch(err => console.error("Error fetching properties:", err));
    }, []);

    useEffect(() => {
        if (!appIsAdmin && activeTab !== 'profile') {
            setActiveTab('profile');
        }
    }, [appIsAdmin, activeTab]);

    const [selectedUserForStats, setSelectedUserForStats] = useState<any>(null);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [resetPasswordData, setResetPasswordData] = useState({ current: '', new: '', confirm: '' });

    // Tax Config - Refactored for per-tax scope
    const [taxes, setTaxes] = useState<any[]>([
        { id: 'vat', label: 'VAT (Value Added Tax)', rate: 15, scope: { accommodation: true, transport: true, foodAndBeverage: true, events: true } },
        { id: 'muni', label: 'Municipality Fee', rate: 10, scope: { accommodation: true, transport: false, foodAndBeverage: false, events: true } },
        { id: 'service', label: 'Service Fee', rate: 12, scope: { accommodation: true, transport: false, foodAndBeverage: true, events: false } }
    ]);
    const safeRoomTypes = useMemo(() => (Array.isArray(roomTypes) ? roomTypes : []), [roomTypes]);
    const safeVenues = useMemo(
        () =>
            (Array.isArray(venues) ? venues : []).map((venue: any) => ({
                ...venue,
                shapes: Array.isArray(venue?.shapes) ? venue.shapes : [],
            })),
        [venues]
    );
    const safeTaxes = useMemo(
        () =>
            (Array.isArray(taxes) ? taxes : []).map((tax: any) => ({
                ...tax,
                scope:
                    tax?.scope && typeof tax.scope === 'object'
                        ? tax.scope
                        : { accommodation: false, transport: false, foodAndBeverage: false, events: false },
            })),
        [taxes]
    );

    // Profile Config
    const [userProfile, setUserProfile] = useState({
        name: currentUser?.name || 'Demo User',
        email: currentUser?.email || 'demo@advancedsales.com',
        phone: '+966 50 XXX XXXX',
        title: currentUser?.role || 'Sales Manager',
        property: currentUser?.property || 'Advanced Sales System'
    });

    // Configuration Manager State
    const [configFormType, setConfigFormType] = useState('lead');
    const [formFields, setFormFields] = useState({
        lead: [
            { label: 'Client Name', type: 'Text', required: true },
            { label: 'Booking Source', type: 'Dropdown', required: true },
            { label: 'Expected Revenue', type: 'Currency', required: false },
        ],
        contract: [
            { label: 'Contract Date', type: 'Date', required: true },
            { label: 'Signatory Name', type: 'Text', required: true },
        ],
        request: [
            { label: 'Prefered Floor', type: 'Text', required: false },
        ],
        event: [
            { label: 'Setup Type', type: 'Dropdown', required: true },
        ]
    });

    // Modal & CRUD State
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState<any>(null); // 'property', 'room', 'venue', 'user', 'field'
    const [editingItem, setEditingItem] = useState<any>(null);
    const [modalFormData, setModalFormData] = useState<any>({});

    const openModal = (type: string, item: any = null) => {
        setModalType(type);
        setEditingItem(item);
        if (type === 'user') {
            const userDefaults = {
                name: '',
                username: '',
                email: '',
                propertyId: '',
                role: 'Sales Executive' as string,
                permissionGrants: [] as string[],
                permissionRevokes: [] as string[],
                stats: { yearlyTargets: {} as Record<string, number> },
            };
            if (item) {
                setModalFormData({
                    ...userDefaults,
                    ...item,
                    permissionGrants: Array.isArray(item.permissionGrants) ? [...item.permissionGrants] : [],
                    permissionRevokes: Array.isArray(item.permissionRevokes) ? [...item.permissionRevokes] : [],
                });
            } else {
                setModalFormData({ ...userDefaults });
            }
        } else {
            setModalFormData(item || {});
        }
        setShowModal(true);
    };

    const toggleUserPermission = (perm: PermissionId) => {
        const role = normalizeUserRole({ role: modalFormData.role });
        if (role === 'Admin') return;
        const defaults = ROLE_DEFAULTS[role];
        const defHas = defaults.has(perm);
        const g = [...(modalFormData.permissionGrants || [])];
        const r = [...(modalFormData.permissionRevokes || [])];
        const eff = getEffectivePermissionSet({
            role: modalFormData.role,
            permissionGrants: g,
            permissionRevokes: r,
        });
        const cur = eff.has(perm);
        const next = !cur;
        const strip = (arr: string[], p: string) => arr.filter((x) => x !== p);
        if (defHas === next) {
            setModalFormData({
                ...modalFormData,
                permissionGrants: strip(g, perm),
                permissionRevokes: strip(r, perm),
            });
        } else if (defHas && !next) {
            setModalFormData({
                ...modalFormData,
                permissionGrants: strip(g, perm),
                permissionRevokes: [...strip(r, perm), perm],
            });
        } else {
            setModalFormData({
                ...modalFormData,
                permissionGrants: [...strip(g, perm), perm],
                permissionRevokes: strip(r, perm),
            });
        }
    };

    const handleSave = () => {
        if (modalType === 'property') {
            const isEditing = !!editingItem;
            const propData = isEditing ? { ...editingItem, ...modalFormData } : { ...modalFormData, id: 'P' + Math.random().toString(36).substr(2, 9) };
            
            if (isEditing) {
                setProperties(properties.map(p => p.id === editingItem.id ? propData : p));
            } else {
                setProperties([...properties, propData]);
            }

            fetch(apiUrl('/api/properties'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(propData)
            }).catch(err => console.error("Error saving property:", err));
        } else if (modalType === 'room') {
            const dataToSave = { ...modalFormData, propertyId: managingProperty?.id };
            if (!editingItem && !dataToSave.id) dataToSave.id = 'RT' + Math.random().toString(36).substr(2, 9);
            
            fetch(apiUrl('/api/rooms'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).then(res => res.json()).then(saved => {
                if (editingItem) setRoomTypes(roomTypes.map(r => r.id === editingItem.id ? saved : r));
                else setRoomTypes([...roomTypes, saved]);
            });
        } else if (modalType === 'venue') {
            const dataToSave = { ...modalFormData, propertyId: managingProperty?.id, shapes: modalFormData.shapes || [] };
            if (!editingItem && !dataToSave.id) dataToSave.id = 'V' + Math.random().toString(36).substr(2, 9);
            
            fetch(apiUrl('/api/venues'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            }).then(res => res.json()).then(saved => {
                if (editingItem) setVenues(venues.map(v => v.id === editingItem.id ? saved : v));
                else setVenues([...venues, saved]);
            });
        } else if (modalType === 'user') {
            const isEditing = !!editingItem;
            const userData = isEditing 
                ? { ...editingItem, ...modalFormData } 
                : { ...modalFormData, id: 'U' + Math.random().toString(36).substr(2, 9), status: 'Active' };
            const roleNorm = normalizeUserRole({ role: userData.role });
            if (roleNorm === 'Admin') {
                userData.permissionGrants = [];
                userData.permissionRevokes = [];
            } else {
                userData.permissionGrants = Array.isArray(userData.permissionGrants) ? userData.permissionGrants : [];
                userData.permissionRevokes = Array.isArray(userData.permissionRevokes) ? userData.permissionRevokes : [];
            }
            
            // Optimistic update locally
            if (isEditing) {
                setUsers(users.map(u => u.id === editingItem.id ? userData : u));
            } else {
                setUsers([...users, userData]);
            }
            
            // Persist to backend
            fetch(apiUrl('/api/users'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            }).catch(err => console.error("Error saving user:", err));
        } else if (modalType === 'assignUser') {
            const { propertyId, selectedUserIds } = modalFormData;
            const targetProperty = properties.find(p => p.id === propertyId);
            
            if (targetProperty) {
                const updatedProperty = { ...targetProperty, assignedUserIds: selectedUserIds };
                setProperties(properties.map(p => p.id === propertyId ? updatedProperty : p));

                // Save property to backend
                fetch(apiUrl('/api/properties'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedProperty)
                }).catch(err => console.error("Error saving property assignment:", err));
            }

            // Sync user's propertyId as requested
            selectedUserIds.forEach((uid: string) => {
                const usr = users.find(u => u.id === uid);
                if (usr) {
                    const updatedUser = { ...usr, propertyId: propertyId };
                    // Apply to local state immediately
                    setUsers(prev => prev.map(u => u.id === uid ? updatedUser : u));
                    // Push to backend
                    fetch(apiUrl('/api/users'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedUser)
                    });
                }
            });
        } else if (modalType === 'field') {
            // @ts-ignore
            const currentFields = [...formFields[configFormType]];
            if (editingItem) {
                // @ts-ignore
                const updated = currentFields.map((f, i) => i === editingItem.index ? modalFormData : f);
                setFormFields({ ...formFields, [configFormType]: updated });
            } else {
                // @ts-ignore
                setFormFields({ ...formFields, [configFormType]: [...currentFields, modalFormData] });
            }
        }
        setShowModal(false);
    };

    const handleSaveTaxes = async () => {
        if (!managingProperty) return;
        setSaveStatus('saving');
        try {
            await Promise.all(taxes.map(tax => 
                fetch(apiUrl('/api/taxes'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...tax, propertyId: managingProperty.id })
                })
            ));
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (err) {
            console.error("Error saving taxes:", err);
            setSaveStatus('error');
        }
    };

    const handleDelete = (type: string, id: string | number) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;
        if (type === 'property') {
            setProperties(properties.filter(p => p.id !== id));
            fetch(apiUrl(`/api/properties/${id}`), { method: 'DELETE' })
                .catch(err => console.error("Error deleting property:", err));
        }
        else if (type === 'room') {
            setRoomTypes(roomTypes.filter(r => r.id !== id));
            const suffix = managingProperty?.id ? `?propertyId=${encodeURIComponent(String(managingProperty.id))}` : '';
            fetch(apiUrl(`/api/rooms/${id}${suffix}`), { method: 'DELETE' });
        }
        else if (type === 'venue') {
            setVenues(venues.filter(v => v.id !== id));
            const suffix = managingProperty?.id ? `?propertyId=${encodeURIComponent(String(managingProperty.id))}` : '';
            fetch(apiUrl(`/api/venues/${id}${suffix}`), { method: 'DELETE' });
        }
        else if (type === 'user') {
            setUsers(users.filter(u => u.id !== id));
            fetch(apiUrl(`/api/users/${id}`), { method: 'DELETE' })
                .catch(err => console.error("Error deleting user:", err));
        }
        else if (type === 'field') {
            // @ts-ignore
            const updated = formFields[configFormType].filter((_, i) => i !== id);
            setFormFields({ ...formFields, [configFormType]: updated });
        }
    };

    const handleUnassign = (userId: string, targetPropId?: string) => {
        const propId = targetPropId || managingProperty?.id;
        if (!propId) return;
        if (!window.confirm('Are you sure you want to unassign this user from this property?')) return;

        const prop = properties.find((p: any) => p.id === propId);
        if (!prop) return;

        const updatedAssigned = (prop.assignedUserIds || []).filter((id: string) => id !== userId);
        const updatedProp = { ...prop, assignedUserIds: updatedAssigned };
        
        // Update local property state
        setProperties((prevProps: any[]) => prevProps.map(p => p.id === propId ? updatedProp : p));
        if (managingProperty && managingProperty.id === propId) {
            setManagingProperty(updatedProp);
        }

        // Sync property to backend
        fetch(apiUrl('/api/properties'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedProp)
        }).catch(err => console.error("Error unassigning user from property:", err));

        // Also check if the user's primary propertyId is this one, if so, clear it
        const user = users.find(u => u.id === userId);
        if (user && user.propertyId === propId) {
            const updatedUser = { ...user, propertyId: '' };
            setUsers(prevUsers => prevUsers.map(u => u.id === userId ? updatedUser : u));
            fetch(apiUrl('/api/users'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            }).catch(err => console.error("Error updating user after unassign:", err));
        }
    };

    // Financial & KPI State
    const monthsList = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const generateInitialMonths = () => monthsList.map(m => ({
        month: m,
        roomsBudget: 0,
        roomsForecast: 0,
        foodAndBeverageBudget: 0,
        foodAndBeverageForecast: 0,
        salesCalls: 0
    }));

    const [financialData, setFinancialData] = useState([
        { year: 2025, months: generateInitialMonths() }
    ]);
    const [selectedYearDetails, setSelectedYearDetails] = useState<any>(null);
    const [isEditingFinancials, setIsEditingFinancials] = useState(false);
    const [tempYearData, setTempYearData] = useState<any>(null);
    const normalizedFinancialData = useMemo(() => {
        const rows = Array.isArray(financialData) ? financialData : [];
        const normalized = rows
            .map((row: any) => ({
                ...row,
                year: Number(row?.year || 0),
                months: Array.isArray(row?.months) && row.months.length ? row.months : generateInitialMonths(),
            }))
            .filter((row: any) => Number.isFinite(row.year) && row.year > 0)
            .sort((a: any, b: any) => a.year - b.year);
        if (normalized.length > 0) return normalized;
        return [{ year: new Date().getFullYear(), months: generateInitialMonths() }];
    }, [financialData]);
    const nextFinancialYear = useMemo(
        () => Number(normalizedFinancialData[normalizedFinancialData.length - 1]?.year || new Date().getFullYear()) + 1,
        [normalizedFinancialData]
    );

    const [activePropTab, setActivePropTab] = useState('rooms');

    const [taxonomySegments, setTaxonomySegments] = useState<string[]>([]);
    const [taxonomyAccountTypes, setTaxonomyAccountTypes] = useState<string[]>([]);
    const [taxonomyNewSegment, setTaxonomyNewSegment] = useState('');
    const [taxonomyNewType, setTaxonomyNewType] = useState('');
    const [editSegIdx, setEditSegIdx] = useState<number | null>(null);
    const [editSegVal, setEditSegVal] = useState('');
    const [editTypeIdx, setEditTypeIdx] = useState<number | null>(null);
    const [editTypeVal, setEditTypeVal] = useState('');

    const [mealPlansList, setMealPlansList] = useState<MealPlanEntry[]>([]);
    const [eventPackagesList, setEventPackagesList] = useState<EventPackageEntry[]>([]);
    const [newMealName, setNewMealName] = useState('');
    const [newMealCode, setNewMealCode] = useState('');
    const [newPkgName, setNewPkgName] = useState('');
    const [newPkgCode, setNewPkgCode] = useState('');
    const [newPkgTimingId, setNewPkgTimingId] = useState<EventPackageTimingId>('coffee_1');
    const [editMealIdx, setEditMealIdx] = useState<number | null>(null);
    const [editMealName, setEditMealName] = useState('');
    const [editMealCode, setEditMealCode] = useState('');
    const [editPkgIdx, setEditPkgIdx] = useState<number | null>(null);
    const [editPkgName, setEditPkgName] = useState('');
    const [editPkgCode, setEditPkgCode] = useState('');
    const [editPkgTimingId, setEditPkgTimingId] = useState<EventPackageTimingId>('coffee_1');

    useEffect(() => {
        if (!managingProperty?.id) {
            setTaxonomySegments([]);
            setTaxonomyAccountTypes([]);
            setMealPlansList([]);
            setEventPackagesList([]);
            return;
        }
        setTaxonomySegments(loadSegmentsForProperty(managingProperty.id));
        setTaxonomyAccountTypes(loadAccountTypesForProperty(managingProperty.id));
        setEditSegIdx(null);
        setEditTypeIdx(null);
        setTaxonomyNewSegment('');
        setTaxonomyNewType('');
        setMealPlansList(loadMealPlansForProperty(managingProperty.id));
        setEventPackagesList(loadEventPackagesForProperty(managingProperty.id));
        setEditMealIdx(null);
        setEditPkgIdx(null);
        setNewMealName('');
        setNewMealCode('');
        setNewPkgName('');
        setNewPkgCode('');
        setNewPkgTimingId('coffee_1');
    }, [managingProperty?.id]);

    useEffect(() => {
        if (!managingProperty) return;
        const propId = managingProperty.id;
        setSelectedYearDetails(null);
        setIsEditingFinancials(false);
        setTempYearData(null);

        fetch(apiUrl(`/api/rooms?propertyId=${propId}`))
            .then(res => res.json()).then(data => setRoomTypes(Array.isArray(data) ? data : []));
            
        fetch(apiUrl(`/api/venues?propertyId=${propId}`))
            .then(res => res.json()).then(data => setVenues(Array.isArray(data) ? data : []));

        fetch(apiUrl(`/api/taxes?propertyId=${propId}`))
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setTaxes(data);
                } else {
                    setTaxes(defaultTaxesForProperty(String(propId)));
                }
            });

        fetch(apiUrl(`/api/financials?propertyId=${propId}`))
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setFinancialData(data);
                } else {
                    setFinancialData([{ year: new Date().getFullYear(), months: generateInitialMonths() }]);
                }
            });
    }, [managingProperty]);

    const tabs = appIsAdmin
        ? [
              { id: 'profile', label: 'Settings', icon: User },
              { id: 'property', label: 'Properties', icon: Building },
              { id: 'users', label: 'User Mgmt', icon: Users },
              { id: 'config', label: 'Configurations', icon: SettingsIcon },
          ]
        : [{ id: 'profile', label: 'Settings', icon: User }];

    const propertyTabsList = [
        { id: 'rooms', label: 'Room Types', icon: BedDouble },
        { id: 'venues', label: 'Venues', icon: Layout },
        { id: 'meals_packages', label: 'Meals & Packages', icon: UtensilsCrossed },
        { id: 'financial', label: "Financial & KPI's", icon: TrendingUp },
        { id: 'taxes', label: 'Tax Config', icon: DollarSign },
        { id: 'segments_types', label: 'Segments & Account Types', icon: Tags },
        ...(appIsAdmin ? [{ id: 'users', label: 'User Mgmt', icon: Users }] : []),
    ];

    // --- Shared Components ---
    const UserPerformanceDashboard = ({
        user,
        isOwnProfile = false,
        propertyId: scopePropId,
    }: {
        user: any;
        isOwnProfile?: boolean;
        propertyId?: string;
    }) => {
        const assignedProperties = properties.filter(
            (p) => p.assignedUserIds?.includes(user.id) || p.id === user.propertyId
        );

        const mergedUser = useMemo(() => {
            const fromList = users.find((u: any) => String(u?.id) === String(user?.id));
            if (!fromList) return user;
            return {
                ...user,
                ...fromList,
                stats: {
                    ...(user?.stats || {}),
                    ...(fromList?.stats || {}),
                    yearlyTargets: {
                        ...(user?.stats?.yearlyTargets || {}),
                        ...(fromList?.stats?.yearlyTargets || {}),
                    },
                },
            };
        }, [users, user]);

        const rollingThreeMonthRange = (d: Date) => {
            const y = d.getFullYear();
            const m = d.getMonth();
            const from = new Date(y, m - 1, 1);
            const to = new Date(y, m + 1, 1);
            return {
                fromMonth: PROFILE_MONTH_LABELS[from.getMonth()],
                fromYear: String(from.getFullYear()),
                toMonth: PROFILE_MONTH_LABELS[to.getMonth()],
                toYear: String(to.getFullYear()),
            };
        };

        const [revenueDateRange, setRevenueDateRange] = useState(() => rollingThreeMonthRange(new Date()));
        const [activityDayFilter, setActivityDayFilter] = useState('');
        const [viewMode, setViewMode] = useState<'month' | 'year'>('month');

        const months = [...PROFILE_MONTH_LABELS];
        const years = useMemo(() => {
            const cy = new Date().getFullYear();
            const out: string[] = [];
            for (let y = cy - 5; y <= cy + 1; y++) out.push(String(y));
            return out;
        }, []);

        useEffect(() => {
            const now = new Date();
            const y = String(now.getFullYear());
            if (viewMode === 'month') {
                setRevenueDateRange(rollingThreeMonthRange(now));
            } else {
                setRevenueDateRange({ fromMonth: 'Jan', fromYear: y, toMonth: 'Dec', toYear: y });
            }
        }, [viewMode]);

        const revGradId = useMemo(() => `prof-rev-${String(mergedUser?.id || 'x')}`, [mergedUser?.id]);

        const userLeads = useMemo(
            () => filterUserCrmLeads(crmLeads, scopePropId, mergedUser),
            [crmLeads, scopePropId, mergedUser]
        );

        const periodBounds = useMemo(() => {
            const now = new Date();
            const y = now.getFullYear();
            const mi = now.getMonth();
            if (viewMode === 'month') return { ...ymdBoundsForCalendarMonth(y, mi), year: y, monthIndex: mi };
            return { ...ymdBoundsForCalendarYear(y), year: y, monthIndex: mi };
        }, [viewMode]);

        const monthRevenue = useMemo(
            () =>
                sumRevenueInYmdRange(sharedRequests, scopePropId, mergedUser, periodBounds.start, periodBounds.end),
            [sharedRequests, scopePropId, mergedUser, periodBounds.start, periodBounds.end]
        );
        const monthReqCount = useMemo(
            () =>
                countRequestsInYmdRange(sharedRequests, scopePropId, mergedUser, periodBounds.start, periodBounds.end),
            [sharedRequests, scopePropId, mergedUser, periodBounds.start, periodBounds.end]
        );
        const activePipeInPeriod = useMemo(
            () =>
                countOpenPipelineInYmdRange(
                    sharedRequests,
                    scopePropId,
                    mergedUser,
                    periodBounds.start,
                    periodBounds.end
                ),
            [sharedRequests, scopePropId, mergedUser, periodBounds.start, periodBounds.end]
        );
        const ymPrefix = `${periodBounds.year}-${String(periodBounds.monthIndex + 1).padStart(2, '0')}`;
        const monthCalls = useMemo(() => countCallsInMonth(userLeads, ymPrefix), [userLeads, ymPrefix]);
        const yearCalls = useMemo(() => countCallsInYear(userLeads, periodBounds.year), [userLeads, periodBounds.year]);

        const callsKpi = viewMode === 'year' ? yearCalls : monthCalls;

        const userAccountsCount = useMemo(() => {
            return filterUserAccounts(accounts || [], mergedUser).filter(
                (a: any) => !scopePropId || !a?.propertyId || String(a.propertyId) === String(scopePropId)
            ).length;
        }, [accounts, mergedUser, scopePropId]);

        const userTasks = useMemo(() => {
            return (tasks || []).filter(
                (t: any) =>
                    taskAssignedToUser(t, mergedUser) &&
                    (!scopePropId || !t.propertyId || String(t.propertyId) === String(scopePropId))
            );
        }, [tasks, mergedUser, scopePropId]);

        const taskDone = userTasks.filter((t: any) => t.completed).length;
        const taskOpen = userTasks.filter((t: any) => !t.completed);
        const isUrgentT = (t: any) => t.priority === 'High' || t.star;
        const isDueT = (t: any) => {
            if (!t.date) return false;
            const d = new Date(`${t.date}T12:00:00`);
            if (Number.isNaN(d.getTime())) return false;
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            return d <= end;
        };
        const taskUrgent = taskOpen.filter(isUrgentT).length;
        const taskDue = taskOpen.filter((t: any) => !isUrgentT(t) && isDueT(t)).length;
        const taskPending = taskOpen.filter((t: any) => !isUrgentT(t) && !isDueT(t)).length;
        const taskTotal = userTasks.length;
        const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

        const annualTargetRaw = Number(
            mergedUser?.stats?.yearlyTargets?.[String(periodBounds.year)] ??
                mergedUser?.stats?.yearlyTargets?.[periodBounds.year] ??
                0
        );
        const monthlyTargetCalls = monthlySalesCallTarget(mergedUser, periodBounds.year);
        const progressCalls = monthlyTargetCalls > 0 ? Math.min(100, (monthCalls / monthlyTargetCalls) * 100) : 0;
        const precisionPct =
            viewMode === 'year'
                ? annualTargetRaw > 0
                    ? Math.min(100, Math.round((yearCalls / annualTargetRaw) * 100))
                    : 0
                : monthlyTargetCalls > 0
                  ? Math.min(100, Math.round((monthCalls / monthlyTargetCalls) * 100))
                  : 0;
        const precisionLabel =
            (viewMode === 'year' ? annualTargetRaw : monthlyTargetCalls) > 0 ? `${precisionPct}%` : '—';

        const revenueSeries = useMemo(
            () =>
                monthRangeRevenueSeries(
                    sharedRequests,
                    scopePropId,
                    mergedUser,
                    revenueDateRange.fromMonth,
                    revenueDateRange.fromYear,
                    revenueDateRange.toMonth,
                    revenueDateRange.toYear
                ),
            [
                sharedRequests,
                scopePropId,
                mergedUser,
                revenueDateRange.fromMonth,
                revenueDateRange.fromYear,
                revenueDateRange.toMonth,
                revenueDateRange.toYear,
            ]
        );

        const SIXTY_DAYS_MS = 60 * 86400000;
        const activityAll = useMemo(
            () => buildProfileActivityLog(sharedRequests, accounts, tasks, mergedUser, scopePropId, SIXTY_DAYS_MS),
            [sharedRequests, accounts, tasks, mergedUser, scopePropId]
        );
        const displayedLogs = useMemo(() => {
            if (!activityDayFilter) return activityAll;
            return activityAll.filter((row) => row.date.startsWith(activityDayFilter));
        }, [activityAll, activityDayFilter]);

        const logIcon = (kind: string) => {
            if (kind === 'account') return MapPin;
            if (kind === 'task') return CheckCircle2;
            return FileText;
        };
        const logColor = (kind: string) => {
            if (kind === 'account') return '#10b981';
            if (kind === 'task') return colors.orange;
            return colors.primary;
        };

        const avatarKey =
            mergedUser?.id != null ? `visatour_profile_avatar_v1_${mergedUser.id}` : 'visatour_profile_avatar_v1_anon';
        const [avatarUrl, setAvatarUrl] = useState('');
        const fileRef = useRef<HTMLInputElement>(null);
        useEffect(() => {
            try {
                setAvatarUrl(localStorage.getItem(avatarKey) || '');
            } catch {
                setAvatarUrl('');
            }
        }, [avatarKey]);

        const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (!f || !f.type.startsWith('image/')) return;
            const reader = new FileReader();
            reader.onload = () => {
                const data = String(reader.result || '');
                try {
                    localStorage.setItem(avatarKey, data);
                } catch {
                    /* storage full */
                }
                setAvatarUrl(data);
            };
            reader.readAsDataURL(f);
            e.target.value = '';
        };

        const displayName = String(mergedUser?.name || 'User');
        const initialLetter = displayName.trim().charAt(0).toUpperCase() || '?';

        const handleExportCSV = () => {
            const rows = displayedLogs.map(
                (l) => `${l.date},"${String(l.title).replace(/"/g, '""')}","${String(l.desc).replace(/"/g, '""')}"`
            );
            const csv = 'Date,Activity,Description\n' + rows.join('\n');
            const link = document.createElement('a');
            link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
            link.setAttribute(
                'download',
                `activity_${displayName.replace(/\s+/g, '_')}_${activityDayFilter || 'last60d'}.csv`
            );
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        return (
            <div className="space-y-3 animate-in slide-in-from-right duration-300 pb-4">
                {/* Top Toggle Navigation - Exclusive to Profile Dashboard */}
                <div className="flex items-center justify-between bg-black/5 p-1 rounded-2xl border border-white/5 mb-2">
                    <div className="flex gap-1">
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'month' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'opacity-40 hover:opacity-100'}`}
                            style={{ color: viewMode === 'month' ? '#000' : colors.textMain }}>
                            Month View
                        </button>
                        <button
                            onClick={() => setViewMode('year')}
                            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'year' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'opacity-40 hover:opacity-100'}`}
                            style={{ color: viewMode === 'year' ? '#000' : colors.textMain }}>
                            Year View
                        </button>
                    </div>
                    <div className="px-4 text-[9px] font-bold opacity-30 uppercase tracking-[0.2em]" style={{ color: colors.textMain }}>
                        Interactive Analytics Feed
                    </div>
                </div>

                {/* Header Profile Section - Compact */}
                <div className="p-4 rounded-[24px] border relative overflow-hidden shadow-xl"
                    style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="absolute top-0 right-0 p-4 opacity-[0.02]">
                        <Users size={120} style={{ color: colors.primary }} />
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 items-center lg:items-start relative z-10 text-center lg:text-left">
                        <div className="relative group">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt=""
                                    className="w-16 h-16 rounded-[20px] object-cover shadow-xl border border-white/10"
                                />
                            ) : (
                                <div
                                    className="w-16 h-16 rounded-[20px] flex items-center justify-center text-3xl font-black shadow-xl"
                                    style={{ backgroundColor: colors.primaryDim, color: colors.primary }}
                                >
                                    {initialLetter}
                                </div>
                            )}
                            {isOwnProfile && (
                                <>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={onAvatarFile}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="absolute -bottom-1 -right-1 p-1.5 rounded-lg bg-primary text-black shadow-lg"
                                    >
                                        <Upload size={12} />
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="flex-1">
                            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-1 justify-center lg:justify-start">
                                <h2 className="text-xl font-black italic tracking-tighter" style={{ color: colors.textMain }}>
                                    {displayName.toUpperCase()}
                                </h2>
                                <span className="px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border"
                                    style={{ borderColor: colors.primary + '30', color: colors.primary, backgroundColor: colors.primary + '10' }}>
                                    {mergedUser.role}
                                </span>
                            </div>

                                <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 border border-white/5 backdrop-blur-sm">
                                        <Mail size={12} className="text-blue-400" />
                                        <span className="text-[10px] font-medium opacity-70" style={{ color: colors.textMain }}>{mergedUser.email}</span>
                                    </div>
                                    {assignedProperties.length > 0 ? (
                                        assignedProperties.map(p => (
                                            <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 border backdrop-blur-sm ${activeProperty?.id === p.id ? 'border-primary/50' : 'border-white/5'}`}>
                                                <Building size={12} className="text-emerald-400" />
                                                <span className="text-[10px] font-medium opacity-70" style={{ color: colors.textMain }}>{p.name}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/10 border border-white/5 backdrop-blur-sm">
                                            <Building size={12} className="text-emerald-400 opacity-40" />
                                            <span className="text-[10px] font-medium opacity-70" style={{ color: colors.textMain }}>Unassigned</span>
                                        </div>
                                    )}
                                </div>

                        </div>

                        <div className="flex gap-2">
                            {isOwnProfile && (
                                <button onClick={() => setShowResetPassword(true)} className="px-4 py-2 rounded-xl border transition-all font-bold text-[10px] uppercase"
                                    style={{ borderColor: colors.border, color: colors.textMain, opacity: 0.6 }}>
                                    Reset Password
                                </button>
                            )}
                            {!isOwnProfile && (
                                <button className="px-6 py-2 rounded-xl bg-primary text-black font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
                                    Message
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats Grid - 6 Items */}
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                        {[
                            {
                                label: viewMode === 'year' ? 'Annual Total Revenue' : 'Curr. Month Revenue',
                                value: formatMoney(monthRevenue, 0),
                                icon: TrendingUp,
                                color: '#10b981',
                            },
                            {
                                label: viewMode === 'year' ? 'Annual Requests' : 'Monthly Requests',
                                value: String(monthReqCount),
                                icon: List,
                                color: '#8b5cf6',
                            },
                            {
                                label: viewMode === 'year' ? 'Active Pipeline' : 'Active Month',
                                value: String(activePipeInPeriod),
                                icon: Zap,
                                color: '#ec4899',
                            },
                            {
                                label: viewMode === 'year' ? 'Annual Sales Calls' : 'Curr. Month Calls',
                                value: String(callsKpi),
                                icon: Phone,
                                color: '#3b82f6',
                            },
                            { label: 'Total Accounts', value: String(userAccountsCount), icon: User, color: '#06b6d4' },
                            {
                                label: 'Task Ratio',
                                value: `${taskDone}/${taskTotal}`,
                                icon: CheckSquare,
                                color: '#f59e0b',
                            },
                        ].map((stat, i) => (
                            <div key={i} className="px-3 py-1.5 rounded-xl bg-black/5 border border-white/[0.03]">
                                <p className="text-[8px] uppercase font-bold tracking-[0.1em] mb-0.5" style={{ color: colors.textMain, opacity: 0.5 }}>{stat.label}</p>
                                <div className="flex items-center gap-2">
                                    <stat.icon size={12} style={{ color: stat.color }} />
                                    <h4 className="text-base font-black italic tracking-tighter" style={{ color: colors.textMain }}>{stat.value}</h4>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Dashboard Grid - White backgrounds for charts */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Revenue Trend Chart */}
                    <div className="lg:col-span-8 p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-4">
                            <div>
                                <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>REVENUE PERFORMANCE</h3>
                                <p className="text-[8px] uppercase tracking-widest" style={{ color: colors.textMain, opacity: 0.4 }}>
                                    Month view defaults to 3 rolling months (prev · current · next). Adjust from/to anytime.
                                </p>
                            </div>

                            <div className="flex items-center gap-2 bg-black/10 p-1.5 rounded-xl border border-white/5">
                                <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-bold opacity-40 uppercase ml-1" style={{ color: colors.textMain }}>From</span>
                                    <select className="bg-transparent text-[9px] font-bold outline-none cursor-pointer" style={{ color: colors.primary }}
                                        value={revenueDateRange.fromMonth} onChange={e => setRevenueDateRange({ ...revenueDateRange, fromMonth: e.target.value })}>
                                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <select className="bg-transparent text-[9px] font-bold outline-none cursor-pointer" style={{ color: colors.primary }}
                                        value={revenueDateRange.fromYear} onChange={e => setRevenueDateRange({ ...revenueDateRange, fromYear: e.target.value })}>
                                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                                <div className="w-[1px] h-3 bg-white/10 mx-1"></div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>To</span>
                                    <select className="bg-transparent text-[9px] font-bold outline-none cursor-pointer" style={{ color: colors.primary }}
                                        value={revenueDateRange.toMonth} onChange={e => setRevenueDateRange({ ...revenueDateRange, toMonth: e.target.value })}>
                                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <select className="bg-transparent text-[9px] font-bold outline-none cursor-pointer" style={{ color: colors.primary }}
                                        value={revenueDateRange.toYear} onChange={e => setRevenueDateRange({ ...revenueDateRange, toYear: e.target.value })}>
                                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="h-[155px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={revenueSeries}>
                                    <defs>
                                        <linearGradient id={revGradId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={colors.primary} stopOpacity={0.2} />
                                            <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} opacity={0.3} />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: colors.textMain, opacity: 0.5, fontSize: 9, fontWeight: 'bold' }}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: colors.card, borderRadius: '12px', border: `1px solid ${colors.border}`, fontSize: '10px' }}
                                        itemStyle={{ color: colors.primary }}
                                        formatter={(value: any) => formatMoney(Number(value || 0), 0)}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke={colors.primary}
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill={`url(#${revGradId})`}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Segment Distribution */}
                    <div className="lg:col-span-4 p-4 rounded-[24px] border flex flex-col justify-between" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div>
                            <h3 className="text-xs font-bold italic mb-3" style={{ color: colors.textMain }}>SALES CALLS: ACTUAL vs TARGET</h3>

                            <div className="space-y-4">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[8px] uppercase font-bold opacity-40 mb-1" style={{ color: colors.textMain }}>
                                                {viewMode === 'year' ? `Year ${periodBounds.year}` : `Month (${PROFILE_MONTH_LABELS[periodBounds.monthIndex]} ${periodBounds.year})`}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xl font-black italic tracking-tighter" style={{ color: colors.primary }}>
                                                    {viewMode === 'year' ? yearCalls : monthCalls}
                                                </h4>
                                                <span className="text-[8px] font-bold opacity-30" style={{ color: colors.textMain }}>
                                                    / {viewMode === 'year' ? annualTargetRaw || '—' : monthlyTargetCalls || '—'}{' '}
                                                    {viewMode === 'year' ? 'YEAR TARGET' : 'MO TARGET'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] uppercase font-bold opacity-40 mb-1" style={{ color: colors.textMain }}>Monthly target (from User Mgmt)</p>
                                            <h4 className="text-sm font-black italic tracking-tighter" style={{ color: colors.textMain }}>
                                                {monthlyTargetCalls || '—'}
                                            </h4>
                                        </div>
                                    </div>

                                    <div className="h-2 bg-black/10 rounded-full overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-primary transition-all duration-1000 ease-out"
                                            style={{
                                                width: `${
                                                    viewMode === 'year'
                                                        ? annualTargetRaw > 0
                                                            ? Math.min(100, (yearCalls / annualTargetRaw) * 100)
                                                            : 0
                                                        : progressCalls
                                                }%`,
                                            }}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-black/5 p-2 rounded-xl border border-white/5">
                                            <p className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Annual remaining</p>
                                            <p className="text-xs font-black italic" style={{ color: colors.textMain }}>
                                                {Math.max(0, annualTargetRaw - yearCalls).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-black/5 p-2 rounded-xl border border-white/5">
                                            <p className="text-[7px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Run rate (YTD)</p>
                                            <p className="text-xs font-black italic" style={{ color: colors.textMain }}>
                                                {(() => {
                                                    const mel =
                                                        new Date().getFullYear() === periodBounds.year
                                                            ? new Date().getMonth() + 1
                                                            : 12;
                                                    return mel > 0 ? `${Math.round(yearCalls / mel)} / mo` : '—';
                                                })()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t mt-4" style={{ borderColor: colors.border }}>
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-bold opacity-40 uppercase" style={{ color: colors.textMain }}>Target attainment</span>
                                <span className="text-[10px] font-black italic text-emerald-400">{precisionLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Row - Activity List & Export */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-7 p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>RECENT ACTIVITY LOG</h3>
                                <p className="text-[8px] uppercase tracking-widest opacity-40" style={{ color: colors.textMain }}>System history & User logs</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    className="p-1 px-2 bg-black/10 border border-white/10 rounded-lg text-[9px] font-bold outline-none"
                                    style={{ color: colors.textMain }}
                                    value={activityDayFilter}
                                    onChange={(e) => setActivityDayFilter(e.target.value)}
                                    title="Leave empty to show last 60 days on this profile"
                                />
                                <button onClick={handleExportCSV} className="p-1.5 px-3 rounded-lg bg-primary text-black hover:scale-105 transition-transform flex items-center gap-1.5">
                                    <Download size={12} />
                                    <span className="text-[9px] font-black uppercase">CSV</span>
                                </button>
                            </div>
                        </div>
                        <p className="text-[8px] opacity-40 mb-2" style={{ color: colors.textMain }}>
                            Showing your actions only (last 60 days on this profile). Clear the date to see the full window.
                        </p>
                        <div className="space-y-0.5 max-h-[180px] overflow-auto custom-scrollbar pr-2">
                            {displayedLogs.length === 0 ? (
                                <p className="text-[10px] opacity-50 py-4 text-center" style={{ color: colors.textMuted }}>No activity in this range.</p>
                            ) : (
                                displayedLogs.map((log) => {
                                    const Icon = logIcon(log.kind);
                                    const col = logColor(log.kind);
                                    return (
                                        <div key={log.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-black/5 border border-transparent hover:border-white/5 transition-all group">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: col + '15', color: col }}>
                                                <Icon size={12} />
                                            </div>
                                            <div className="flex-1 overflow-hidden min-w-0">
                                                <div className="flex justify-between items-center mb-0 gap-2">
                                                    <h4 className="text-[10px] font-bold uppercase tracking-tight truncate" style={{ color: colors.textMain }}>{log.title}</h4>
                                                    <span className="text-[8px] font-mono opacity-40 flex items-center gap-1 shrink-0" style={{ color: colors.textMain }}><Clock size={8} /> {log.date}</span>
                                                </div>
                                                <p className="text-[9px] opacity-50 break-words" style={{ color: colors.textMain }}>{log.desc}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-5 p-4 rounded-[24px] border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-xs font-bold italic" style={{ color: colors.textMain }}>TASK EXECUTION</h3>
                                <p className="text-[8px] uppercase tracking-widest opacity-40" style={{ color: colors.textMain }}>Pipeline Health Status</p>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-primary">{taskPct}% DONE</span>
                        </div>

                        <div className="space-y-3">
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${taskPct}%` }}></div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                                    <p className="text-[7px] font-bold text-red-500/80 uppercase mb-0.5">Urgent</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-red-500">{String(taskUrgent).padStart(2, '0')}</h5>
                                </div>
                                <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                                    <p className="text-[7px] font-bold text-orange-500/80 uppercase mb-0.5">Pending</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-orange-500">{String(taskPending).padStart(2, '0')}</h5>
                                </div>
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                    <p className="text-[7px] font-bold text-blue-500/80 uppercase mb-0.5">Due</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-blue-500">{String(taskDue).padStart(2, '0')}</h5>
                                </div>
                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <p className="text-[7px] font-bold text-emerald-500/80 uppercase mb-0.5">Done</p>
                                    <h5 className="text-lg font-black italic tracking-tighter text-emerald-500">{String(taskDone).padStart(2, '0')}</h5>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onOpenTasks?.()}
                                className="w-full py-2.5 rounded-xl bg-black/20 border border-white/10 text-[9px] font-bold uppercase tracking-widest text-primary hover:bg-black/30 transition-all"
                            >
                                Open Tasks Page
                            </button>
                        </div>
                    </div>
                </div>

                {/* Reset Password Form overlay */}
                {showResetPassword && isOwnProfile && (
                    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                        <div className="w-full max-w-sm space-y-4">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold" style={{ color: colors.primary }}>Security Credentials</h3>
                                <button onClick={() => setShowResetPassword(false)} style={{ color: colors.textMuted }}><X size={24} /></button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Current Password</label>
                                    <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/40 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={resetPasswordData.current} onChange={e => setResetPasswordData({ ...resetPasswordData, current: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">New Password</label>
                                    <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/40 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={resetPasswordData.new} onChange={e => setResetPasswordData({ ...resetPasswordData, new: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Confirm New Password</label>
                                    <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/40 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={resetPasswordData.confirm} onChange={e => setResetPasswordData({ ...resetPasswordData, confirm: e.target.value })} />
                                </div>
                                <button
                                    className="w-full py-4 rounded-xl font-bold transition-all"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                    onClick={() => { alert('Password Updated'); setShowResetPassword(false); }}
                                >
                                    Save New Credentials
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // --- Sub-Components ---
    // ... PropertyTab, RoomTypesTab, VenuesTab ... (Assume unchanged unless I specifically target them, but here I am replacing the block from state def to TaxTab) -> actually I can't do that easily without replacing massive chunks.

    // I will use multiple chunks strategy or replace specific functions.
    // Let's replace the State definitions first.

    // Better: I'll Replace the TaxesTab component function entirely.
    // And ProfileTab component function entirely.
    // And the Main Render return to remove header.
    // And state init.


    // --- Sub-Components ---

    const renderPropertyTab = () => {
        if (managingProperty) {
            return (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <button onClick={() => setManagingProperty(null)} className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity" style={{ color: colors.primary }}>
                        <ChevronLeft size={16} /> Back to Properties List
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold mb-2" style={{ color: colors.textMain }}>{managingProperty.name}</h2>
                        <p className="text-sm opacity-60" style={{ color: colors.textMuted }}>Manage settings and modules specific to this property</p>
                    </div>
                    
                    <div className="flex border-b mb-6 overflow-x-auto custom-scrollbar" style={{ borderColor: colors.border }}>
                        {propertyTabsList.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActivePropTab(tab.id)}
                                className={`px-4 py-3 min-w-max flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all ${activePropTab === tab.id ? 'border-primary' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                style={{ color: activePropTab === tab.id ? colors.primary : colors.textMuted }}
                            >
                                <tab.icon size={14} /> {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-4">
                        {activePropTab === 'rooms' && renderRoomTypesTab()}
                        {activePropTab === 'venues' && renderVenuesTab()}
                        {activePropTab === 'meals_packages' && renderMealsPackagesTab()}
                        {activePropTab === 'financial' && renderFinancialTab()}
                        {activePropTab === 'taxes' && renderTaxesTab()}
                        {activePropTab === 'segments_types' && renderSegmentsTypesTab()}
                        {activePropTab === 'users' && renderUsersTab()}
                    </div>
                </div>
            );
        }

        return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {properties.map((prop: any) => (
                <div key={prop.id} className="p-4 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-lg font-bold" style={{ color: colors.textMain }}>{prop.name}</h2>
                            <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: colors.textMuted }}>
                                <MapPin size={12} /> {prop.city}, {prop.country}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => openModal('property', prop)}
                                className="p-1.5 rounded-lg border hover:bg-white/5 transition-all" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                <Edit size={14} />
                            </button>
                            <button
                                onClick={() => setManagingProperty(prop)}
                                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-transform hover:scale-105"
                                style={{ backgroundColor: colors.primary, color: '#000' }}>
                                Manage Property
                            </button>
                            <button
                                onClick={() => handleDelete('property', prop.id)}
                                className="p-1.5 rounded-lg border hover:bg-red-500/10 transition-all text-red-500"
                                style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                title="Delete Property"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                        <div className="p-3 rounded-lg bg-black/10 border" style={{ borderColor: colors.border }}>
                            <label className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Contact Email</label>
                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>{prop.email}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-black/10 border" style={{ borderColor: colors.border }}>
                            <label className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Contact Phone</label>
                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>{prop.phone}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-black/10 border" style={{ borderColor: colors.border }}>
                            <label className="text-[9px] uppercase font-bold tracking-wider opacity-60 mb-1 block" style={{ color: colors.textMuted }}>Inventory</label>
                            <p className="font-bold text-sm" style={{ color: colors.textMain }}>
                                {prop.totalRooms} Rooms
                            </p>
                        </div>
                    </div>

                    {/* Assigned Users Section */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>
                            <Users size={12} /> Assigned Users
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {users.filter(u => prop.assignedUserIds?.includes(u.id)).map(user => (
                                <div key={user.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5 border group relative" style={{ borderColor: colors.border }}>
                                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold" style={{ color: colors.primary }}>
                                        {user.name.charAt(0)}
                                    </div>
                                    <span className="text-xs font-medium" style={{ color: colors.textMain }}>{user.name}</span>
                                    <button
                                        onClick={() => handleUnassign(user.id, prop.id)}
                                        className="w-4 h-4 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => openModal('assignUser', { propertyId: prop.id, selectedUserIds: prop.assignedUserIds || [] })}
                                className="px-3 py-1.5 rounded-lg border border-dashed flex items-center justify-center gap-1.5 hover:bg-white/5 transition-colors text-xs font-medium"
                                style={{ borderColor: colors.border, color: colors.textMuted }}>
                                <Plus size={14} /> Assign
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            <button
                onClick={() => openModal('property')}
                className="w-full py-4 rounded-xl border border-dashed flex items-center justify-center gap-2 hover:bg-white/5 transition-all group"
                style={{ borderColor: colors.border, color: colors.textMuted }}>
                <Plus size={20} className="group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold">Add New Property</span>
            </button>
        </div>
        );
    };

    const renderSegmentsTypesTab = () => {
        const pid = managingProperty?.id;
        if (!pid) return null;

        const persistSegments = (list: string[]) => {
            saveSegmentsForProperty(pid, list);
            setTaxonomySegments(list);
        };
        const persistTypes = (list: string[]) => {
            saveAccountTypesForProperty(pid, list);
            setTaxonomyAccountTypes(list);
        };

        const addSegment = () => {
            const v = taxonomyNewSegment.trim();
            if (!v || taxonomySegments.includes(v)) return;
            persistSegments([...taxonomySegments, v]);
            setTaxonomyNewSegment('');
        };
        const addType = () => {
            const v = taxonomyNewType.trim();
            if (!v || taxonomyAccountTypes.includes(v)) return;
            persistTypes([...taxonomyAccountTypes, v]);
            setTaxonomyNewType('');
        };

        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: colors.textMain }}>Segments &amp; account types</h2>
                    <p className="text-sm opacity-70" style={{ color: colors.textMuted }}>
                        Configure lists for <span className="font-semibold" style={{ color: colors.textMain }}>{managingProperty.name}</span>.
                        Segments are used when creating requests and on the dashboard distribution chart. Account types appear on accounts and the account-type chart.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Segments</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <input
                                    value={taxonomyNewSegment}
                                    onChange={(e) => setTaxonomyNewSegment(e.target.value)}
                                    placeholder="New segment name..."
                                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    onKeyDown={(e) => e.key === 'Enter' && addSegment()}
                                />
                                <button
                                    type="button"
                                    onClick={addSegment}
                                    className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {taxonomySegments.map((name, i) => (
                                    <li key={`seg-${i}`} className="py-3 flex items-center gap-2 justify-between">
                                        {editSegIdx === i ? (
                                            <input
                                                value={editSegVal}
                                                onChange={(e) => setEditSegVal(e.target.value)}
                                                className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                            />
                                        ) : (
                                            <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>{name}</span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {editSegIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const v = editSegVal.trim();
                                                        if (!v) return;
                                                        const next = [...taxonomySegments];
                                                        const dup = next.some((s, j) => j !== i && s === v);
                                                        if (dup) return;
                                                        next[i] = v;
                                                        persistSegments(next);
                                                        setEditSegIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditSegIdx(i); setEditSegVal(name); }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editSegIdx === i) setEditSegIdx(null);
                                                    persistSegments(taxonomySegments.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {taxonomySegments.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No segments yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Account types</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <input
                                    value={taxonomyNewType}
                                    onChange={(e) => setTaxonomyNewType(e.target.value)}
                                    placeholder="New account type..."
                                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    onKeyDown={(e) => e.key === 'Enter' && addType()}
                                />
                                <button
                                    type="button"
                                    onClick={addType}
                                    className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {taxonomyAccountTypes.map((name, i) => (
                                    <li key={`typ-${i}`} className="py-3 flex items-center gap-2 justify-between">
                                        {editTypeIdx === i ? (
                                            <input
                                                value={editTypeVal}
                                                onChange={(e) => setEditTypeVal(e.target.value)}
                                                className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                            />
                                        ) : (
                                            <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>{name}</span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {editTypeIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const v = editTypeVal.trim();
                                                        if (!v) return;
                                                        const next = [...taxonomyAccountTypes];
                                                        const dup = next.some((s, j) => j !== i && s === v);
                                                        if (dup) return;
                                                        next[i] = v;
                                                        persistTypes(next);
                                                        setEditTypeIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditTypeIdx(i); setEditTypeVal(name); }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editTypeIdx === i) setEditTypeIdx(null);
                                                    persistTypes(taxonomyAccountTypes.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {taxonomyAccountTypes.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No account types yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMealsPackagesTab = () => {
        const pid = managingProperty?.id;
        if (!pid) return null;

        const persistMeals = (list: MealPlanEntry[]) => {
            saveMealPlansForProperty(pid, list);
            setMealPlansList(list);
        };
        const persistPkgs = (list: EventPackageEntry[]) => {
            saveEventPackagesForProperty(pid, list);
            setEventPackagesList(list);
        };

        const addMeal = () => {
            const name = newMealName.trim();
            const code = newMealCode.trim().toUpperCase();
            if (!name || !code) return;
            if (mealPlansList.some((m) => m.code.toUpperCase() === code)) return;
            persistMeals([...mealPlansList, { id: `mp-${Date.now()}`, name, code }]);
            setNewMealName('');
            setNewMealCode('');
        };

        const addPkg = () => {
            const name = newPkgName.trim();
            const code = newPkgCode.trim();
            if (!name || !code) return;
            if (eventPackagesList.some((p) => p.name === name)) return;
            persistPkgs([
                ...eventPackagesList,
                { id: `ep-${Date.now()}`, name, code, timingId: newPkgTimingId },
            ]);
            setNewPkgName('');
            setNewPkgCode('');
            setNewPkgTimingId('coffee_1');
        };

        return (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div>
                    <h2 className="text-xl font-bold mb-1" style={{ color: colors.textMain }}>Meals &amp; packages</h2>
                    <p className="text-sm opacity-70" style={{ color: colors.textMuted }}>
                        Room <strong>meal plans</strong> (name + code) drive the meal plan dropdown in accommodation requests.{' '}
                        <strong>Event packages</strong> (name + code + timing layout) drive the Section 5 agenda package list and which catering time fields appear per row.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Room meal plans</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    value={newMealName}
                                    onChange={(e) => setNewMealName(e.target.value)}
                                    placeholder="Meal name (e.g. Breakfast)"
                                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                />
                                <input
                                    value={newMealCode}
                                    onChange={(e) => setNewMealCode(e.target.value)}
                                    placeholder="Code (e.g. BB)"
                                    className="w-full sm:w-28 px-3 py-2 rounded-lg border text-sm font-mono uppercase"
                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    onKeyDown={(e) => e.key === 'Enter' && addMeal()}
                                />
                                <button
                                    type="button"
                                    onClick={addMeal}
                                    className="px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shrink-0"
                                    style={{ backgroundColor: colors.primary, color: '#000' }}
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {mealPlansList.map((row, i) => (
                                    <li key={row.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                                        {editMealIdx === i ? (
                                            <div className="flex flex-1 flex-col sm:flex-row gap-2">
                                                <input
                                                    value={editMealName}
                                                    onChange={(e) => setEditMealName(e.target.value)}
                                                    className="flex-1 px-3 py-1.5 rounded-lg border text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                                <input
                                                    value={editMealCode}
                                                    onChange={(e) => setEditMealCode(e.target.value)}
                                                    className="w-full sm:w-28 px-3 py-1.5 rounded-lg border text-sm font-mono uppercase"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                            </div>
                                        ) : (
                                            <span className="text-sm font-medium flex-1" style={{ color: colors.textMain }}>
                                                {row.name}{' '}
                                                <span className="ml-2 text-xs font-mono opacity-60">({row.code})</span>
                                            </span>
                                        )}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {editMealIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const name = editMealName.trim();
                                                        const code = editMealCode.trim().toUpperCase();
                                                        if (!name || !code) return;
                                                        const next = [...mealPlansList];
                                                        if (next.some((m, j) => j !== i && m.code.toUpperCase() === code)) return;
                                                        next[i] = { ...next[i], name, code };
                                                        persistMeals(next);
                                                        setEditMealIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditMealIdx(i);
                                                        setEditMealName(row.name);
                                                        setEditMealCode(row.code);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editMealIdx === i) setEditMealIdx(null);
                                                    persistMeals(mealPlansList.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {mealPlansList.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No meal plans yet.</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: colors.border, backgroundColor: colors.bg }}>
                            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: colors.textMain }}>Event packages</h3>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="space-y-2">
                                <div className="flex flex-col gap-2">
                                    <input
                                        value={newPkgName}
                                        onChange={(e) => setNewPkgName(e.target.value)}
                                        placeholder="Package name"
                                        className="w-full px-3 py-2 rounded-lg border text-sm"
                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                    />
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <input
                                            value={newPkgCode}
                                            onChange={(e) => setNewPkgCode(e.target.value)}
                                            placeholder="Code (e.g. CB)"
                                            className="w-full sm:w-32 px-3 py-2 rounded-lg border text-sm font-mono"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        />
                                        <select
                                            value={newPkgTimingId}
                                            onChange={(e) => setNewPkgTimingId(e.target.value as EventPackageTimingId)}
                                            className="flex-1 px-3 py-2 rounded-lg border text-xs"
                                            style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                        >
                                            {EVENT_PACKAGE_TIMING_OPTIONS.map((o) => (
                                                <option key={o.id} value={o.id}>{o.label}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={addPkg}
                                            className="px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 shrink-0"
                                            style={{ backgroundColor: colors.primary, color: '#000' }}
                                        >
                                            <Plus size={16} /> Add
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <ul className="divide-y" style={{ borderColor: colors.border }}>
                                {eventPackagesList.map((row, i) => (
                                    <li key={row.id} className="py-3 space-y-2">
                                        {editPkgIdx === i ? (
                                            <div className="space-y-2">
                                                <input
                                                    value={editPkgName}
                                                    onChange={(e) => setEditPkgName(e.target.value)}
                                                    className="w-full px-3 py-1.5 rounded-lg border text-sm"
                                                    style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                />
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <input
                                                        value={editPkgCode}
                                                        onChange={(e) => setEditPkgCode(e.target.value)}
                                                        className="w-full sm:w-28 px-3 py-1.5 rounded-lg border text-sm font-mono"
                                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                    />
                                                    <select
                                                        value={editPkgTimingId}
                                                        onChange={(e) => setEditPkgTimingId(e.target.value as EventPackageTimingId)}
                                                        className="flex-1 px-3 py-1.5 rounded-lg border text-xs"
                                                        style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                                                    >
                                                        {EVENT_PACKAGE_TIMING_OPTIONS.map((o) => (
                                                            <option key={o.id} value={o.id}>{o.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-medium" style={{ color: colors.textMain }}>
                                                    {row.name}{' '}
                                                    <span className="ml-2 text-xs font-mono opacity-60">({row.code})</span>
                                                </span>
                                                <span className="text-[10px] uppercase tracking-wider opacity-50" style={{ color: colors.textMuted }}>
                                                    {EVENT_PACKAGE_TIMING_OPTIONS.find((o) => o.id === row.timingId)?.label || row.timingId}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-1 justify-end">
                                            {editPkgIdx === i ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const name = editPkgName.trim();
                                                        const code = editPkgCode.trim();
                                                        if (!name || !code) return;
                                                        const next = [...eventPackagesList];
                                                        if (next.some((p, j) => j !== i && p.name === name)) return;
                                                        next[i] = { ...next[i], name, code, timingId: editPkgTimingId };
                                                        persistPkgs(next);
                                                        setEditPkgIdx(null);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.primary }}
                                                >
                                                    <Check size={14} />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditPkgIdx(i);
                                                        setEditPkgName(row.name);
                                                        setEditPkgCode(row.code);
                                                        setEditPkgTimingId(row.timingId);
                                                    }}
                                                    className="p-1.5 rounded hover:bg-white/10"
                                                    style={{ color: colors.textMuted }}
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (editPkgIdx === i) setEditPkgIdx(null);
                                                    persistPkgs(eventPackagesList.filter((_, j) => j !== i));
                                                }}
                                                className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {eventPackagesList.length === 0 && (
                                <p className="text-xs italic opacity-50" style={{ color: colors.textMuted }}>No event packages yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderRoomTypesTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Room Types Configuration</h2>
                <button
                    onClick={() => openModal('room')}
                    className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold"
                    style={{ backgroundColor: colors.primary, color: '#000' }}>
                    <Plus size={16} /> Add Room Type
                </button>
            </div>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
                <table className="w-full text-left">
                    <thead style={{ backgroundColor: colors.bg }}>
                        <tr>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Room Type</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Size</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Capacity</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Inventory</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Base Rate</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: colors.border }}>
                        {safeRoomTypes.map((room) => (
                            <tr key={room.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 font-medium" style={{ color: colors.textMain }}>{room.name}</td>
                                <td className="p-4 text-sm font-mono" style={{ color: colors.primary }}>{room.size || '-'}</td>
                                <td className="p-4 text-sm" style={{ color: colors.textMain }}>{room.capacity} Pax</td>
                                <td className="p-4 text-sm" style={{ color: colors.textMain }}>
                                    <span className="px-2 py-1 rounded bg-black/20 border" style={{ borderColor: colors.border }}>
                                        {room.count} Rooms
                                    </span>
                                </td>
                                <td className="p-4 text-right font-mono text-sm" style={{ color: colors.primary }}>{formatMoney(Number(room.baseRate || 0), 0)}</td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={() => openModal('room', room)}
                                        className="p-1.5 rounded hover:bg-white/10 mr-2" style={{ color: colors.textMuted }}><Edit size={14} /></button>
                                    <button
                                        onClick={() => handleDelete('room', room.id)}
                                        className="p-1.5 rounded hover:bg-red-500/10" style={{ color: colors.red }}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderVenuesTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Venue Management</h2>
                <button
                    onClick={() => openModal('venue')}
                    className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold"
                    style={{ backgroundColor: colors.primary, color: '#000' }}>
                    <Plus size={16} /> Add Venue
                </button>
            </div>
            <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <table className="w-full text-left">
                    <thead style={{ backgroundColor: colors.bg }}>
                        <tr>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Venue Name / Dimensions</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-center" style={{ color: colors.textMuted }}>Capacity</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Available Shapes & Setups</th>
                            <th className="p-4 text-xs font-bold uppercase tracking-wider text-right" style={{ color: colors.textMuted }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: colors.border }}>
                        {safeVenues.map((venue) => (
                            <tr key={venue.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold" style={{ color: colors.textMain }}>{venue.name}</p>
                                        {venue.isCombined && (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 border border-emerald-500/10">
                                                Combined
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] mt-1 font-mono" style={{ color: colors.textMuted }}>
                                        {venue.width}m x {venue.length || venue.height || 0}m ({venue.area}m²) {venue.height && venue.length && `· C: ${venue.height}m`}
                                    </p>
                                </td>
                                <td className="p-4 text-center">
                                    <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: colors.primary + '20', color: colors.primary }}>
                                        {venue.capacity} Pax
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-2">
                                        {venue.shapes.map((shape: any, idx: number) => (
                                            <div key={idx} className="px-2 py-1 rounded bg-black/20 border flex items-center gap-2" style={{ borderColor: colors.border }}>
                                                <span className="text-[10px] font-bold" style={{ color: colors.textMain }}>{shape.name}</span>
                                                <span className="text-[9px] font-mono opacity-60" style={{ color: colors.textMuted }}>{shape.capacity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={() => openModal('venue', venue)}
                                        className="p-1.5 rounded hover:bg-white/10 mr-2" style={{ color: colors.textMuted }}><Edit size={14} /></button>
                                    <button
                                        onClick={() => handleDelete('venue', venue.id)}
                                        className="p-1.5 rounded hover:bg-red-500/10" style={{ color: colors.red }}><Trash2 size={14} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderTaxesTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Tax & Fee Configuration</h2>
                <div className="flex items-center gap-3">
                    {saveStatus === 'saved' && <span className="text-[10px] font-bold text-emerald-500 animate-pulse">SAVED SUCCESSFULLY!</span>}
                    {saveStatus === 'error' && <span className="text-[10px] font-bold text-red-500">ERROR SAVING!</span>}
                    <button
                        onClick={handleSaveTaxes}
                        disabled={saveStatus === 'saving'}
                        className="px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                        style={{ backgroundColor: colors.primary, color: '#000' }}
                    >
                        {saveStatus === 'saving' ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        {saveStatus === 'saving' ? 'Saving...' : 'Save Configuration'}
                    </button>
                </div>
            </div>
            
            <div className="space-y-6">
                {safeTaxes.map((tax, idx) => (
                    <div key={tax.id} className="p-6 rounded-xl border flex flex-col md:flex-row gap-6" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        {/* Details */}
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <label className="font-bold text-sm uppercase tracking-wider" style={{ color: colors.textMain }}>{tax.label}</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={tax.rate}
                                        onChange={(e) => {
                                            const newTaxes = Array.isArray(taxes) ? [...taxes] : [];
                                            if (!newTaxes[idx]) newTaxes[idx] = { ...tax, scope: { ...tax.scope } };
                                            newTaxes[idx].rate = Number(e.target.value);
                                            setTaxes(newTaxes);
                                        }}
                                        className="w-16 px-2 py-1 rounded border bg-black/20 text-right outline-none text-sm"
                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                    />
                                    <span className="text-sm" style={{ color: colors.textMuted }}>%</span>
                                </div>
                            </div>
                        </div>
                        {/* Scope */}
                        <div className="flex-1 border-l pl-6" style={{ borderColor: colors.border }}>
                            <label className="block text-[10px] font-bold uppercase tracking-wider mb-3 opacity-70" style={{ color: colors.textMuted }}>Applied To Scope</label>
                            <div className="flex flex-wrap gap-3">
                                {(Object.entries(tax.scope || {}) as [string, boolean][]).map(([scopeKey, enabled]) => (
                                    <label key={scopeKey} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${enabled ? 'bg-primary border-primary' : 'bg-transparent'}`}
                                            style={{ borderColor: enabled ? colors.primary : colors.textMuted }}>
                                            {enabled && <Check size={10} className="text-black" />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={enabled}
                                            onChange={() => {
                                                const newTaxes = Array.isArray(taxes) ? [...taxes] : [];
                                                if (!newTaxes[idx]) newTaxes[idx] = { ...tax, scope: { ...tax.scope } };
                                                // @ts-ignore
                                                newTaxes[idx].scope[scopeKey] = !enabled;
                                                setTaxes(newTaxes);
                                            }}
                                            className="hidden"
                                        />
                                        <span className="text-xs" style={{ color: colors.textMain }}>
                                            {scopeKey === 'foodAndBeverage' ? 'Food and Beverage' : scopeKey.charAt(0).toUpperCase() + scopeKey.slice(1)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderUsersTab = () => {
        if (selectedUserForStats) {
            return (
                <div className="space-y-6">
                    <button
                        onClick={() => setSelectedUserForStats(null)}
                        className="flex items-center gap-2 text-sm font-bold hover:opacity-70 transition-opacity"
                        style={{ color: colors.primary }}
                    >
                        <ChevronLeft size={16} /> Back to User List
                    </button>
                    <UserPerformanceDashboard
                        user={selectedUserForStats}
                        propertyId={managingProperty?.id || activeProperty?.id}
                    />
                </div>
            );
        }

        const filteredUsers = managingProperty 
            ? users.filter(u => u.propertyId === managingProperty.id || (managingProperty.assignedUserIds || []).includes(u.id))
            : users;

        return (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>
                        {managingProperty ? `${managingProperty.name} Staff Management` : 'Global Staff Management'}
                    </h2>
                    <button
                        onClick={() => openModal('user', managingProperty ? { propertyId: managingProperty.id } : null)}
                        className="px-6 py-2.5 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold shadow-lg shadow-primary/20"
                        style={{ backgroundColor: colors.primary, color: '#000' }}>
                        <Plus size={16} /> Add New Staff Member
                    </button>
                </div>
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.border }}>
                    <table className="w-full text-left">
                        <thead style={{ backgroundColor: colors.bg }}>
                            <tr>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Full Name</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Email Context</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Assigned Property</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>System Role</th>
                                <th className="p-4 text-[10px] uppercase font-bold tracking-widest text-center" style={{ color: colors.textMuted }}>Management</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: colors.border }}>
                            {filteredUsers.map((user) => {
                                const property = properties.find(p => p.id === user.propertyId);
                                return (
                                    <tr key={user.id} className="hover:bg-white/5 transition-all group">
                                        <td className="p-4 cursor-pointer" onClick={() => setSelectedUserForStats(user)}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ backgroundColor: colors.primaryDim, color: colors.primary }}>
                                                    {user.name.charAt(0)}
                                                </div>
                                                <span className="font-bold group-hover:text-primary transition-colors" style={{ color: colors.textMain }}>{user.name}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-sm font-mono opacity-60" style={{ color: colors.textMain }}>{user.email}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                {properties.filter(p => p.assignedUserIds?.includes(user.id) || p.id === user.propertyId).length > 0 ? (
                                                    properties.filter(p => p.assignedUserIds?.includes(user.id) || p.id === user.propertyId).map(p => (
                                                        <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/5">
                                                            <Building size={12} className="text-emerald-400" />
                                                            <span className="text-[10px] font-medium" style={{ color: colors.textMain }}>{p.name}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="flex items-center gap-2 opacity-40">
                                                        <Building size={12} />
                                                        <span className="text-xs">Unassigned</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>

                                        <td className="p-4">
                                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/5 border" style={{ borderColor: colors.border, color: colors.textMain }}>
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openModal('user', user)}
                                                    className="p-2 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all" style={{ color: colors.textMuted }}><Edit size={16} /></button>
                                                {managingProperty && (
                                                    <button
                                                        onClick={() => handleUnassign(user.id)}
                                                        className="p-2 rounded-xl border border-transparent hover:border-orange-500/20 hover:bg-orange-500/5 transition-all"
                                                        style={{ color: colors.orange }}
                                                        title="Unassign from this property"
                                                    >
                                                        <UserMinus size={16} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete('user', user.id)}
                                                    className="p-2 rounded-xl border border-transparent hover:border-red-500/20 hover:bg-red-500/5 transition-all" style={{ color: colors.red }}><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderProfileTab = () => {
        const mappedUser = {
            ...currentUser,
            name: currentUser?.name || userProfile.name,
            email: currentUser?.email || userProfile.email,
            role: currentUser?.role || userProfile.title || 'Staff',
        };
        return (
            <UserPerformanceDashboard user={mappedUser} isOwnProfile={true} propertyId={activeProperty?.id} />
        );
    };

    const renderFinancialTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold" style={{ color: colors.textMain }}>Financial and KPI Management</h2>
                    <p className="text-sm" style={{ color: colors.textMuted }}>Manage budget, forecast, and sales call targets</p>
                </div>
                <button
                    onClick={() => {
                        setFinancialData((prev: any[]) => {
                            const baseRows =
                                Array.isArray(prev) && prev.length
                                    ? prev
                                    : [{ year: new Date().getFullYear(), months: generateInitialMonths() }];
                            const maxYear = baseRows.reduce((max, row) => {
                                const y = Number(row?.year || 0);
                                return Number.isFinite(y) ? Math.max(max, y) : max;
                            }, 0);
                            return [...baseRows, { year: Math.max(maxYear, new Date().getFullYear()) + 1, months: generateInitialMonths() }];
                        });
                    }}
                    className="px-4 py-2 rounded flex items-center gap-2 hover:brightness-110 transition-all text-sm font-bold"
                    style={{ backgroundColor: colors.primary, color: '#000' }}
                >
                    <Plus size={16} /> Add Year {nextFinancialYear}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {normalizedFinancialData.map((data) => (
                    <div
                        key={data.year}
                        onClick={() => setSelectedYearDetails(data)}
                        className="p-6 rounded-2xl border cursor-pointer hover:border-primary/50 transition-all group relative overflow-hidden"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Calculator size={80} style={{ color: colors.primary }} />
                        </div>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black italic tracking-tighter" style={{ color: colors.primary }}>YEAR {data.year}</h3>
                            <div className="p-2 rounded-lg bg-white/5 group-hover:bg-primary/20 transition-colors">
                                <ChevronRight size={20} style={{ color: colors.primary }} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Rooms Budget</span>
                                <span className="font-mono text-sm" style={{ color: colors.textMain }}>
                                    {formatMoney(data.months.reduce((acc, m) => acc + m.roomsBudget, 0), 0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Food and Beverage Budget</span>
                                <span className="font-mono text-sm" style={{ color: colors.textMain }}>
                                    {formatMoney(data.months.reduce((acc, m) => acc + m.foodAndBeverageBudget, 0), 0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textMuted }}>Sales Calls</span>
                                <span className="font-mono text-sm" style={{ color: colors.cyan }}>
                                    {data.months.reduce((acc, m) => acc + m.salesCalls, 0)} Targets
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Year Details Modal */}
            {selectedYearDetails && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        {/* Modal Header */}
                        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl" style={{ backgroundColor: colors.primaryDim }}>
                                    <TrendingUp size={24} style={{ color: colors.primary }} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold" style={{ color: colors.textMain }}>Year {selectedYearDetails.year} Financials</h3>
                                    <p className="text-xs" style={{ color: colors.textMuted }}>Monthly Budget and KPI Breakdown</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {!isEditingFinancials ? (
                                    <button
                                        onClick={() => {
                                            setTempYearData(JSON.parse(JSON.stringify(selectedYearDetails)));
                                            setIsEditingFinancials(true);
                                        }}
                                        className="px-6 py-2 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all font-bold"
                                        style={{ backgroundColor: colors.primary, color: '#000' }}
                                    >
                                        <Edit size={16} /> Edit Data
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setFinancialData(financialData.map(y => y.year === tempYearData.year ? tempYearData : y));
                                            setSelectedYearDetails(tempYearData);
                                            setIsEditingFinancials(false);
                                            fetch(apiUrl('/api/financials'), {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ ...tempYearData, propertyId: managingProperty?.id })
                                            });
                                        }}
                                        className="px-6 py-2 rounded-xl flex items-center gap-2 hover:brightness-110 transition-all font-bold"
                                        style={{ backgroundColor: colors.green, color: '#000' }}
                                    >
                                        <Save size={16} /> Save Changes
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete all financial data for ${selectedYearDetails.year}?`)) {
                                            setFinancialData((prev: any[]) => {
                                                const kept = (Array.isArray(prev) ? prev : []).filter((y: any) => y.year !== selectedYearDetails.year);
                                                return kept.length ? kept : [{ year: new Date().getFullYear(), months: generateInitialMonths() }];
                                            });
                                            const itemId = selectedYearDetails.id || `${managingProperty?.id}_${selectedYearDetails.year}`;
                                            const suffix = managingProperty?.id ? `?propertyId=${encodeURIComponent(String(managingProperty.id))}` : '';
                                            fetch(apiUrl(`/api/financials/${itemId}${suffix}`), { method: 'DELETE' });
                                            setSelectedYearDetails(null);
                                            setIsEditingFinancials(false);
                                        }
                                    }}
                                    className="p-2 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Delete Year"
                                >
                                    <Trash2 size={24} />
                                </button>
                                <button onClick={() => { setSelectedYearDetails(null); setIsEditingFinancials(false); }} className="p-2 rounded-xl hover:bg-white/10" style={{ color: colors.textMuted }}>
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10" style={{ backgroundColor: colors.card }}>
                                    <tr className="border-b" style={{ borderColor: colors.border }}>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.textMuted }}>Month</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest" style={{ color: colors.primary }}>Rooms Budget</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-opacity-70" style={{ color: colors.primary }}>Rooms Forecast</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-blue-400">Food and Beverage Budget</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-blue-400 text-opacity-70">Food and Beverage Forecast</th>
                                        <th className="py-4 px-2 text-[10px] uppercase font-bold tracking-widest text-orange-400">Sales Calls</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: colors.border }}>
                                    {(isEditingFinancials ? tempYearData : selectedYearDetails).months.map((m: any, idx: number) => (
                                        <tr key={m.month} className="hover:bg-white/5 transition-colors">
                                            <td className="py-4 px-2 text-sm font-bold" style={{ color: colors.textMain }}>{m.month}</td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.roomsBudget}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].roomsBudget = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-primary/50 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm">{formatMoney(Number(m.roomsBudget || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.roomsForecast}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].roomsForecast = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-primary/30 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm opacity-60">{formatMoney(Number(m.roomsForecast || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.foodAndBeverageBudget}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].foodAndBeverageBudget = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-blue-500/50 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm">{formatMoney(Number(m.foodAndBeverageBudget || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.foodAndBeverageForecast}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].foodAndBeverageForecast = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-blue-500/30 text-sm font-mono"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <span className="font-mono text-sm opacity-60">{formatMoney(Number(m.foodAndBeverageForecast || 0), 0)}</span>}
                                            </td>
                                            <td className="py-4 px-2">
                                                {isEditingFinancials ? (
                                                    <input
                                                        type="number"
                                                        value={m.salesCalls}
                                                        onChange={(e) => {
                                                            const newMonths = [...tempYearData.months];
                                                            newMonths[idx].salesCalls = Number(e.target.value);
                                                            setTempYearData({ ...tempYearData, months: newMonths });
                                                        }}
                                                        className="w-full bg-black/20 border-0 p-2 rounded outline-none focus:ring-1 ring-orange-400/50 text-sm font-bold text-center"
                                                        style={{ color: colors.textMain }}
                                                    />
                                                ) : <div className="text-center font-bold" style={{ color: colors.orange }}>{m.salesCalls}</div>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="sticky bottom-0 z-10" style={{ backgroundColor: colors.card }}>
                                    <tr className="border-t-2 font-black" style={{ borderColor: colors.primary + '40' }}>
                                        <td className="py-4 px-2 text-xs uppercase" style={{ color: colors.textMuted }}>Yearly Totals</td>
                                        <td className="py-4 px-2 font-mono text-sm" style={{ color: colors.primary }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.roomsBudget, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 font-mono text-sm opacity-60" style={{ color: colors.primary }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.roomsForecast, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 font-mono text-sm" style={{ color: colors.blue }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.foodAndBeverageBudget, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 font-mono text-sm opacity-60" style={{ color: colors.blue }}>
                                            {formatMoney((isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.foodAndBeverageForecast, 0), 0)}
                                        </td>
                                        <td className="py-4 px-2 text-center" style={{ color: colors.orange }}>
                                            {(isEditingFinancials ? tempYearData : selectedYearDetails).months.reduce((acc: any, m: any) => acc + m.salesCalls, 0)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderConfigTab = () => (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row gap-6">
                {/* Form Selector */}
                <div className="w-full md:w-64 space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider opacity-70" style={{ color: colors.textMuted }}>Select Form</label>
                    <div className="flex flex-col gap-1 p-2 rounded-lg border" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                        {[
                            { id: 'lead', label: 'Lead Creation' },
                            { id: 'contract', label: 'Contract Generator' },
                            { id: 'request', label: 'Accommodation Request' },
                            { id: 'event', label: 'Event Request' }
                        ].map(form => (
                            <button
                                key={form.id}
                                onClick={() => setConfigFormType(form.id)}
                                className={`text-left px-3 py-2 rounded text-sm transition-colors ${configFormType === form.id ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-white/5'}`}
                                style={{ color: configFormType === form.id ? colors.primary : colors.textMain }}
                            >
                                {form.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Form Builder Canvas */}
                <div className="flex-1 p-6 rounded-xl border bg-black/5" style={{ borderColor: colors.border }}>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold flex items-center gap-2" style={{ color: colors.textMain }}>
                            <Box size={18} /> Form Fields Configuration
                        </h3>
                        <button
                            onClick={() => openModal('field')}
                            className="px-3 py-1.5 rounded bg-primary text-black text-xs font-bold flex items-center gap-1 hover:opacity-90">
                            <Plus size={14} /> Add Field
                        </button>
                    </div>

                    <div className="space-y-3">
                        {/* Dynamic Fields */}
                        {/* @ts-ignore */}
                        {formFields[configFormType].map((field, idx) => (
                            <div key={idx} className="p-3 rounded-lg border bg-card flex items-center justify-between group hover:border-primary/50 transition-colors"
                                style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded flex items-center justify-center bg-white/5 cursor-move text-muted-foreground">
                                        <List size={14} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm" style={{ color: colors.textMain }}>{field.label}</p>
                                        <p className="text-[10px] uppercase font-mono" style={{ color: colors.primary }}>{field.type}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={field.required} readOnly className="accent-primary" />
                                        <span style={{ color: colors.textMuted }}>Required</span>
                                    </label>
                                    <div className="w-px h-4 bg-white/10"></div>
                                    <button
                                        onClick={() => openModal('field', { ...field, index: idx })}
                                        className="text-muted-foreground hover:text-primary transition-colors"><Edit size={14} /></button>
                                    <button
                                        onClick={() => handleDelete('field', idx)}
                                        className="text-muted-foreground hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t flex justify-end gap-3" style={{ borderColor: colors.border }}>
                        <button
                            onClick={() => alert('Fields reset to system defaults')}
                            className="px-4 py-2 rounded text-xs font-bold border hover:bg-white/5" style={{ borderColor: colors.border, color: colors.textMain }}>Reset Default</button>
                        <button
                            onClick={() => alert(`Global configuration for ${configFormType} saved!`)}
                            className="px-6 py-2 rounded text-xs font-bold bg-primary text-black hover:opacity-90">Save Configuration</button>
                    </div>
                </div>
            </div>
        </div>
    );

    // --- Main Render ---

    return (
        <div className="h-full flex flex-col overflow-hidden w-full max-w-[1550px] mx-auto px-4">
            {/* Header Removed */}

            {/* Tabs Navigation */}
            <div className="shrink-0 border-b overflow-hidden" style={{ borderColor: colors.border }}>
                <div className="flex flex-nowrap justify-between w-full">
                    {tabs.map((tab: any) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    if (tab.id === 'users') setManagingProperty(null);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-3 border-b-2 transition-all group shrink-0 ${isActive ? 'font-bold' : 'font-medium opacity-70 hover:opacity-100'}`}
                                style={{
                                    borderColor: isActive ? colors.primary : 'transparent',
                                    color: isActive ? colors.primary : colors.textMain
                                }}
                            >
                                <Icon size={14} className={`transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`} />
                                <span className="text-[11px] whitespace-nowrap uppercase tracking-widest">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 overflow-auto py-4 custom-scrollbar">
                {activeTab === 'property' && renderPropertyTab()}
                {activeTab === 'rooms' && renderRoomTypesTab()}
                {activeTab === 'venues' && renderVenuesTab()}
                {activeTab === 'taxes' && renderTaxesTab()}
                {activeTab === 'users' && renderUsersTab()}
                {activeTab === 'profile' && renderProfileTab()}
                {activeTab === 'financial' && renderFinancialTab()}
                {activeTab === 'config' && renderConfigTab()}
            </div>

            {/* Admin Action Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
                        style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
                            <h3 className="text-xl font-bold font-mono tracking-tighter" style={{ color: colors.primary }}>
                                {editingItem ? 'EDIT' : 'ADD'} {modalType?.toUpperCase()}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-white/10" style={{ color: colors.textMuted }}>
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {modalType === 'property' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Property Name</label>
                                            <input type="text" placeholder="e.g. Shaden Resort" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Contact Email</label>
                                            <input type="email" placeholder="info@hotel.com" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.email || ''} onChange={e => setModalFormData({ ...modalFormData, email: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Phone Number</label>
                                            <input type="text" placeholder="+966..." className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.phone || ''} onChange={e => setModalFormData({ ...modalFormData, phone: e.target.value })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Number of Rooms</label>
                                            <input type="number" placeholder="120" className="w-full p-3 bg-black/10 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.totalRooms || ''} onChange={e => setModalFormData({ ...modalFormData, totalRooms: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>City</label>
                                            <input type="text" placeholder="AlUla" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.city || ''} onChange={e => setModalFormData({ ...modalFormData, city: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50" style={{ color: colors.textMain }}>Country</label>
                                            <input type="text" placeholder="Saudi Arabia" className="w-full p-3 bg-black/10 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.country || ''} onChange={e => setModalFormData({ ...modalFormData, country: e.target.value })} />
                                        </div>
                                    </div>
                                </>
                            )}
                            {modalType === 'room' && (
                                <>
                                    <input type="text" placeholder="Room Type Name" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                    <div className="flex gap-4">
                                        <input type="text" placeholder="Size (e.g. 39sqm)" className="flex-1 p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.size || ''} onChange={e => setModalFormData({ ...modalFormData, size: e.target.value })} />
                                        <input type="number" placeholder="Pax Capacity" className="w-24 p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.capacity || ''} onChange={e => setModalFormData({ ...modalFormData, capacity: Number(e.target.value) })} />
                                    </div>
                                    <div className="flex gap-4">
                                        <input type="number" placeholder="Base Rate" className="w-1/2 p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.baseRate || ''} onChange={e => setModalFormData({ ...modalFormData, baseRate: Number(e.target.value) })} />
                                        <input type="number" placeholder="Inventory Count" className="w-1/2 p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.count || ''} onChange={e => setModalFormData({ ...modalFormData, count: Number(e.target.value) })} />
                                    </div>
                                </>
                            )}
                            {modalType === 'venue' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Venue Name</label>
                                            <input type="text" placeholder="e.g. Grand Ballroom" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Total Pax Capacity</label>
                                            <input type="number" placeholder="500" className="w-full p-3 bg-black/20 border rounded-xl outline-none font-mono" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.capacity || ''} onChange={e => setModalFormData({ ...modalFormData, capacity: Number(e.target.value) })} />
                                        </div>
                                        <div className="grid grid-cols-4 gap-2 col-span-2">
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Width (m)</label>
                                                <input type="number" placeholder="30" className="w-full p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs" style={{ borderColor: colors.border, color: colors.textMain }}
                                                    value={modalFormData.width || ''} 
                                                    onChange={e => {
                                                        const w = Number(e.target.value);
                                                        const l = modalFormData.length || 0;
                                                        setModalFormData({ ...modalFormData, width: w, area: w * l });
                                                    }} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Length (m)</label>
                                                <input type="number" placeholder="15" className="w-full p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs" style={{ borderColor: colors.border, color: colors.textMain }}
                                                    value={modalFormData.length || ''} 
                                                    onChange={e => {
                                                        const l = Number(e.target.value);
                                                        const w = modalFormData.width || 0;
                                                        setModalFormData({ ...modalFormData, length: l, area: w * l });
                                                    }} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Height (m)</label>
                                                <input type="number" placeholder="4" className="w-full p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs" style={{ borderColor: colors.border, color: colors.textMain }}
                                                    value={modalFormData.height || ''} 
                                                    onChange={e => setModalFormData({ ...modalFormData, height: Number(e.target.value) })} />
                                            </div>
                                            <div>
                                                <label className="text-[9px] uppercase font-bold tracking-widest mb-1 block opacity-50">Area (sqm)</label>
                                                <input type="number" placeholder="Area" className="w-full p-2 bg-black/20 border-dashed rounded-lg outline-none font-mono text-xs cursor-not-allowed" 
                                                    style={{ borderColor: colors.border, color: colors.primary }}
                                                    value={modalFormData.area || ''} readOnly />
                                            </div>
                                        </div>
                                        <div className="col-span-2 flex items-center gap-3 pt-2">
                                            <input 
                                                type="checkbox" 
                                                id="combined-checkbox" 
                                                className="w-4 h-4 rounded border-2" 
                                                style={{ borderColor: colors.border, accentColor: colors.primary }}
                                                checked={modalFormData.isCombined || false}
                                                onChange={e => setModalFormData({ ...modalFormData, isCombined: e.target.checked })}
                                            />
                                            <label htmlFor="combined-checkbox" className="text-[10px] font-bold uppercase tracking-widest cursor-pointer" style={{ color: colors.textMain }}>
                                                Combined to Hall
                                                <span className="block text-[8px] opacity-40 normal-case font-medium mt-0.5">Check if this venue is part of a combined hall configuration</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Shapes Section */}
                                    <div className="space-y-3 pt-4 border-t" style={{ borderColor: colors.border }}>
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] uppercase font-bold tracking-widest opacity-50">Available Shapes & Capacities</label>
                                            <button
                                                onClick={() => {
                                                    const shapes = modalFormData.shapes || [];
                                                    setModalFormData({ ...modalFormData, shapes: [...shapes, { name: 'Theater', capacity: 0 }] });
                                                }}
                                                className="text-[10px] font-bold text-primary hover:underline">+ Add Shape</button>
                                        </div>
                                        <div className="space-y-2 max-h-40 overflow-auto pr-2 custom-scrollbar">
                                            {(modalFormData.shapes || []).map((shape: any, idx: number) => (
                                                <div key={idx} className="flex gap-2 items-center">
                                                    <select
                                                        className="flex-1 p-2 bg-black/20 border rounded-lg outline-none text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                        value={shape.name}
                                                        onChange={(e) => {
                                                            const newShapes = [...modalFormData.shapes];
                                                            newShapes[idx].name = e.target.value;
                                                            setModalFormData({ ...modalFormData, shapes: newShapes });
                                                        }}
                                                    >
                                                        {['Theater', 'Classroom', 'Banquet', 'U-Shape', 'Boardroom', 'Cocktail', 'Cabaret'].map(s => (
                                                            <option key={s} value={s} className="bg-black">{s}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="number"
                                                        placeholder="Cap"
                                                        className="w-20 p-2 bg-black/20 border rounded-lg outline-none font-mono text-xs"
                                                        style={{ borderColor: colors.border, color: colors.textMain }}
                                                        value={shape.capacity}
                                                        onChange={(e) => {
                                                            const newShapes = [...modalFormData.shapes];
                                                            newShapes[idx].capacity = Number(e.target.value);
                                                            setModalFormData({ ...modalFormData, shapes: newShapes });
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const newShapes = modalFormData.shapes.filter((_: any, i: number) => i !== idx);
                                                            setModalFormData({ ...modalFormData, shapes: newShapes });
                                                        }}
                                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {modalType === 'user' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Full Name</label>
                                            <input type="text" placeholder="John Doe" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.name || ''} onChange={e => setModalFormData({ ...modalFormData, name: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Username</label>
                                            <input type="text" placeholder="johndoe" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.username || ''} onChange={e => setModalFormData({ ...modalFormData, username: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Email Address</label>
                                        <input type="email" placeholder="john@advancedsales.com" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.email || ''} onChange={e => setModalFormData({ ...modalFormData, email: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Property Assignment</label>
                                            <select className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.propertyId || ''} onChange={e => setModalFormData({ ...modalFormData, propertyId: e.target.value })}>
                                                <option value="" className="bg-black">Unassigned</option>
                                                {properties.map(p => <option key={p.id} value={p.id} className="bg-black">{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">User type / role</label>
                                            <select className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.role || 'Sales Executive'}
                                                onChange={(e) =>
                                                    setModalFormData({
                                                        ...modalFormData,
                                                        role: e.target.value,
                                                        permissionGrants: [],
                                                        permissionRevokes: [],
                                                    })
                                                }>
                                                {USER_ROLE_OPTIONS.map((r) => (
                                                    <option key={r} value={r} className="bg-black">{r}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {normalizeUserRole({ role: modalFormData.role }) === 'Admin' ? (
                                        <p className="text-sm rounded-xl border p-3" style={{ borderColor: colors.border, color: colors.textMuted }}>
                                            Administrators have full access including Global Staff Management and all settings. Individual permission toggles do not apply.
                                        </p>
                                    ) : (
                                        <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: colors.border }}>
                                            <label className="text-[10px] uppercase font-bold tracking-widest block opacity-60" style={{ color: colors.textMain }}>
                                                Permissions (defaults for this role; toggle to add or remove)
                                            </label>
                                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                                {USER_MODAL_PERMISSIONS.map((perm) => {
                                                    const checked = getEffectivePermissionSet({
                                                        role: modalFormData.role,
                                                        permissionGrants: modalFormData.permissionGrants,
                                                        permissionRevokes: modalFormData.permissionRevokes,
                                                    }).has(perm);
                                                    return (
                                                        <label
                                                            key={perm}
                                                            className="flex items-start gap-3 cursor-pointer text-xs py-1"
                                                            style={{ color: colors.textMain }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => toggleUserPermission(perm)}
                                                                className="mt-0.5 rounded border"
                                                                style={{ borderColor: colors.border }}
                                                            />
                                                            <span>{PERMISSION_LABELS[perm]}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Yearly Sales Targets */}
                                    <div className="space-y-3 pt-4 border-t" style={{ borderColor: colors.border }}>
                                        <div className="flex justify-between items-center">
                                            <label className="text-[10px] uppercase font-bold tracking-widest opacity-50" style={{ color: colors.textMain }}>Yearly Sales Calls Targets</label>
                                            <button
                                                onClick={() => {
                                                    const currentYear = new Date().getFullYear();
                                                    const targets = modalFormData.stats?.yearlyTargets || {};
                                                    const years = Object.keys(targets).map(Number);
                                                    const nextYear = years.length > 0 ? Math.max(...years) + 1 : currentYear;

                                                    setModalFormData({
                                                        ...modalFormData,
                                                        stats: {
                                                            ...modalFormData.stats,
                                                            yearlyTargets: { ...targets, [nextYear]: 0 }
                                                        }
                                                    });
                                                }}
                                                className="text-[10px] font-bold text-primary hover:underline">+ Add Target for Next Year</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 max-h-40 overflow-auto pr-2 custom-scrollbar">
                                            {Object.entries(modalFormData.stats?.yearlyTargets || {}).map(([year, target]: [string, any]) => (
                                                <div key={year} className="flex gap-2 items-center bg-black/10 p-2 rounded-xl border border-white/5">
                                                    <span className="text-[10px] font-black italic w-12" style={{ color: colors.primary }}>{year}</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Annual Target"
                                                        className="flex-1 bg-transparent border-none outline-none font-mono text-xs"
                                                        style={{ color: colors.textMain }}
                                                        value={target}
                                                        onChange={(e) => {
                                                            setModalFormData({
                                                                ...modalFormData,
                                                                stats: {
                                                                    ...modalFormData.stats,
                                                                    yearlyTargets: {
                                                                        ...modalFormData.stats.yearlyTargets,
                                                                        [year]: Number(e.target.value)
                                                                    }
                                                                }
                                                            });
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {!editingItem ? (
                                        <div>
                                            <label className="text-[10px] uppercase font-bold tracking-widest mb-1 block opacity-50">Initial Password</label>
                                            <input type="password" placeholder="••••••••" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                value={modalFormData.password || ''} onChange={e => setModalFormData({ ...modalFormData, password: e.target.value })} />
                                        </div>
                                    ) : (
                                        <div className="pt-4 border-t" style={{ borderColor: colors.border }}>
                                            {!modalFormData.showReset ? (
                                                <button
                                                    onClick={() => setModalFormData({ ...modalFormData, showReset: true })}
                                                    className="w-full py-3 rounded-xl border border-primary/30 text-primary hover:bg-primary/10 transition-all font-bold text-xs"
                                                >
                                                    Reset Security Credentials
                                                </button>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="flex justify-between items-center">
                                                        <h4 className="text-[10px] uppercase font-bold tracking-widest text-primary">Reset Password</h4>
                                                        <button onClick={() => setModalFormData({ ...modalFormData, showReset: false })} className="text-[10px] text-muted-foreground hover:text-white">Cancel</button>
                                                    </div>
                                                    <div className="grid grid-cols-1 gap-3">
                                                        <input type="password" placeholder="Current Password" className="w-full p-2.5 bg-black/40 border rounded-lg text-xs outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                            value={modalFormData.currentPass || ''} onChange={e => setModalFormData({ ...modalFormData, currentPass: e.target.value })} />
                                                        <input type="password" placeholder="New Password" className="w-full p-2.5 bg-black/40 border rounded-lg text-xs outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                            value={modalFormData.newPass || ''} onChange={e => setModalFormData({ ...modalFormData, newPass: e.target.value })} />
                                                        <input type="password" placeholder="Confirm New Password" className="w-full p-2.5 bg-black/40 border rounded-lg text-xs outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                                            value={modalFormData.confirmPass || ''} onChange={e => setModalFormData({ ...modalFormData, confirmPass: e.target.value })} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {modalType === 'field' && (
                                <>
                                    <input type="text" placeholder="Label" className="w-full p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                        value={modalFormData.label || ''} onChange={e => setModalFormData({ ...modalFormData, label: e.target.value })} />
                                    <div className="flex items-center gap-4">
                                        <select className="flex-1 p-3 bg-black/20 border rounded-xl outline-none" style={{ borderColor: colors.border, color: colors.textMain }}
                                            value={modalFormData.type || 'Text'} onChange={e => setModalFormData({ ...modalFormData, type: e.target.value })}>
                                            {['Text', 'Number', 'Date', 'Dropdown', 'Currency'].map(t => <option key={t} value={t} className="bg-black">{t}</option>)}
                                        </select>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={modalFormData.required || false} onChange={e => setModalFormData({ ...modalFormData, required: e.target.checked })} className="accent-primary w-5 h-5" />
                                            <span style={{ color: colors.textMain }}>Required</span>
                                        </label>
                                    </div>
                                </>
                            )}
                            {modalType === 'assignUser' && (
                                <div className="space-y-4">
                                    <p className="text-sm" style={{ color: colors.textMuted }}>Select users to assign to this property:</p>
                                    <div className="max-h-60 overflow-auto space-y-2 custom-scrollbar pr-2">
                                        {users.map(user => {
                                            const isSelected = modalFormData.selectedUserIds?.includes(user.id);
                                            return (
                                                <div
                                                    key={user.id}
                                                    onClick={() => {
                                                        const current = modalFormData.selectedUserIds || [];
                                                        const next = isSelected
                                                            ? current.filter((id: string) => id !== user.id)
                                                            : [...current, user.id];
                                                        setModalFormData({ ...modalFormData, selectedUserIds: next });
                                                    }}
                                                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-primary/10 border-primary' : 'bg-black/20 border-transparent hover:border-white/10'}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold" style={{ color: isSelected ? colors.primary : colors.textMain }}>
                                                            {user.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold" style={{ color: colors.textMain }}>{user.name}</p>
                                                            <p className="text-[10px]" style={{ color: colors.textMuted }}>{user.role}</p>
                                                        </div>
                                                    </div>
                                                    {isSelected && <Check size={16} className="text-primary" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t flex justify-end gap-3" style={{ borderColor: colors.border }}>
                            <button onClick={() => setShowModal(false)} className="px-6 py-2 rounded-xl text-sm font-bold border hover:bg-white/5" style={{ borderColor: colors.border, color: colors.textMain }}>Cancel</button>
                            <button onClick={handleSave} className="px-8 py-2 rounded-xl bg-primary text-black font-bold hover:opacity-90 transition-all shadow-lg shadow-primary/20">
                                {editingItem ? 'Update' : 'Create'} {modalType}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
