import assert from "node:assert/strict";
import test from "node:test";

import { CustomWardrobeController } from "../dist/haruki-3d-engine-internal.js";

function makePartSet(registry) {
  return {
    registry,
    roles: [],
    compatibility: null,
    packages: new Map([
      ["parts/body", {}],
      ["parts/hair", {}],
    ]),
    roleRuntimes: new Map(),
    baseUrl: "/runtime/jp/",
  };
}

function makeRuntime(entry) {
  return {
    version: "1",
    packagePath: entry.packagePath,
    part: { ...entry },
    manifest: {
      id: entry.packagePath,
      characterHeightMeters: 1.6,
      proxy: {},
      source: { meshUrl: "mesh.glb" },
      assembly: {},
      bodyMaterials: [],
      faceMaterials: [],
    },
    nativeMeshes: {
      meshes: entry.partType === "head"
        ? [
          { rendererTransformPath: "face/Face" },
          { rendererTransformPath: "face/Hair" },
        ]
        : [],
    },
    springBone: {
      prefabGraph: {
        transforms: entry.partType === "body"
          ? [
            { pathId: 1, parentPathId: null, transformPath: "body" },
            { pathId: 2, parentPathId: 1, transformPath: "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck" },
            { pathId: 3, parentPathId: 2, transformPath: "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck/Head" },
          ]
          : [
            { pathId: 1, parentPathId: null, transformPath: "face" },
            { pathId: 2, parentPathId: 1, transformPath: "face/Position/Hip/Waist/Spine/Chest/Neck" },
            { pathId: 3, parentPathId: 2, transformPath: "face/Position/Hip/Waist/Spine/Chest/Neck/Head" },
          ],
      },
    },
    textureRoles: [{ source: entry.packagePath }],
  };
}

function makeComposablePartSet(registry, activeContributors) {
  return {
    ...makePartSet(registry),
    compatibility: {
      rules: [{
        unit: "light_sound",
        headCostume3dId: 797009,
        hairCostume3dId: 102,
        state: "available",
        headCompositionKind: "raw-only",
        activeContributors,
      }],
    },
    packages: new Map(registry.map((entry) => [entry.packagePath, makeRuntime(entry)])),
  };
}

function makeFixture(order = "shared-first") {
  const shared = {
    costume3dId: 797009,
    partType: "head_optional",
    headCostume3dAssetbundleType: "head_only",
    characterId: 2,
    unit: "light_sound",
    packagePath: "parts/_sources/head_optional/shared",
    status: "available",
  };
  const exclusive = {
    costume3dId: 797009,
    partType: "head",
    headCostume3dAssetbundleType: "head_and_hair",
    characterId: 2,
    unit: "light_sound",
    packagePath: "parts/_sources/head/exclusive",
    status: "available",
  };
  const fixed = [
    {
      costume3dId: 100,
      partType: "body",
      characterId: 2,
      unit: "light_sound",
      packagePath: "parts/body",
      status: "available",
    },
    {
      costume3dId: 102,
      partType: "hair",
      characterId: 2,
      unit: "light_sound",
      packagePath: "parts/hair",
      status: "available",
    },
  ];
  return {
    shared,
    exclusive,
    registry: [
      ...fixed,
      ...(order === "shared-first" ? [shared, exclusive] : [exclusive, shared]),
    ],
  };
}

function selection(headPackagePath) {
  return {
    characterId: 2,
    unit: "light_sound",
    bodyCostume3dId: 100,
    headCostume3dId: 797009,
    headPackagePath,
    hairCostume3dId: 102,
    headOptionalCostume3dId: null,
  };
}

test("same raw accessory id selects its exact package independent of registry order", async () => {
  for (const order of ["shared-first", "exclusive-first"]) {
    const fixture = makeFixture(order);
    const selected = [];
    const wardrobe = new CustomWardrobeController({
      resolveUrl: (value) => value,
      loadPartRuntime: async (entry) => {
        selected.push(entry.packagePath);
        throw new Error(`selected:${entry.packagePath}`);
      },
    });
    wardrobe.loadPartPackageSet(makePartSet(fixture.registry), { composeDefault: false });
    wardrobe.selectRole(2, "light_sound");

    await assert.rejects(
      wardrobe.setCustomSelection(selection(fixture.shared.packagePath)),
      new RegExp(`selected:${fixture.shared.packagePath}`)
    );
    await assert.rejects(
      wardrobe.setCustomSelection(selection(fixture.exclusive.packagePath)),
      new RegExp(`selected:${fixture.exclusive.packagePath}`)
    );
    assert.deepEqual(selected, [fixture.shared.packagePath, fixture.exclusive.packagePath]);
  }
});

test("selecting another role clears the previous combined character", async () => {
  const fixture = makeFixture();
  const wardrobe = new CustomWardrobeController({
    resolveUrl: (value) => value,
  });
  wardrobe.loadPartPackageSet(makeComposablePartSet(fixture.registry, [
    fixture.shared.packagePath,
    "parts/body",
    "parts/hair",
  ]), { composeDefault: false });
  wardrobe.selectRole(2, "light_sound");
  await wardrobe.setCustomSelection(selection(fixture.shared.packagePath));

  assert.ok(wardrobe.getCombinedCharacter());
  wardrobe.selectRole(3, "idol");
  assert.equal(wardrobe.getCombinedCharacter(), null);
  assert.equal(wardrobe.getCustomSelection(), null);
});

