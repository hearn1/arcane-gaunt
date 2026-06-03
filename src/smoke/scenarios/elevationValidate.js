import { step, assert } from "../testHelpers.js";
import { getElevationAt, isCircleClear, resolveCircleAgainstObstacles } from "../../core/ArenaCollision.js";

export default async function runElevationValidate(_game, result) {
  await step(result, "getElevationAt — floor returns 0 for empty surface list", () => {
    assert(getElevationAt(0, 0, []) === 0, "floor at origin should be 0");
    assert(getElevationAt(15, -30, []) === 0, "floor at arbitrary position should be 0");
  });

  await step(result, "getElevationAt — flat platform returns fixed elevation inside footprint", () => {
    const surfaces = [{ type: "platform", x: 0, z: -18, w: 16, d: 8, elevation: 3.0 }];
    assert(getElevationAt(0, -18, surfaces) === 3.0, "centre of platform should return 3.0");
    assert(getElevationAt(7, -14, surfaces) === 3.0, "south edge inside platform should return 3.0");
    assert(getElevationAt(0, -22, surfaces) === 3.0, "north edge inside platform should return 3.0");
    assert(getElevationAt(0, -10, surfaces) === 0, "outside platform (south) should return 0");
    assert(getElevationAt(9, -18, surfaces) === 0, "outside platform (east) should return 0");
  });

  await step(result, "getElevationAt — ramp interpolates linearly between elevStart and elevEnd", () => {
    // South ramp: centre (0,-12), w=10, d=4, axis='z', elevStart=3 at z=-14, elevEnd=0 at z=-10.
    const surfaces = [{ type: "ramp", x: 0, z: -12, w: 10, d: 4, axis: "z", elevStart: 3.0, elevEnd: 0.0 }];
    const tol = 0.001;
    const atStart = getElevationAt(0, -14, surfaces); // t=0 → elevStart=3
    assert(Math.abs(atStart - 3.0) < tol, `z=-14 expected 3.0, got ${atStart}`);
    const atEnd = getElevationAt(0, -10, surfaces);   // t=1 → elevEnd=0
    assert(Math.abs(atEnd - 0.0) < tol, `z=-10 expected 0.0, got ${atEnd}`);
    const atMid = getElevationAt(0, -12, surfaces);   // t=0.5 → 1.5
    assert(Math.abs(atMid - 1.5) < tol, `z=-12 (mid) expected 1.5, got ${atMid}`);
    assert(getElevationAt(6, -12, surfaces) === 0, "outside ramp width should return 0");
  });

  await step(result, "getElevationAt — ramp and platform compose correctly at boundary", () => {
    const surfaces = [
      { type: "platform", x: 0, z: -18, w: 16, d: 8, elevation: 3.0 },
      { type: "ramp", x: 0, z: -12, w: 10, d: 4, axis: "z", elevStart: 3.0, elevEnd: 0.0 },
    ];
    // Platform south edge and ramp north edge both at z=-14 → both give 3.0; max=3.0.
    const atBoundary = getElevationAt(0, -14, surfaces);
    assert(Math.abs(atBoundary - 3.0) < 0.001, `boundary z=-14 should be 3.0, got ${atBoundary}`);
    // Below ramp (south of ramp's positive-Z end) → floor.
    assert(getElevationAt(0, -9, surfaces) === 0, "below ramp south end should be floor");
  });

  await step(result, "getElevationAt — stacked multi-tier platforms+ramps resolve to the highest covering surface", () => {
    // Three telescoping tiers (base 3 / mid 6 / top 9) plus the two ramps that
    // climb between them, mirroring one tower flank. The max-elevation rule must
    // pick the correct level at every height.
    const surfaces = [
      { type: "platform", x: 0, z: 4, w: 20, d: 22, elevation: 3.0 },
      { type: "platform", x: 0, z: -2, w: 16, d: 16, elevation: 6.0 },
      { type: "platform", x: 0, z: -7, w: 10, d: 10, elevation: 9.0 },
      { type: "ramp", x: 0, z: 9, w: 10, d: 6, axis: "z", elevStart: 6.0, elevEnd: 3.0 }, // base→mid
      { type: "ramp", x: 0, z: 2, w: 8, d: 6, axis: "z", elevStart: 9.0, elevEnd: 6.0 }, // mid→top
    ];
    const tol = 0.01;
    // Top tier centre wins over the wider base/mid beneath it.
    assert(Math.abs(getElevationAt(0, -7, surfaces) - 9.0) < tol, "top tier centre should be 9.0");
    // Base ledge clear of both ramps (x off-centre) stays at 3.0.
    assert(Math.abs(getElevationAt(-9, 13, surfaces) - 3.0) < tol, "outer base ledge should be 3.0");
    // base→mid ramp midpoint interpolates to 4.5 (max over base's 3.0).
    assert(Math.abs(getElevationAt(0, 9, surfaces) - 4.5) < tol, "base→mid ramp midpoint should be 4.5");
    // mid→top ramp midpoint interpolates to 7.5 (max over mid's 6.0).
    assert(Math.abs(getElevationAt(0, 2, surfaces) - 7.5) < tol, "mid→top ramp midpoint should be 7.5");
    // Off the footprint entirely → floor.
    assert(getElevationAt(40, 40, surfaces) === 0, "far outside all tiers should be floor (0)");
  });

  await step(result, "isCircleClear — platform obstacle blocks at floor level (Y=0)", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    const posFloor = { x: 0, z: -18, y: 0 };
    assert(!isCircleClear(posFloor, 0.8, obstacles), "entity at Y=0 inside platform footprint should be blocked");
  });

  await step(result, "isCircleClear — platform obstacle does NOT block entities on top (Y>=platformTop)", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    const posTop = { x: 0, z: -18, y: 3.0 };
    assert(isCircleClear(posTop, 0.8, obstacles), "entity at Y=3.0 on top of platform should be clear");
    const posJustAbove = { x: 0, z: -18, y: 2.9 };
    assert(isCircleClear(posJustAbove, 0.8, obstacles), "entity at Y=2.9 (within tolerance) should be clear");
  });

  await step(result, "resolveCircleAgainstObstacles — platform respects platformTop bypass", () => {
    const obstacles = [{ x: 0, z: 0, w: 4, d: 4, h: 3, platformTop: 3.0 }];
    // Entity at floor level inside platform → should be pushed out.
    const posFloor = { x: 0.5, z: 0.5, y: 0 };
    const moved = resolveCircleAgainstObstacles(posFloor, 0.5, obstacles);
    assert(moved, "entity at floor level should be pushed out of platform obstacle");
    // Entity on top → should NOT be moved.
    const posTop = { x: 0.5, z: 0.5, y: 3.0 };
    const orig = { x: posTop.x, z: posTop.z };
    resolveCircleAgainstObstacles(posTop, 0.5, obstacles);
    assert(
      Math.abs(posTop.x - orig.x) < 0.001 && Math.abs(posTop.z - orig.z) < 0.001,
      "entity on platform top should not be pushed horizontally"
    );
  });

  await step(result, "elevated layout — arenaBounds has walkableSurfaces with platform and ramp", () => {
    // Build the elevated layout on a fresh mock bounds object to avoid touching live game state.
    const surfaces = _game.arenaBounds.walkableSurfaces;
    if (_game.arenaLayoutName !== "elevated") {
      // Layout wasn't elevated this run — verify the array at least exists and is an array.
      assert(Array.isArray(surfaces), "arenaBounds.walkableSurfaces must always be an array");
      return;
    }
    assert(Array.isArray(surfaces) && surfaces.length >= 2,
      `elevated layout needs ≥2 walkable surfaces, got ${surfaces.length}`);
    const platform = surfaces.find((s) => s.type === "platform");
    assert(platform !== undefined, "elevated layout must have a platform surface");
    assert(typeof platform.elevation === "number" && platform.elevation > 0,
      "platform elevation must be a positive number");
    const ramp = surfaces.find((s) => s.type === "ramp");
    assert(ramp !== undefined, "elevated layout must have a ramp surface");
    assert(["x", "z"].includes(ramp.axis), `ramp axis must be 'x' or 'z', got '${ramp.axis}'`);
    assert(typeof ramp.elevStart === "number" && typeof ramp.elevEnd === "number",
      "ramp must have numeric elevStart and elevEnd");
    // Ramp should connect floor to platform top.
    const maxElev = Math.max(ramp.elevStart, ramp.elevEnd);
    assert(Math.abs(maxElev - platform.elevation) < 0.01,
      `ramp high end (${maxElev}) should match platform elevation (${platform.elevation})`);
  });
}
