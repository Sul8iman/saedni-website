import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeNewRequestLocation,
  requestMatchesAreaFilter,
} from "./request-locations.ts";

test("route categories require two active Muscat areas and store the origin as legacy area", () => {
  assert.deepEqual(
    normalizeNewRequestLocation({ category: "delivery", fromArea: "الخوض", toArea: "بوشر" }),
    {
      success: true,
      data: { area: "الخوض", fromArea: "الخوض", toArea: "بوشر" },
    },
  );
  assert.deepEqual(
    normalizeNewRequestLocation({ category: "transport", fromArea: "الخوض" }),
    { success: false, field: "toArea" },
  );
  assert.deepEqual(
    normalizeNewRequestLocation({ category: "shopping", fromArea: "صور", toArea: "بوشر" }),
    { success: false, field: "fromArea" },
  );
});

test("single-location categories keep area and discard route fields", () => {
  assert.deepEqual(
    normalizeNewRequestLocation({
      category: "government",
      area: "السيب",
      fromArea: "الخوض",
      toArea: "بوشر",
    }),
    { success: true, data: { area: "السيب", fromArea: null, toArea: null } },
  );
});

test("legacy route requests remain valid and use area as the origin fallback", () => {
  assert.deepEqual(
    normalizeNewRequestLocation({ category: "delivery", area: "بوشر" }),
    { success: true, data: { area: "بوشر", fromArea: null, toArea: null } },
  );
  assert.equal(
    requestMatchesAreaFilter(
      { category: "transport", area: "مطرح", fromArea: null, toArea: null },
      ["مطرح"],
    ),
    true,
  );
  assert.equal(
    requestMatchesAreaFilter(
      { category: "delivery", area: "مطرح", fromArea: "الخوض", toArea: "بوشر" },
      ["الخوض"],
    ),
    true,
  );
});