test("same raw accessory id without a package path is rejected as ambiguous", async () => {
  const fixture = makeFixture();
  const selected = [];
  const wardrobe = new CustomWardrobeController({
    resolveUrl: (value) => value,
    loadPartRuntime: async (entry) => {
      selected.push(entry.packagePath);
      return null;
    },
  });
  wardrobe.loadPartPackageSet(makePartSet(fixture.registry), { composeDefault: false });
  wardrobe.selectRole(2, "light_sound");

  await assert.rejects(
    wardrobe.setCustomSelection(selection(null)),
    /Ambiguous head registry entry.*specify headPackagePath/
  );
  assert.deepEqual(selected, []);
});

test("exact source controls successful composition despite conflicting raw-only metadata", async () => {
  for (const activeContributors of [["head"], ["hair", "head_optional"]]) {
    const fixture = makeFixture();
    const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });
    wardrobe.loadPartPackageSet(
      makeComposablePartSet(fixture.registry, activeContributors),
      { composeDefault: false }
    );
    wardrobe.selectRole(2, "light_sound");

    const shared = await wardrobe.setCustomSelection(selection(fixture.shared.packagePath));
    assert.equal(shared.headAsset.source.meshUrl, "parts/hair/mesh.glb");
    assert.deepEqual(
      shared.runtimeExtension.textureRoles.map((entry) => entry.source),
      ["parts/body", "parts/hair", fixture.shared.packagePath]
    );
    assert.equal(wardrobe.getCustomSelection().headPackagePath, fixture.shared.packagePath);

    const exclusive = await wardrobe.setCustomSelection(selection(fixture.exclusive.packagePath));
    assert.equal(exclusive.headAsset.source.meshUrl, `${fixture.exclusive.packagePath}/mesh.glb`);
    assert.deepEqual(
      exclusive.runtimeExtension.textureRoles.map((entry) => entry.source),
      ["parts/body", fixture.exclusive.packagePath]
    );
    assert.equal(wardrobe.getCustomSelection().headPackagePath, fixture.exclusive.packagePath);
    assert.notEqual(shared.id, exclusive.id);
  }
});

test("raw hair denial is evaluated against the resolved source slot", async () => {
  const fixture = makeFixture();
  const partSet = makeComposablePartSet(fixture.registry, ["hair", "head_optional"]);
  partSet.compatibility.rules[0].state = "not_available";
  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });
  wardrobe.loadPartPackageSet(partSet, { composeDefault: false });
  wardrobe.selectRole(2, "light_sound");

  await assert.rejects(
    wardrobe.setCustomSelection(selection(fixture.shared.packagePath)),
    /not available together/
  );
  const exclusive = await wardrobe.setCustomSelection(selection(fixture.exclusive.packagePath));
  assert.equal(exclusive.headAsset.source.meshUrl, `${fixture.exclusive.packagePath}/mesh.glb`);
});

test("a unique raw source is canonicalized to its package path", async () => {
  const fixture = makeFixture();
  const registry = fixture.registry.filter((entry) => entry !== fixture.exclusive);
  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });
  wardrobe.loadPartPackageSet(makeComposablePartSet(registry, ["head"]), {
    composeDefault: false,
  });
  wardrobe.selectRole(2, "light_sound");

  const combined = await wardrobe.setCustomSelection(selection(null));
  assert.equal(wardrobe.getCustomSelection().headPackagePath, fixture.shared.packagePath);
  assert.match(combined.id, /parts%2F_sources%2Fhead_optional%2Fshared/);
});

test("default selection never treats the first loaded colliding source as unique", () => {
  for (const loadedHead of ["shared", "exclusive"]) {
    const fixture = makeFixture();
    const partSet = makeComposablePartSet(fixture.registry, ["head"]);
    const unloaded = loadedHead === "shared" ? fixture.exclusive : fixture.shared;
    partSet.packages.delete(unloaded.packagePath);
    const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });

    assert.equal(wardrobe.loadPartPackageSet(partSet), null);
    assert.equal(wardrobe.getCustomSelection(), null);
  }
});

test("runtime role default with colliding sources fails closed", () => {
  const fixture = makeFixture();
  const partSet = makeComposablePartSet(fixture.registry, ["head"]);
  partSet.roles = [{
    roleId: 2,
    characterId: 2,
    unit: "light_sound",
    bodyCostume3dId: 100,
    headCostume3dId: 797009,
    hairCostume3dId: 102,
    roleRuntimePath: "roles/2/light_sound/role-runtime.msgpack.br",
  }];
  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });

  assert.throws(
    () => wardrobe.loadPartPackageSet(partSet),
    /Ambiguous head registry entry.*specify headPackagePath/
  );
});

