export const ACTIVE_SERVICE_AREAS = [
  { name: "مسقط", governorate: "مسقط", sortOrder: 1 },
  { name: "بوشر", governorate: "مسقط", sortOrder: 2 },
  { name: "الخوير", governorate: "مسقط", sortOrder: 3 },
  { name: "الغبرة", governorate: "مسقط", sortOrder: 4 },
  { name: "الموالح", governorate: "مسقط", sortOrder: 5 },
  { name: "السيب", governorate: "مسقط", sortOrder: 6 },
  { name: "العامرات", governorate: "مسقط", sortOrder: 7 },
  { name: "المعبيلة", governorate: "مسقط", sortOrder: 8 },
  { name: "الخوض", governorate: "مسقط", sortOrder: 9 },
  { name: "الأنصب", governorate: "مسقط", sortOrder: 10 },
  { name: "العذيبة", governorate: "مسقط", sortOrder: 11 },
  { name: "القرم", governorate: "مسقط", sortOrder: 12 },
  { name: "غلا", governorate: "مسقط", sortOrder: 13 },
  { name: "روي", governorate: "مسقط", sortOrder: 14 },
  { name: "مطرح", governorate: "مسقط", sortOrder: 15 },
  { name: "قريات", governorate: "مسقط", sortOrder: 16 },
] as const;

const activeAreaNames = new Set<string>(ACTIVE_SERVICE_AREAS.map((area) => area.name));

export function isActiveServiceArea(area: unknown): area is string {
  return typeof area === "string" && activeAreaNames.has(area);
}

/**
 * Legacy preferred_areas is JSON text. Invalid, null, empty, or non-string
 * values intentionally become "no configured areas" rather than throwing.
 */
export function parsePreferredAreas(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((area): area is string => typeof area === "string" && area.length > 0))];
  } catch {
    return [];
  }
}

export function hasConfiguredServiceArea(value: string | null | undefined): boolean {
  return parsePreferredAreas(value).some((area) => isActiveServiceArea(area));
}

export function helperServesArea(value: string | null | undefined, area: string): boolean {
  return parsePreferredAreas(value).includes(area);
}

export type HelperAreaCountRecord = {
  id: number;
  preferredAreas?: string | null;
};

export function countHelpersByArea(rows: HelperAreaCountRecord[]): {
  totalCount: number;
  noAreaCount: number;
  counts: Map<string, number>;
} {
  const helperIds = new Set<number>();
  const noAreaIds = new Set<number>();
  const areaHelperIds = new Map<string, Set<number>>();

  for (const row of rows) {
    helperIds.add(row.id);
    const validAreas = new Set(parsePreferredAreas(row.preferredAreas).filter(isActiveServiceArea));
    if (validAreas.size === 0) noAreaIds.add(row.id);

    for (const area of validAreas) {
      const ids = areaHelperIds.get(area) ?? new Set<number>();
      ids.add(row.id);
      areaHelperIds.set(area, ids);
    }
  }

  return {
    totalCount: helperIds.size,
    noAreaCount: noAreaIds.size,
    counts: new Map([...areaHelperIds].map(([area, ids]) => [area, ids.size])),
  };
}

/**
 * Express query parsing returns one repeated query parameter as a string and
 * multiple repeated values as an array. Normalize both forms before the
 * generated array schema validates the request.
 */
export function normalizeAreaQuery(value: unknown): unknown[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

/**
 * Query-string booleans arrive as strings. Boolean("false") is true, so
 * normalize the explicit values before the generated query schema coerces them.
 */
export function normalizeBooleanQuery(value: unknown): unknown {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}

export type UserAreaFilterRecord = {
  userType: string;
  area?: string | null;
  preferredAreas?: string | null;
};

export function getUserAreaValues(user: UserAreaFilterRecord): string[] {
  if (user.userType === "helper") {
    return parsePreferredAreas(user.preferredAreas);
  }
  return typeof user.area === "string" && user.area.length > 0 ? [user.area] : [];
}

export function userHasConfiguredActiveArea(user: UserAreaFilterRecord): boolean {
  if (user.userType === "helper") {
    return hasConfiguredServiceArea(user.preferredAreas);
  }
  return isActiveServiceArea(user.area);
}

export function matchesUserAreaFilter(
  user: UserAreaFilterRecord,
  selectedAreas: string[],
  includeNoArea: boolean,
): boolean {
  if (selectedAreas.length === 0 && !includeNoArea) return true;

  const hasAreaMatch = selectedAreas.some((area) => getUserAreaValues(user).includes(area));
  const noAreaMatch = includeNoArea && !userHasConfiguredActiveArea(user);
  return hasAreaMatch || noAreaMatch;
}

export function validatePreferredAreas(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const areas = [...new Set(value)];
  return areas.length > 0 && areas.every((area) => isActiveServiceArea(area)) ? areas : null;
}