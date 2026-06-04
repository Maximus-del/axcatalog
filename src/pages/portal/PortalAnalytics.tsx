import { PortalSection } from "@/components/portal/PortalSection";
import { AnalyticsTopProducts } from "@/components/portal/AnalyticsTopProducts";
import { AnalyticsRevenueChart } from "@/components/portal/AnalyticsRevenueChart";
import { AnalyticsRecentOrders } from "@/components/portal/AnalyticsRecentOrders";
import { SuperfansCard } from "@/components/portal/home/SuperfansCard";
import { FanbaseMap } from "@/components/portal/home/FanbaseMap";
import { usePortalData } from "@/components/portal/PortalDataContext";

export default function PortalAnalytics() {
  const { products, productsLoading, sales, orders, ordersLoading } = usePortalData();
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-bottom-nav md:pb-32">
      <PortalSection id="sec-analytics" title="Analytics">
        <div className="space-y-6">
          <div>
            <div className="ax-label mb-3">Top Products</div>
            <AnalyticsTopProducts
              products={products}
              loading={productsLoading}
              salesByProduct={sales.byProduct}
            />
          </div>
          <div>
            <div className="ax-label mb-3">Revenue Over Time</div>
            <AnalyticsRevenueChart />
          </div>
          <div>
            <div className="ax-label mb-3">Recent Orders</div>
            <AnalyticsRecentOrders orders={orders} loading={ordersLoading} />
          </div>
          <div>
            <div className="ax-label mb-3">Superfans</div>
            <SuperfansCard />
          </div>
          <div>
            <div className="ax-label mb-3">Fanbase Map</div>
            <FanbaseMap />
          </div>
        </div>
      </PortalSection>
    </main>
  );
}