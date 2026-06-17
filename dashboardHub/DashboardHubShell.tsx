import React, { useState } from 'react';
import DashboardHubTabBar from './DashboardHubTabBar';
import { type DashboardHubTabId } from './dashboardHubTabs';
import DashboardHubFeedPage from './pages/DashboardHubFeedPage';
import DashboardHubRequestsPage from './pages/DashboardHubRequestsPage';
import DashboardHubRoomsPage from './pages/DashboardHubRoomsPage';
import DashboardHubMicePage from './pages/DashboardHubMicePage';
import DashboardHubRevenueMixPage from './pages/DashboardHubRevenueMixPage';
import DashboardHubCrmPage from './pages/DashboardHubCrmPage';
import DashboardHubAccountsPage from './pages/DashboardHubAccountsPage';
import DashboardHubPromotionsPage from './pages/DashboardHubPromotionsPage';
import DashboardHubAgreementsPage from './pages/DashboardHubAgreementsPage';
import DashboardHubActivitiesPage from './pages/DashboardHubActivitiesPage';
import DashboardHubSalesPerformancePage from './pages/DashboardHubSalesPerformancePage';

type DashboardHubShellProps = {
    colors: any;
    children: React.ReactNode;
};

function DashboardHubTabPage({ tabId, colors }: { tabId: DashboardHubTabId; colors: any }) {
    switch (tabId) {
        case 'feed':
            return <DashboardHubFeedPage colors={colors} />;
        case 'requests':
            return <DashboardHubRequestsPage colors={colors} />;
        case 'rooms':
            return <DashboardHubRoomsPage colors={colors} />;
        case 'mice':
            return <DashboardHubMicePage colors={colors} />;
        case 'revenue-mix':
            return <DashboardHubRevenueMixPage colors={colors} />;
        case 'crm':
            return <DashboardHubCrmPage colors={colors} />;
        case 'accounts':
            return <DashboardHubAccountsPage colors={colors} />;
        case 'promotions':
            return <DashboardHubPromotionsPage colors={colors} />;
        case 'agreements':
            return <DashboardHubAgreementsPage colors={colors} />;
        case 'activities':
            return <DashboardHubActivitiesPage colors={colors} />;
        case 'sales-performance':
            return <DashboardHubSalesPerformancePage colors={colors} />;
        default:
            return null;
    }
}

export default function DashboardHubShell({ colors, children }: DashboardHubShellProps) {
    const [activeTab, setActiveTab] = useState<DashboardHubTabId>('dashboard');

    const handleTabClick = (tabId: DashboardHubTabId) => {
        if (tabId === activeTab) return;
        setActiveTab(tabId);
    };

    return (
        <>
            <div className="col-span-1 md:col-span-12 min-w-0">
                <DashboardHubTabBar activeTab={activeTab} onTabClick={handleTabClick} colors={colors} />
            </div>

            {activeTab === 'dashboard' ? children : <DashboardHubTabPage tabId={activeTab} colors={colors} />}
        </>
    );
}
