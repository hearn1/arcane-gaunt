import { step, assert } from "../testHelpers.js";
import { getElevationAt } from "../../core/ArenaCollision.js";

export default async function runLayoutGeometryValidate(game, result) {
  await step(result, "layout pool includes ramparts and tower_court", () => {
    game._buildArenaLayout("ramparts");
    assert(game.arenaLayoutName === "ramparts", "arenaLayoutName should be 'ramparts' after forced build");
    game._buildArenaLayout("tower_court");
    assert(game.arenaLayoutName === "tower_court", "arenaLayoutName should be 'tower_court' after forced build");
  });

  await step(result, "ramparts — two platforms and two ramps with correct elevation polarity", () => {
    game._buildArenaLayout("ramparts");
    const surfaces = game.arenaBounds.walkableSurfaces;
    const platforms = surfaces.filter((s) => s.type === "platform");
    const ramps = surfaces.filter((s) => s.type === "ramp");
    assert(platforms.length === 2, `ramparts needs 2 platforms, got ${platforms.length}`);
    assert(ramps.length === 2, `ramparts needs 2 ramps, got ${ramps.length}`);
    for (const p of platforms) {
      assert(p.elevation > 0, `all platforms must have positive elevation, got ${p.elevation}`);
    }
    for (const r of ramps) {
      const high = Math.max(r.elevStart, r.elevEnd);
      const low = Math.min(r.elevStart, r.elevEnd);
      assert(Math.abs(low) < 0.01, `ramp low end should be 0.0, got ${low}`);
      assert(high > 0, `ramp high end should be positive, got ${high}`);
    }
  });

  await step(result, "ramparts — platform tops and ramp midpoints are reachable via getElevationAt", () => {
    game._buildArenaLayout("ramparts");
    const surfaces = game.arenaBounds.walkableSurfaces;
    // West platform centre (x=-26, z=0) should return 3.0.
    const westPlat = getElevationAt(-26, 0, surfaces);
    assert(Math.abs(westPlat - 3.0) < 0.01, `west platform centre should be 3.0, got ${westPlat}`);
    // East platform centre (x=26, z=0) should return 3.0.
    const eastPlat = getElevationAt(26, 0, surfaces);
    assert(Math.abs(eastPlat - 3.0) < 0.01, `east platform centre should be 3.0, got ${eastPlat}`);
    // West ramp midpoint (x=-17, z=0): t=0.5 → elevation 1.5.
    const westRampMid = getElevationAt(-17, 0, surfaces);
    assert(westRampMid > 0 && westRampMid < 3.0, `west ramp midpoint should be between 0 and 3.0, got ${westRampMid}`);
    // Floor between ramps (x=0, z=0) should be 0.
    assert(getElevationAt(0, 0, surfaces) === 0, "arena centre should be floor level (0)");
  });

  await step(result, "tower_court — two platforms and two ramps", () => {
    game._buildArenaLayout("tower_court");
    const surfaces = game.arenaBounds.walkableSurfaces;
    const platforms = surfaces.filter((s) => s.type === "platform");
    const ramps = surfaces.filter((s) => s.type === "ramp");
    assert(platforms.length === 2, `tower_court needs 2 platforms, got ${platforms.length}`);
    assert(ramps.length === 2, `tower_court needs 2 ramps, got ${ramps.length}`);
  });

  await step(result, "tower_court — north tower higher than south platform", () => {
    game._buildArenaLayout("tower_court");
    const surfaces = game.arenaBounds.walkableSurfaces;
    const northTower = getElevationAt(0, -22, surfaces);
    const southPlat = getElevationAt(0, 22, surfaces);
    assert(northTower > 0, `north tower should have positive elevation, got ${northTower}`);
    assert(southPlat > 0, `south platform should have positive elevation, got ${southPlat}`);
    assert(northTower > southPlat,
      `north tower (${northTower}) should be higher than south platform (${southPlat})`);
    // Ramp midpoints between floor and their platform.
    const northRampMid = getElevationAt(0, -15, surfaces);
    assert(northRampMid > 0 && northRampMid < northTower,
      `north stair midpoint should be between 0 and ${northTower}, got ${northRampMid}`);
    const southRampMid = getElevationAt(0, 16, surfaces);
    assert(southRampMid > 0 && southRampMid < southPlat,
      `south ramp midpoint should be between 0 and ${southPlat}, got ${southRampMid}`);
  });

  await step(result, "ramparts and tower_court — edge spawn positions do not overlap platform footprints", () => {
    for (const layoutName of ["ramparts", "tower_court"]) {
      game._buildArenaLayout(layoutName);
      const half = game.arenaBounds.half - 3; // matches EnemyManager._spawnPoint
      const obstacles = game.arenaBounds.obstacles;
      let conflicts = 0;
      // Sample representative points along all four arena edges at spawn-ring distance.
      for (let t = -half; t <= half; t += 4) {
        const candidates = [
          { x: t, z: -half },
          { x: t, z: half },
          { x: -half, z: t },
          { x: half, z: t },
        ];
        for (const p of candidates) {
          for (const o of obstacles) {
            if (o.platformTop === undefined) continue; // only care about elevated platform bodies
            if (Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.z - o.z) <= o.d / 2) conflicts++;
          }
        }
      }
      assert(conflicts === 0,
        `${layoutName}: ${conflicts} edge spawn sample(s) fell inside a platform footprint`);
    }
  });

  // Restore a random layout so subsequent tests run in a normal game state.
  game._buildArenaLayout(null);
}
