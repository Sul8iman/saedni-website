import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { HandHeart, KeyRound, RefreshCw, MessageCircle } from "lucide-react";
import { useRegister, useLogin, useVerifyOtp } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  name: z.string().min(2, "أدخل اسمك الكامل"),
  phone: z.string().min(8, "أدخل رقم هاتف صحيح"),
  userType: z.enum(["customer", "helper"]),
});

type FormData = z.infer<typeof schema>;
type Step = "form" | "otp";

export default function Register() {
  const { setUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const registerMutation = useRegister();
  const loginMutation    = useLogin();
  const verifyMutation   = useVerifyOtp();

  const [step, setStep]       = useState<Step>("form");
  const [phone, setPhone]     = useState("");
  const [otp, setOtp]         = useState("");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", userType: "customer" },
  });

  // ── Step 1: Submit registration form ─────────────────────────────────────
  const onSubmit = (data: FormData) => {
    registerMutation.mutate(
      { data },
      {
        onSuccess: (_res) => {
          setPhone(data.phone);
          setStep("otp");
        },
        onError: (err: any) => {
          const msg = err?.data?.error ?? "حدث خطأ أثناء إنشاء الحساب";
          toast({ title: "خطأ", description: msg, variant: "destructive" });
        },
      }
    );
  };

  // ── Step 2: Verify OTP → activates + logs in ──────────────────────────────
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 4) {
      toast({ title: "خطأ", description: "الرمز يتكون من 4 أرقام", variant: "destructive" });
      return;
    }
    verifyMutation.mutate(
      { data: { phone, otp: otp.trim() } },
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

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = () => {
    setOtp("");
    loginMutation.mutate(
      { data: { phone } },
      {
        onSuccess: () => {
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
        <p className="text-muted-foreground mt-1">
          {step === "form" ? "إنشاء حساب جديد" : "تفعيل الحساب"}
        </p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-border p-6">

        {/* ── Step 1: Registration form ── */}
        {step === "form" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم الكامل</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="أحمد محمد"
                        className="rounded-xl h-12 text-right"
                        data-testid="input-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الهاتف</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="968XXXXXXXX"
                        type="tel"
                        className="rounded-xl h-12 font-mono"
                        dir="ltr"
                        data-testid="input-phone"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="userType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع الحساب</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="rounded-xl h-12" data-testid="select-user-type">
                          <SelectValue placeholder="اختر نوع الحساب" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="customer">طالب مساعدة</SelectItem>
                        <SelectItem value="helper">مساعد</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold rounded-xl mt-2"
                disabled={registerMutation.isPending}
                data-testid="btn-submit-register"
              >
                {registerMutation.isPending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
              </Button>
            </form>
          </Form>
        )}

        {/* ── Step 2: OTP verification ── */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {/* Status banner */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>
              <p className="font-semibold text-sm">تم إنشاء حسابك بنجاح</p>
              <p className="text-xs text-muted-foreground mt-1">
                أدخل رمز التحقق المرسل من الإدارة للرقم:{" "}
                <span className="font-mono font-bold text-foreground" dir="ltr">{phone}</span>
              </p>
            </div>

            {/* WhatsApp contact button */}
            <a
              href={`https://wa.me/96892771450?text=${encodeURIComponent("مرحباً، قمت بإنشاء حساب جديد في تطبيق ساعدني وأحتاج رمز التحقق")}`}
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
              {verifyMutation.isPending ? "جارٍ التحقق..." : "تفعيل الحساب والدخول"}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => { setStep("form"); setOtp(""); }}
                className="text-muted-foreground hover:text-foreground"
                data-testid="btn-back-form"
              >
                تعديل البيانات
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loginMutation.isPending}
                className="text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                data-testid="btn-resend-otp"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loginMutation.isPending ? "animate-spin" : ""}`} />
                رمز جديد
              </button>
            </div>
          </form>
        )}
      </div>

      {step === "form" && (
        <p className="mt-5 text-center text-sm text-muted-foreground">
          لديك حساب بالفعل؟{" "}
          <a href="/login" className="text-primary font-semibold" data-testid="link-login">
            تسجيل الدخول
          </a>
        </p>
      )}
    </div>
  );
}
