import { Link } from "wouter";
import { HandHeart, Truck, ShoppingBag, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

const exampleRequests = [
  { icon: Truck, category: "شاحنة للنقل", details: "نقل أغراض من بوشر إلى الغبرة", area: "بوشر", amount: 8 },
  { icon: ShoppingBag, category: "شراء أغراض", details: "شراء أغراض من السوق وتوصيلها", area: "الخوير", amount: 3 },
  { icon: Wrench, category: "خدمات منزلية", details: "تركيب مكيف جديد في غرفة النوم", area: "مسقط", amount: 15 },
];

export default function Welcome() {
  return (
    <div className="app-container min-h-screen flex flex-col" dir="rtl">
      {/* Hero */}
      <div className="bg-gradient-to-b from-primary/10 to-background px-6 pt-16 pb-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/15 mb-4">
          <HandHeart className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl font-bold text-primary mb-2">ساعدني</h1>
        <p className="text-foreground font-medium text-base">
          محتاج مساعدة؟ سوّي طلب وتفاعل مع المساعدين القريبين
        </p>
      </div>

      {/* Example cards */}
      <div className="px-4 pb-4">
        <p className="text-sm text-muted-foreground mb-3 text-center">أمثلة على الطلبات المتاحة</p>
        <div className="space-y-3">
          {exampleRequests.map((req, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-xs border border-border flex items-start gap-3" data-testid={`example-card-${i}`}>
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <req.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-primary">{req.category}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{req.details}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">{req.area}</span>
                  <span className="text-xs font-bold text-green-600">{req.amount} ر.ع.</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 py-6 mt-auto space-y-3">
        <Link href="/register">
          <Button className="w-full h-12 text-base font-semibold rounded-2xl" data-testid="btn-register">
            إنشاء حساب جديد
          </Button>
        </Link>
        <Link href="/login">
          <Button variant="outline" className="w-full h-12 text-base font-semibold rounded-2xl border-primary text-primary hover:bg-primary/5" data-testid="btn-login">
            تسجيل الدخول
          </Button>
        </Link>
      </div>
    </div>
  );
}
