import { getStats } from '@/lib/db';
import KPIGrid from '@/components/KPIGrid';
import FunnelChart from '@/components/FunnelChart';
import DailyChart from '@/components/DailyChart';
import LeadTable from '@/components/LeadTable';
import PhantombusterUsageWidget from '@/components/PhantombusterUsage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const stats = getStats();

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <KPIGrid stats={stats} />

      {/* PhantomBuster quota */}
      <PhantombusterUsageWidget />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FunnelChart funnel={stats.funnel} />
        <DailyChart daily={stats.daily} />
      </div>

      {/* Leads table */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          📋 Tous les leads
        </h2>
        <LeadTable />
      </div>
    </div>
  );
}
