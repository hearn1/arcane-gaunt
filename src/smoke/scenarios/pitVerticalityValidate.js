import { step, assert } from "../testHelpers.js";
import { getElevationAt } from "../../core/ArenaCollision.js";

export default async function runPitVerticalityValidate(_game, result) {
  await step(result, "getElevationAt returns 0 for empty walkableSurfaces", () => {
    const elev = getElevationAt(0, 0, []);
    assert(elev === 0, "empty surfaces should return floor elevation 0");
  });

  await step(result, "getElevationAt returns negative elevation inside pit footprint", () => {
    const surfaces = [{ type: "pit", x: 0, z: 0, w: 10, d: 10, elevation: -2.0 }];
    const elev = getElevationAt(0, 0, surfaces);
    assert(elev === -2.0, `expected -2.0 inside pit, got ${elev}`);
  });

  await step(result, "getElevationAt returns 0 outside pit footprint", () => {
    const surfaces = [{ type: "pit", x: 0, z: 0, w: 10, d: 10, elevation: -2.0 }];
    const elev = getElevationAt(20, 20, surfaces);
    assert(elev === 0, `expected 0 outside pit, got ${elev}`);
  });

  await step(result, "platform elevation overrides overlapping pit (platform on top)", () => {
    const surfaces = [
      { type: "pit", x: 0, z: 0, w: 10, d: 10, elevation: -2.0 },
      { type: "platform", x: 0, z: 0, w: 4, d: 4, elevation: 3.0 },
    ];
    const center = getElevationAt(0, 0, surfaces);
    assert(center === 3.0, `expected 3.0 at platform center, got ${center}`);
    const edgePit = getElevationAt(5, 5, surfaces);
    assert(edgePit === -2.0, `expected -2.0 at pit edge outside platform, got ${edgePit}`);
  });

  await step(result, "sinkhole layout is in the layouts pool", () => {
    const game = _game;
    game._buildArenaLayout("sinkhole");
    const hazards = game.arenaBounds.hazards;
    const pits = hazards.filter((h) => h.isPit);
    assert(pits.length >= 1, "sinkhole layout should have at least one pit hazard");
    const walkable = game.arenaBounds.walkableSurfaces;
    const pitSurfaces = walkable.filter((s) => s.type === "pit");
    assert(pitSurfaces.length >= 1, "sinkhole layout should have at least one pit walkable surface");
  });

  await step(result, "sinkhole layout has correct pit depth", () => {
    const game = _game;
    game._buildArenaLayout("sinkhole");
    const pitSurfaces = game.arenaBounds.walkableSurfaces.filter((s) => s.type === "pit");
    assert(pitSurfaces.length > 0, "should have pit surfaces");
    const pit = pitSurfaces[0];
    assert(pit.elevation === -2.5, `expected pit elevation -2.5, got ${pit.elevation}`);
    assert(pit.w === 16, `expected pit width 16, got ${pit.w}`);
    assert(pit.d === 12, `expected pit depth dimension 12, got ${pit.d}`);
  });

  await step(result, "sinkhole layout has platforms and ramps alongside the pit", () => {
    const game = _game;
    game._buildArenaLayout("sinkhole");
    const platforms = game.arenaBounds.walkableSurfaces.filter((s) => s.type === "platform");
    const ramps = game.arenaBounds.walkableSurfaces.filter((s) => s.type === "ramp");
    assert(platforms.length >= 2, `expected at least 2 platforms in sinkhole, got ${platforms.length}`);
    assert(ramps.length >= 2, `expected at least 2 ramps in sinkhole, got ${ramps.length}`);
  });

  await step(result, "sinkhole floor is cut open over the pit footprint", () => {
    const game = _game;
    game._buildArenaLayout("sinkhole");
    // A pit layout rebuilds the floor as a ShapeGeometry with a hole so the
    // depression is visible from above instead of hidden behind a solid plane.
    assert(
      game._floor.geometry.type === "ShapeGeometry",
      `expected floor ShapeGeometry (hole cut) in sinkhole, got ${game._floor.geometry.type}`,
    );
  });

  await step(result, "non-pit layout uses a plain solid floor (no hole)", () => {
    const game = _game;
    game._buildArenaLayout("cross");
    assert(
      game._floor.geometry.type === "PlaneGeometry",
      `expected plain PlaneGeometry floor without pits, got ${game._floor.geometry.type}`,
    );
  });

  await step(result, "sinkhole pit has solid vertical walls and a floor below the rim", () => {
    const game = _game;
    game._buildArenaLayout("sinkhole");
    // Walls (y = -depth/2) and pit floor (y = -depth) all sit below the rim.
    let belowRim = 0;
    game._arenaLayout.traverse((o) => {
      if (o.isMesh && o.position.y < -0.1) belowRim++;
    });
    // 4 walls + 1 pit floor.
    assert(belowRim >= 5, `expected >=5 sub-rim pit meshes (4 walls + floor), got ${belowRim}`);
  });

  await step(result, "player safe start excludes pit positions", () => {
    const game = _game;
    game._buildArenaLayout("sinkhole");
    const radius = game.player.radius || 0.8;
    const pits = game.arenaBounds.hazards.filter((h) => h.isPit);
    // Check candidate spawn positions from _placePlayerAtSafeStart
    const candidates = [
      { x: 0, z: 28 }, { x: 0, z: -28 },
      { x: -24, z: 0 }, { x: 24, z: 0 },
      { x: -22, z: 22 }, { x: 22, z: -22 },
    ];
    for (const c of candidates) {
      const inPit = pits.some((h) => {
        const minX = h.x - h.w / 2;
        const maxX = h.x + h.w / 2;
        const minZ = h.z - h.d / 2;
        const maxZ = h.z + h.d / 2;
        return c.x >= minX && c.x <= maxX && c.z >= minZ && c.z <= maxZ;
      });
      assert(!inPit, `candidate (${c.x}, ${c.z}) should not be inside pit`);
    }
  });
}
