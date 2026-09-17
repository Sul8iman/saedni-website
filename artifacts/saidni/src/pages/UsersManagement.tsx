import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight, User, Phone, Calendar, Clock, ClipboardList, CheckCheck,
  PowerOff, Power, KeyRound, RefreshCw, Trash2,
} from "lucide-react";
import {
  useListUsers,
  getListUsersQueryKey,
  useUpdateUser,
  useGetUser,
  getGetUserQueryKey,
  useListRequests,
  getListRequestsQueryKey,
  useLogin,
  useDeleteUser,
  useListServiceAreas,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_MAP } from "@/lib/categories";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/ConfirmModal";

const USER_TYPE_LABELS: Record<string, string> = {
  customer: "طالب مساعدة",
  helper:   "مساعد",
  admin:    "مدير",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-OM", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-OM", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ── User Detail Panel ─────────────────────────────────────────────────────────
function UserDetail({ userId, onBack }: { userId: number; onBack: () => void }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useGetUser(userId, {
    query: { queryKey: getGetUserQueryKey(userId) },
  });

  const { data: allRequests } = useListRequests(
    { customerId: userId },
    { query: { queryKey: getListRequestsQueryKey({ customerId: userId }) } }
  );

  const updateMutation = useUpdateUser();
  const loginMutation  = useLogin();
  const deleteMutation = useDeleteUser();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const activeRequests = allRequests?.filter((r) => r.status !== "completed" && r.status !== "cancelled") ?? [];
  const pastRequests   = allRequests?.filter((r) => r.status === "completed" || r.status === "cancelled") ?? [];

  const handleToggle = () => {
    if (!user) return;
    const next = !user.isActive;
    updateMutation.mutate(
      { id: user.id, data: { isActive: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: next ? "تم تفعيل الحساب" : "تم تعطيل الحساب" });
        },
        onError: () => {
          toast({ title: "خطأ", description: "فشل تحديث الحساب", variant: "destructive" });
        },
      }
    );
  };

  const handleGenerateOtp = () => {
    if (!user) return;
    loginMutation.mutate(
      { data: { phone: user.phone, userType: user.userType === "helper" ? "helper" : "customer" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(userId) });
          toast({ title: "تم إنشاء رمز جديد" });
        },
        onError: () => {
          toast({ title: "خطأ", description: "فشل إنشاء الرمز", variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteUser = () => {
    if (!user) return;

    // Self-delete guard on frontend
    if (currentUser?.id === user.id) {
      setShowDeleteConfirm(false);
      toast({ title: "غير مسموح", description: "لا يمكنك حذف حساب المدير", variant: "destructive" });
      return;
    }

    deleteMutation.mutate(
      { id: user.id, data: { confirmation: "حذف" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListRequestsQueryKey() });
          setShowDeleteConfirm(false);
          toast({ title: "تم تعطيل المستخدم وأرشفة طلباته" });
          onBack();
        },
        onError: (err: any) => {
          setShowDeleteConfirm(false);
          const msg = err?.data?.error ?? "فشل تعطيل المستخدم";
          toast({ title: "خطأ", description: msg, variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-4 pt-16">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user) return null;

  const isActive = user.isActive ?? true;

  return (
    <div className="app-container bg-background" dir="rtl">
      <div className="bg-white border-b border-border px-4 pt-12 pb-4 sticky top-0 z-10 flex items-center gap-3">
        <button onClick={onBack} className="text-muted-foreground" data-testid="btn-back-users">
          <ArrowRight className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">تفاصيل المستخدم</h1>
      </div>

      <div className="px-4 py-5 pb-nav space-y-4">
        {/* Identity card */}
        <div className="bg-white rounded-2xl border border-border p-5 shadow-xs text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${isActive ? "bg-primary/10" : "bg-muted"}`}>
            <User className={`w-8 h-8 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <h2 className="text-lg font-bold">{user.name}</h2>
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-medium">
              {USER_TYPE_LABELS[user.userType] ?? user.userType}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {isActive ? "مفعّل" : "معطّل"}
            </span>
            <span className={`text-xs px-3 py-1 rounded-full font-medium ${user.isVerified ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-600"}`}>
              {user.isVerified ? "✓ تم التحقق" : "بانتظار التحقق"}
            </span>
          </div>
        </div>

        {/* Info rows */}
        <div className="bg-white rounded-2xl border border-border shadow-xs divide-y divide-border">
          {[
            { icon: Phone,    label: "رقم الهاتف",      value: user.phone,                                    ltr: true },
            { icon: User,     label: "نوع الحساب",      value: USER_TYPE_LABELS[user.userType] ?? user.userType },
            { icon: Calendar, label: "تاريخ التسجيل",   value: formatDate(user.createdAt) },
            { icon: Clock,    label: "آخر تسجيل دخول", value: formatDateTime(user.lastLogin) },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3 px-4 py-3.5">
              <row.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className={`font-medium text-sm ${row.ltr ? "font-mono" : ""}`} dir={row.ltr ? "ltr" : undefined}>{row.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* OTP section */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4" data-testid="otp-section">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" />
              <p className="font-semibold text-amber-800 text-sm">رمز تسجيل الدخول</p>
            </div>
            <button
              onClick={handleGenerateOtp}
              disabled={loginMutation.isPending}
              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium disabled:opacity-50"
              data-testid="btn-generate-otp"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loginMutation.isPending ? "animate-spin" : ""}`} />
              إنشاء رمز جديد
            </button>
          </div>

          {user.otpCode ? (
            <div>
              <p className="text-3xl font-bold text-amber-700 tracking-[0.35em] text-center py-2" data-testid="otp-code">
                {user.otpCode}
              </p>
              <p className="text-xs text-amber-600 text-center mt-1">
                صدر في: {formatDateTime(user.otpCreatedAt)}
              </p>
              <p className="text-xs text-amber-500 text-center mt-0.5">
                (صالح لمدة 10 دقائق)
              </p>
            </div>
          ) : (
            <p className="text-sm text-amber-600 text-center py-2">
              لا يوجد رمز حالي — اضغط "إنشاء رمز جديد" لتوليد رمز للمستخدم
            </p>
          )}
        </div>

        {/* Request counts */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl border border-border p-3 text-center shadow-xs">
            <p className="text-2xl font-bold text-primary">{allRequests?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">إجمالي الطلبات</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 text-center shadow-xs">
            <p className="text-2xl font-bold text-orange-500">{activeRequests.length}</p>
            <p className="text-xs text-muted-foreground mt-1">الطلبات الحالية</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 text-center shadow-xs">
            <p className="text-2xl font-bold text-gray-500">{pastRequests.length}</p>
            <p className="text-xs text-muted-foreground mt-1">السابقة</p>
          </div>
        </div>

        {/* Current requests */}
        {activeRequests.length > 0 && (
          <div>
            <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-orange-500" />
              الطلبات الحالية
            </p>
            <div className="space-y-2">
              {activeRequests.map((req) => {
                const cat = CATEGORY_MAP[req.category] ?? { label: req.category };
                return (
                  <div key={req.id} className="bg-white rounded-xl border border-border p-3 shadow-xs">
                    <p className="text-xs font-semibold text-primary mb-0.5">{cat.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{req.details}</p>
                    <p className="text-xs text-green-600 font-bold mt-1">{req.offeredAmount} ر.ع. · {req.area}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Past requests */}
        {pastRequests.length > 0 && (
          <div>
            <p className="text-sm font-bold mb-2 flex items-center gap-1.5">
              <CheckCheck className="w-4 h-4 text-gray-400" />
              الطلبات السابقة
            </p>
            <div className="space-y-2">
              {pastRequests.map((req) => {
                const cat = CATEGORY_MAP[req.category] ?? { label: req.category };
                return (
                  <div key={req.id} className="bg-white rounded-xl border border-border p-3 shadow-xs opacity-70">
                    <p className="text-xs font-semibold text-muted-foreground mb-0.5">{cat.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{req.details}</p>
                    <p className="text-xs text-muted-foreground mt-1">{req.offeredAmount} ر.ع. · {req.area}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions: toggle + safe account deactivation */}
        <div className="pt-1 space-y-2">
          {isActive ? (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleToggle}
              disabled={updateMutation.isPending}
              data-testid="btn-toggle-user"
            >
              <PowerOff className="w-4 h-4 ml-2" />
              تعطيل المستخدم
            </Button>
          ) : (
            <Button
              className="w-full h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white"
              onClick={handleToggle}
              disabled={updateMutation.isPending}
              data-testid="btn-toggle-user"
            >
              <Power className="w-4 h-4 ml-2" />
              تفعيل المستخدم
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full h-11 rounded-xl text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
            data-testid="btn-delete-user"
          >
            <Trash2 className="w-4 h-4 ml-2" />
            تعطيل المستخدم
          </Button>
        </div>
      </div>

      {/* Confirm account deactivation modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="تعطيل المستخدم"
        message="سيتم تعطيل الحساب وحفظ طلباته في الأرشيف؛ لن تُحذف البيانات نهائياً."
        confirmLabel="نعم، تعطيل المستخدم"
        onConfirm={handleDeleteUser}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Users List ────────────────────────────────────────────────────────────────
export default function UsersManagement() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userType, setUserType] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [includeNoArea, setIncludeNoArea] = useState(false);
  const [isActive, setIsActive] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data: serviceAreas } = useListServiceAreas();
  const areaOptions = serviceAreas?.filter((area) => area.isActive).map((area) => area.name) ?? [];

  const listParams = {
    ...(userType ? { userType } : {}),
    ...(selectedAreas.length ? { area: selectedAreas } : {}),
    ...(includeNoArea ? { includeNoArea: true } : {}),
    ...(isActive ? { isActive: isActive === "active" } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    page,
    pageSize,
  };
  const { data: users, isLoading } = useListUsers(listParams, {
    query: { queryKey: getListUsersQueryKey(listParams) },
  });

  if (selectedUserId) {
    return <UserDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} />;
  }

  return (
    <div className="app-container bg-background" dir="rtl">
      <div className="bg-white border-b border-border px-4 pt-12 pb-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold">المستخدمون</h1>
        <p className="text-muted-foreground text-sm">اضغط على مستخدم لعرض التفاصيل وإدارة حسابه</p>
      </div>

      <div className="px-4 py-5 pb-nav space-y-2">
        <div className="bg-white rounded-2xl border border-border p-3 space-y-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث بالاسم أو الهاتف"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm text-right"
          />
          <div className="flex gap-2">
            <select value={userType} onChange={(event) => setUserType(event.target.value)} className="flex-1 rounded-xl border border-border px-2 py-2 text-sm">
              <option value="">كل الحسابات</option>
              <option value="customer">طالبي المساعدة</option>
              <option value="helper">المساعدون</option>
            </select>
            <select value={isActive} onChange={(event) => { setIsActive(event.target.value); setPage(1); }} className="flex-1 rounded-xl border border-border px-2 py-2 text-sm">
              <option value="">كل الحالات</option>
              <option value="active">مفعّل</option>
              <option value="inactive">معطّل</option>
            </select>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">المنطقة</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => { setSelectedAreas([]); setIncludeNoArea(false); setPage(1); }} className={`rounded-full px-2.5 py-1 text-xs ${selectedAreas.length === 0 && !includeNoArea ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              كل المناطق
            </button>
            <button type="button" onClick={() => { setIncludeNoArea((current) => !current); setPage(1); }} className={`rounded-full px-2.5 py-1 text-xs ${includeNoArea ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              بدون منطقة محددة
            </button>
            {areaOptions.map((item) => (
              <label key={item} className={`cursor-pointer rounded-full px-2.5 py-1 text-xs ${selectedAreas.includes(item) ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedAreas.includes(item)}
                  onChange={() => {
                    setSelectedAreas((current) => current.includes(item) ? current.filter((area) => area !== item) : [...current, item]);
                    setPage(1);
                  }}
                />
                {item}
              </label>
            ))}
          </div>
        </div>
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}

        {users?.filter((u) => u.userType !== "admin").map((u) => {
          const active = u.isActive ?? true;
          return (
            <button
              key={u.id}
              className="w-full bg-white rounded-2xl border border-border p-4 shadow-xs flex items-center gap-3 text-right hover:border-primary/40 hover:shadow-sm transition-all"
              onClick={() => setSelectedUserId(u.id)}
              data-testid={`user-row-${u.id}`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${active ? "bg-primary/10" : "bg-muted"}`}>
                <User className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${!active ? "text-muted-foreground" : ""}`}>{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.phone} · {USER_TYPE_LABELS[u.userType]}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {u.userType === "helper"
                    ? (u.serviceAreas?.length ? u.serviceAreas.join("، ") : "بدون مناطق خدمة")
                    : (u.area || "بدون منطقة محددة")}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">معطّل</span>
                )}
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          );
        })}
        <div className="flex items-center justify-between pt-2">
          <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40">السابق</button>
          <span className="text-xs text-muted-foreground">صفحة {page}</span>
          <button type="button" disabled={!users || users.length < pageSize} onClick={() => setPage((current) => current + 1)} className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40">التالي</button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