test("default selection counts an empty optional source as an independent identity", () => {
  const fixture = makeFixture();
  const empty = {
    ...fixture.shared,
    status: "empty",
    packagePath: "parts/_sources/head_optional/empty",
  };
  const registry = [
    ...fixture.registry.filter((entry) => entry !== fixture.shared),
    empty,
  ];
  const partSet = makeComposablePartSet(registry, ["head"]);
  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });

  assert.equal(wardrobe.loadPartPackageSet(partSet), null);
  assert.equal(wardrobe.getCustomSelection(), null);
});

test("an exact empty optional source composes with hair instead of raw metadata", async () => {
  const fixture = makeFixture();
  const empty = {
    ...fixture.shared,
    status: "empty",
    packagePath: "parts/_sources/head_optional/empty",
  };
  const registry = [
    ...fixture.registry.filter((entry) => entry !== fixture.shared),
    empty,
  ];
  const partSet = makeComposablePartSet(registry, ["head"]);
  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });
  wardrobe.loadPartPackageSet(partSet, { composeDefault: false });
  wardrobe.selectRole(2, "light_sound");

  const combined = await wardrobe.setCustomSelection(selection(empty.packagePath));
  assert.equal(combined.headAsset.source.meshUrl, "parts/hair/mesh.glb");
  assert.deepEqual(
    combined.runtimeExtension.textureRoles.map((entry) => entry.source),
    ["parts/body", "parts/hair"]
  );
});

test("legacy optional-head selector rejects independent sources with the same raw id", async () => {
  const fixture = makeFixture();
  const optionalA = {
    ...fixture.shared,
    costume3dId: 555,
    packagePath: "parts/_sources/head_optional/optional-a",
  };
  const optionalB = {
    ...fixture.shared,
    costume3dId: 555,
    packagePath: "parts/_sources/head_optional/optional-b",
  };
  const registry = [...fixture.registry, optionalA, optionalB];
  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });
  wardrobe.loadPartPackageSet(makeComposablePartSet(registry, ["head"]), {
    composeDefault: false,
  });
  wardrobe.selectRole(2, "light_sound");

  await assert.rejects(
    wardrobe.setCustomSelection({
      ...selection(fixture.exclusive.packagePath),
      headOptionalCostume3dId: 555,
    }),
    /Ambiguous head_optional registry entry.*cannot identify one original source/
  );
});

test("complete heads inherit missing role eye textures without importing default hair geometry", async () => {
  const fixture = makeFixture();
  const defaultHair = {
    costume3dId: 202,
    partType: "hair",
    characterId: 2,
    unit: "light_sound",
    packagePath: "parts/default-hair",
    status: "available",
  };
  const registry = [...fixture.registry, defaultHair];
  const partSet = makeComposablePartSet(registry, ["head"]);
  partSet.roles = [{
    roleId: 2,
    characterId: 2,
    unit: "light_sound",
    bodyCostume3dId: 100,
    headCostume3dId: 3,
    hairCostume3dId: 202,
    roleRuntimePath: "roles/2/light_sound/role-runtime.msgpack.br",
  }];
  const completeHead = partSet.packages.get(fixture.exclusive.packagePath);
  completeHead.materialSlots = [
    { name: "mtl_chr_eye_00", materialKind: "eye" },
    { name: "mtl_chr_ehl_00", materialKind: "eyelight" },
    { name: "mtl_chr_00", materialKind: "face", mainTex: "custom-face.ktx2" },
  ];
  completeHead.characterTextures = { face: "custom-face.ktx2" };
  const defaultHairRuntime = partSet.packages.get(defaultHair.packagePath);
  defaultHairRuntime.materialSlots = [
    { name: "mtl_chr_eye_00", materialKind: "eye", mainTex: "default-eye.ktx2" },
    { name: "mtl_chr_ehl_00", materialKind: "eyelight", mainTex: "default-eyelight.ktx2" },
    { name: "mtl_chr_00", materialKind: "face", mainTex: "default-face.ktx2" },
  ];
  defaultHairRuntime.characterTextures = {
    eye: "default-eye.ktx2",
    eyelight: "default-eyelight.ktx2",
    face: "default-face.ktx2",
  };

  const wardrobe = new CustomWardrobeController({ resolveUrl: (value) => value });
  wardrobe.loadPartPackageSet(partSet, { composeDefault: false });
  wardrobe.selectRole(2, "light_sound");
  const combined = await wardrobe.setCustomSelection(selection(fixture.exclusive.packagePath));

  assert.deepEqual(
    combined.headAsset.faceMaterials.map(({ materialKind, mainTex }) => ({ materialKind, mainTex })),
    [
      { materialKind: "eye", mainTex: "parts/default-hair/default-eye.ktx2" },
      { materialKind: "eyelight", mainTex: "parts/default-hair/default-eyelight.ktx2" },
      { materialKind: "face", mainTex: `${fixture.exclusive.packagePath}/custom-face.ktx2` },
    ]
  );
  assert.deepEqual(
    combined.runtimeExtension.textureRoles.map((entry) => entry.source),
    ["parts/body", fixture.exclusive.packagePath]
  );
});
