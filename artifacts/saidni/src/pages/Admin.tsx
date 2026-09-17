import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Users, ClipboardList, CheckCircle, Activity, Phone, MapPin, Clock, Banknote, User, Calendar, CheckCheck, Trash2 } from "lucide-react";
import {
  useGetAdminStats,
  getGetAdminStatsQueryKey,
  useListRequests,
  getListRequestsQueryKey,
  useUpdateRequest,
  useDeleteRequest,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_MAP } from "@/lib/categories";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/CategoryIcon";
import { ConfirmModal } from "@/components/ConfirmModal";

// Admin-only status labels
const ADMIN_STATUS: Record<string, { label: string; color: string }> = {
  available:   { label: "نشط",    color: "bg-green-100 text-green-700" },
  accepted:    { label: "نشط",    color: "bg-green-100 text-green-700" },
  in_progress: { label: "نشط",    color: "bg-green-100 text-green-700" },
  completed:   { label: "منتهي",  color: "bg-gray-100 text-gray-600" },
  cancelled:   { label: "ملغي",   color: "bg-red-100 text-red-700" },
};

// Format ISO date to Arabic-friendly short date
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ar-OM", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() },
  });

  const { data: requests, isLoading: requestsLoading } = useListRequests(undefined, {
    query: { queryKey: getListRequestsQueryKey() },
  });

  const updateMutation = useUpdateRequest();
  const deleteMutation = useDeleteRequest();

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // End a request — admin sets status to completed
  const handleEnd = (id: number) => {
    updateMutation.mutate(
      { id, data: { status: "completed" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
          toast({ title: "تم إنهاء الطلب" });
        },
        onError: () => {
          toast({ title: "خطأ", description: "فشل تحديث الطلب", variant: "destructive" });
        },
      }
    );
  };

  // Archive a request. The server keeps it recoverable for administrators.
  const handleDelete = () => {
    if (!pendingDeleteId) return;
    deleteMutation.mutate(
      { id: pendingDeleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
          setPendingDeleteId(null);
          toast({ title: "تمت أرشفة الطلب" });
        },
        onError: () => {
          setPendingDeleteId(null);
          toast({ title: "خطأ", description: "فشلت أرشفة الطلب", variant: "destructive" });
        },
      }
    );
  };

  const statCards = [
    { label: "إجمالي المستخدمين", value: stats?.totalUsers,       color: "text-blue-600 bg-blue-50",     icon: Users },
    { label: "المساعدون",          value: stats?.totalHelpers,      color: "text-teal-600 bg-teal-50",     icon: Users },
    { label: "طالبو المساعدة",     value: stats?.totalCustomers,    color: "text-purple-600 bg-purple-50", icon: Users },
    { label: "إجمالي الطلبات",     value: stats?.totalRequests,     color: "text-primary bg-primary/10",   icon: ClipboardList },
    { label: "الطلبات النشطة",     value: stats?.activeRequests,    color: "text-orange-600 bg-orange-50", icon: Activity },
    { label: "المنتهية",           value: stats?.completedRequests, color: "text-green-600 bg-green-50",   icon: CheckCircle },
  ];

  // Active requests first, then completed/cancelled
  const active = requests?.filter((r) => r.status !== "completed" && r.status !== "cancelled") ?? [];
  const closed = requests?.filter((r) => r.status === "completed" || r.status === "cancelled") ?? [];
  const sorted = [...active, ...closed];

  return (
    <div className="app-container bg-background" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold">لوحة التحكم</h1>
        <p className="text-muted-foreground text-sm">إدارة المنصة</p>
      </div>

      <div className="px-4 py-5 pb-nav space-y-6">
        {/* ── Stats grid ── */}
        <div className="grid grid-cols-3 gap-2">
          {statCards.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-border p-3 shadow-xs text-center" data-testid={`stat-card-${i}`}>
              {statsLoading ? (
                <Skeleton className="h-7 w-10 mx-auto mb-1" />
              ) : (
                <p className="text-2xl font-bold">{s.value ?? 0}</p>
              )}
              <p className="text-xs text-muted-foreground leading-tight mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Requests section ── */}
        <div>
          <h2 className="text-base font-bold mb-3">إدارة الطلبات</h2>

          {requestsLoading && Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl mb-2" />
          ))}

          {!requestsLoading && sorted.length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا يوجد طلبات</p>
          )}

          <div className="space-y-3">
            {sorted.map((req) => {
              const cat      = CATEGORY_MAP[req.category] ?? { label: req.category, icon: "HelpCircle" };
              const status   = ADMIN_STATUS[req.status]   ?? { label: req.status, color: "bg-gray-100 text-gray-700" };
              const isActive = req.status !== "completed" && req.status !== "cancelled";

              return (
                <div
                  key={req.id}
                  className={`bg-white rounded-2xl border shadow-xs overflow-hidden ${isActive ? "border-border" : "border-border/50 opacity-70"}`}
                  data-testid={`admin-request-${req.id}`}
                >
                  {/* Card header: category + status */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <CategoryIcon iconName={cat.icon} className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-primary">{cat.label}</span>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    {/* Request details */}
                    <p className="text-sm text-foreground leading-relaxed mb-3">{req.details}</p>

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {req.area}
                      </span>
                      <span className="flex items-center gap-1 font-bold text-green-700">
                        <Banknote className="w-3 h-3 flex-shrink-0" />
                        {req.offeredAmount} ر.ع.
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        {req.timeType === "now" ? "الآن" : req.scheduledDateTime ?? "مجدول"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {formatDate(req.createdAt)}
                      </span>
                    </div>

                    {/* Customer info */}
                    <div className="bg-muted/40 rounded-xl px-3 py-2 text-xs space-y-1">
                      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide mb-1">مقدم الطلب</p>
                      {req.customerName && (
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          {req.customerName}
                        </div>
                      )}
                      {req.customerPhone && (
                        <div className="flex items-center gap-1.5 text-muted-foreground font-mono" dir="ltr">
                          <Phone className="w-3.5 h-3.5" />
                          {req.customerPhone}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="border-t border-border px-4 py-3 flex gap-2">
                    {isActive && (
                      <Button
                        className="flex-1 rounded-xl h-9 text-sm bg-gray-700 hover:bg-gray-800 text-white"
                        onClick={() => handleEnd(req.id)}
                        disabled={updateMutation.isPending}
                        data-testid={`btn-end-${req.id}`}
                      >
                        <CheckCheck className="w-4 h-4 ml-1.5" />
                        إنهاء الطلب
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className={`rounded-xl h-9 text-sm text-red-600 border-red-200 hover:bg-red-50 ${isActive ? "px-3" : "flex-1"}`}
                      onClick={() => setPendingDeleteId(req.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`btn-delete-request-${req.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                      {!isActive && <span className="mr-1.5">أرشفة الطلب</span>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BottomNav />

      {/* Confirm archive modal */}
      <ConfirmModal
        open={pendingDeleteId !== null}
        title="أرشفة الطلب"
        message="سيتم نقل الطلب إلى الأرشيف. يمكن للمدير مراجعته واستعادته لاحقاً."
        confirmLabel="نعم، أرشفة الطلب"
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
