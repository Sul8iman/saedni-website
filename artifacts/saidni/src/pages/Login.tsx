import { useState } from "react";
import { useLocation } from "wouter";
import { HandHeart, Phone, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, MessageCircle } from "lucide-react";
import { useLogin, useVerifyOtp, useAdminLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "phone" | "otp" | "admin-pin";

export default function Login() {
  const { setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginMutation      = useLogin();
  const verifyMutation     = useVerifyOtp();
  const adminLoginMutation = useAdminLogin();

  const [step, setStep]             = useState<Step>("phone");
  const [phone, setPhone]           = useState("");
  const [otp, setOtp]               = useState("");
  const [pin, setPin]               = useState("");
  const [unverified, setUnverified] = useState(false);

  // ── Step 1: Request OTP (or detect admin phone) ───────────────────────────
  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length < 8) {
      toast({ title: "خطأ", description: "أدخل رقم هاتف صحيح", variant: "destructive" });
      return;
    }
    loginMutation.mutate(
      { data: { phone: phone.trim() } },
      {
        onSuccess: (res) => {
          if (res.isAdmin) {
            setStep("admin-pin");
          } else {
            setUnverified(res.isVerified === false);
            setStep("otp");
          }
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "رقم الهاتف غير مسجل في النظام";
          toast({ title: "خطأ", description: msg, variant: "destructive" });
        },
      }
    );
  };

  // ── Step 2a: Verify OTP (regular users) ──────────────────────────────────
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 4) {
      toast({ title: "خطأ", description: "الرمز يتكون من 4 أرقام", variant: "destructive" });
      return;
    }
    verifyMutation.mutate(
      { data: { phone: phone.trim(), otp: otp.trim() } },
      {
        onSuccess: (response) => {
          setUser(response.user);
          const t = response.user.userType;
          const dest = t === "admin" ? "/admin" : t === "helper" ? "/helper-requests" : "/customer";
          setLocation(dest);
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "رمز التحقق غير صحيح";
          toast({ title: "خطأ", description: msg, variant: "destructive" });
        },
      }
    );
  };

  // ── Step 2b: Verify admin PIN ─────────────────────────────────────────────
  const handleAdminPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.trim().length < 1) return;
    adminLoginMutation.mutate(
      { data: { phone: phone.trim(), pin: pin.trim() } },
      {
        onSuccess: (response) => {
          setUser(response.user);
          setLocation("/admin");
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "رمز المدير غير صحيح";
          toast({ title: "خطأ", description: msg, variant: "destructive" });
          setPin("");
        },
      }
    );
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = () => {
    setOtp("");
    loginMutation.mutate(
      { data: { phone: phone.trim() } },
      {
        onSuccess: (res) => {
          setUnverified(res.isVerified === false);
          toast({ title: "تم إنشاء رمز جديد" });
        },
        onError: () => {
          toast({ title: "خطأ", description: "فشل إنشاء رمز جديد", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="app-container min-h-screen flex flex-col justify-center px-6 py-12 bg-background" dir="rtl">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/15 mb-3">
          <HandHeart className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-primary">ساعدني</h1>
        <p className="text-muted-foreground mt-1">أهلاً بعودتك</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-border p-6">

        {/* ── Step 1: Phone ── */}
        {step === "phone" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="w-5 h-5 text-primary" />
              <p className="font-semibold text-sm">أدخل رقم هاتفك</p>
            </div>
            <Input
              type="tel"
              placeholder="968XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-xl h-12 font-mono"
              data-testid="input-phone"
              dir="ltr"
            />
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold rounded-xl"
              disabled={loginMutation.isPending}
              data-testid="btn-request-otp"
            >
              {loginMutation.isPending ? "جارٍ الإرسال..." : "متابعة"}
            </Button>
          </form>
        )}

        {/* ── Step 2a: OTP (regular users) ── */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center mb-2">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${unverified ? "bg-orange-100" : "bg-primary/10"}`}>
                {unverified
                  ? <ShieldAlert className="w-6 h-6 text-orange-500" />
                  : <KeyRound className="w-6 h-6 text-primary" />
                }
              </div>
              <p className="font-semibold">
                {unverified ? "حسابك غير مفعّل بعد" : "أدخل رمز التحقق"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {unverified
                  ? "يرجى إدخال رمز التحقق من الإدارة لتفعيل حسابك"
                  : <>أدخل رمز التحقق المرسل من الإدارة للرقم: <span className="font-mono font-bold text-foreground" dir="ltr">{phone}</span></>
                }
              </p>
            </div>

            {unverified && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center" data-testid="unverified-banner">
                <p className="text-xs text-orange-700 font-medium">
                  حسابك غير مفعل. يرجى إدخال رمز التحقق من الإدارة للرقم:{" "}
                  <span className="font-mono font-bold" dir="ltr">{phone}</span>
                </p>
              </div>
            )}

            {/* WhatsApp contact button */}
            <a
              href={`https://wa.me/96892771450?text=${encodeURIComponent("مرحباً، أحتاج رمز التحقق للدخول إلى تطبيق ساعدني")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1ebe5d] text-white font-semibold text-sm transition-colors"
              data-testid="btn-whatsapp-admin"
            >
              <MessageCircle className="w-5 h-5 flex-shrink-0" />
              التواصل مع الإدارة عبر الواتساب
            </a>

            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="- - - -"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="rounded-xl h-14 text-center text-2xl tracking-[0.4em] font-mono"
              data-testid="input-otp"
              dir="ltr"
            />

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold rounded-xl"
              disabled={verifyMutation.isPending || otp.length < 4}
              data-testid="btn-verify-otp"
            >
              {verifyMutation.isPending
                ? "جارٍ التحقق..."
                : unverified ? "تفعيل الحساب والدخول" : "تأكيد الدخول"
              }
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => { setStep("phone"); setOtp(""); setUnverified(false); }}
                className="text-muted-foreground hover:text-foreground"
                data-testid="btn-back-phone"
              >
                تغيير الرقم
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loginMutation.isPending}
                className="text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                data-testid="btn-resend-otp"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                رمز جديد
              </button>
            </div>
          </form>
        )}

        {/* ── Step 2b: Admin PIN ── */}
        {step === "admin-pin" && (
          <form onSubmit={handleAdminPin} className="space-y-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-primary/10">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <p className="font-semibold">دخول المدير</p>
              <p className="text-xs text-muted-foreground mt-1">
                أدخل رمز المدير للمتابعة
              </p>
            </div>

            <Input
              type="password"
              inputMode="numeric"
              placeholder="رمز المدير"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="rounded-xl h-14 text-center text-2xl tracking-[0.4em] font-mono"
              data-testid="input-admin-pin"
              dir="ltr"
              autoComplete="off"
            />

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold rounded-xl"
              disabled={adminLoginMutation.isPending || pin.length < 1}
              data-testid="btn-verify-admin-pin"
            >
              {adminLoginMutation.isPending ? "جارٍ التحقق..." : "دخول"}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setStep("phone"); setPin(""); }}
                className="text-sm text-muted-foreground hover:text-foreground"
                data-testid="btn-back-from-pin"
              >
                تغيير الرقم
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <a href="/register" className="text-primary font-semibold" data-testid="link-register">
          إنشاء حساب
        </a>
      </p>

      <div className="mt-6 bg-primary/5 rounded-2xl p-4 text-xs text-muted-foreground text-center space-y-1">
        <p className="font-medium text-foreground">حسابات تجريبية:</p>
        <p>طالب مساعدة: 96891000001</p>
        <p>مساعد: 96891000003</p>
      </div>
    </div>
  );
}
