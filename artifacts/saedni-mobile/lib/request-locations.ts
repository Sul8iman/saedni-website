export const ROUTE_CATEGORIES = ["delivery", "transport", "shopping", "labor"] as const;

export function isRouteCategory(category: string): boolean {
  return (ROUTE_CATEGORIES as readonly string[]).includes(category);
}

export type RequestLocationValues = {
  category: string;
  area?: string | null;
  fromArea?: string | null;
  toArea?: string | null;
};

export function getRequestLocationLines(
  request: RequestLocationValues,
): Array<{ label: string; value: string }> {
  if (isRouteCategory(request.category) && request.fromArea && request.toArea) {
    return [
      { label: "من", value: request.fromArea },
      { label: "إلى", value: request.toArea },
    ];
  }
  return [{ label: "الموقع", value: request.area ?? "غير محدد" }];
}