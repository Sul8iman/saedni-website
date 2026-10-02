import { isActiveServiceArea } from "./service-areas.ts";

export const ROUTE_BASED_CATEGORIES = ["delivery", "transport", "shopping", "labor"] as const;

export const SINGLE_LOCATION_CATEGORIES = ["government", "home_services"] as const;
const REQUEST_CATEGORIES = [...ROUTE_BASED_CATEGORIES, ...SINGLE_LOCATION_CATEGORIES] as const;

export type RequestLocationInput = {
  category: string;
  area?: string | null;
  fromArea?: string | null;
  toArea?: string | null;
};

export type NormalizedRequestLocation = {
  area: string;
  fromArea: string | null;
  toArea: string | null;
};

export type RequestLocationValidation =
  | { success: true; data: NormalizedRequestLocation }
  | { success: false; field: "category" | "area" | "fromArea" | "toArea" };

export function isRouteBasedCategory(category: string): boolean {
  return (ROUTE_BASED_CATEGORIES as readonly string[]).includes(category);
}

export function normalizeNewRequestLocation(input: RequestLocationInput): RequestLocationValidation {
  if (!(REQUEST_CATEGORIES as readonly string[]).includes(input.category)) {
    return { success: false, field: "category" };
  }

  if (isRouteBasedCategory(input.category)) {
    const hasRouteFields = input.fromArea !== undefined || input.toArea !== undefined;
    if (!hasRouteFields) {
      // Keep accepting already-published clients that only send the legacy area.
      if (!isActiveServiceArea(input.area)) return { success: false, field: "area" };
      return {
        success: true,
        data: { area: input.area, fromArea: null, toArea: null },
      };
    }

    if (!isActiveServiceArea(input.fromArea)) return { success: false, field: "fromArea" };
    if (!isActiveServiceArea(input.toArea)) return { success: false, field: "toArea" };
    return {
      success: true,
      data: { area: input.fromArea, fromArea: input.fromArea, toArea: input.toArea },
    };
  }

  if (!isActiveServiceArea(input.area)) return { success: false, field: "area" };
  return { success: true, data: { area: input.area, fromArea: null, toArea: null } };
}

export type RequestLocationRecord = {
  category: string;
  area: string;
  fromArea?: string | null;
  toArea?: string | null;
};

export function requestMatchesAreaFilter(
  request: RequestLocationRecord,
  selectedAreas: readonly string[],
): boolean {
  const area = isRouteBasedCategory(request.category)
    ? request.fromArea ?? request.area
    : request.area;
  return selectedAreas.includes(area);
}