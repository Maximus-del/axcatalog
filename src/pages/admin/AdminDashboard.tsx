import { StatCards } from "@/components/admin/dashboard/StatCards";
import { TopClients } from "@/components/admin/dashboard/TopClients";
import { RecentActivity } from "@/components/admin/dashboard/RecentActivity";
import { RecentBulkOrders } from "@/components/admin/dashboard/RecentBulkOrders";
import { SeedImagesButton } from "@/components/admin/dashboard/SeedImagesButton";

export default function AdminDashboard() {
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <header>
        <div className="ax-section-header mb-2">Overview</div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </header>

      <StatCards />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopClients />
        <RecentActivity />
      </div>

      <RecentBulkOrders />

      <SeedImagesButton />
    </div>
  );
}
