import assert from "node:assert/strict";
import test from "node:test";

import {
  nativePackageSurfaces,
  primaryNativeSurface,
} from "../scripts/native-package-surfaces.mjs";

test("current native package is the primary isolated-parser discovery surface", () => {
  assert.equal(primaryNativeSurface?.id, "current-native");
  assert.equal(primaryNativeSurface?.packageName, "@typescript/native");
  assert.equal(primaryNativeSurface?.primary, true);
});

test("native package surfaces are ordered and uniquely identified", () => {
  assert.deepEqual(
    nativePackageSurfaces.map(({ id, packageName, primary }) => ({
      id,
      packageName,
      primary,
    })),
    [
      {
        id: "current-native",
        packageName: "@typescript/native",
        primary: true,
      },
      {
        id: "native-preview",
        packageName: "@typescript/native-preview",
        primary: false,
      },
    ],
  );
  assert.equal(
    new Set(nativePackageSurfaces.map((surface) => surface.id)).size,
    nativePackageSurfaces.length,
  );
});

test("only the preview surface requires the legacy virtual filesystem helper", () => {
  const current = nativePackageSurfaces.find(
    (surface) => surface.id === "current-native",
  );
  const preview = nativePackageSurfaces.find(
    (surface) => surface.id === "native-preview",
  );

  assert.equal(current?.createFs, undefined);
  assert.equal(typeof preview?.createFs, "function");
});
