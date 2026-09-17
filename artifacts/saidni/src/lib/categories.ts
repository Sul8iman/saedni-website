// Category definitions for ساعدني

export const CATEGORIES = [
  { value: "delivery", label: "مندوب توصيل", icon: "Bike" },
  { value: "transport", label: "شاحنة للنقل", icon: "Truck" },
  { value: "government", label: "معاملات ومراجعات", icon: "FileText" },
  { value: "shopping", label: "شراء أغراض", icon: "ShoppingBag" },
  { value: "home_services", label: "خدمات منزلية", icon: "Wrench" },
  { value: "labor", label: "أخرى", icon: "MapPin" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_MAP: Record<string, { label: string; icon: string }> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, { label: c.label, icon: c.icon }])
);

export const AREAS = [
  "مسقط",
  "بوشر",
  "الخوير",
  "الغبرة",
  "الموالح",
  "السيب",
  "العامرات",
  "المعبيلة",
  "الخوض",
  "الأنصب",
  "العذيبة",
  "القرم",
  "غلا",
  "روي",
  "مطرح",
  "قريات",
];

export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  available:   { label: "نشط",   color: "bg-green-100 text-green-700" },
  accepted:    { label: "نشط",   color: "bg-green-100 text-green-700" },
  in_progress: { label: "نشط",   color: "bg-green-100 text-green-700" },
  completed:   { label: "منتهي", color: "bg-gray-100 text-gray-600" },
  cancelled:   { label: "ملغي",  color: "bg-red-100 text-red-700" },
};
