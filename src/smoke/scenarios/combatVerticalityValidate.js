import { step, assert } from "../testHelpers.js";
import { segmentHitsObstacles } from "../../core/ArenaCollision.js";

export default async function runCombatVerticalityValidate(_game, result) {
  // Static unit tests for segmentHitsObstacles with platform obstacles.
  // These do not depend on live game state.

  await step(result, "platform wall blocks ground-level segment passing through its footprint", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // Ground-level segment (z=-10 to z=-26) passes through the platform at z∈[-22,-14].
    const from = { x: 0, y: 1.2, z: -10 };
    const to = { x: 0, y: 1.2, z: -26 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit !== null, "ground-level segment through platform should be blocked");
    assert(hit.obstacle === obstacles[0], "hit obstacle should be the platform");
  });

  await step(result, "elevated segment above platform top passes over without collision", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // Both endpoints above platformTop → fully skipped.
    const from = { x: 0, y: 4.0, z: -10 };
    const to = { x: 0, y: 4.0, z: -26 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit === null, "segment entirely above platform should not be blocked");
  });

  await step(result, "segment from platform top outward (exiting top edge) is not blocked", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // Origin inside platform footprint and above platform top → outward shot.
    const from = { x: 0, y: 3.5, z: -18 };
    const to = { x: 0, y: 1.5, z: 0 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit === null, "shot exiting from platform top should not hit the platform wall");
  });

  await step(result, "ground segment from outside approaching platform is blocked at wall", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // From outside the platform footprint, at ground level, shooting into it.
    const from = { x: 8.1, y: 1.2, z: -18 };
    const to = { x: -8.1, y: 1.2, z: -18 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit !== null, "ground-level shot entering platform side should be blocked");
  });

  await step(result, "projectile going under a raised platform (y below 0) is not blocked", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // Both endpoints at or below y=0 → skip (under the platform).
    const from = { x: 0, y: -0.5, z: -10 };
    const to = { x: 0, y: -0.5, z: -26 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit === null, "segment below y=0 under platform should not be blocked");
  });

  await step(result, "LoS from ground to elevated platform blocked by platform wall", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // Enemy on ground looking at player on platform; wall between them in xz.
    const from = { x: 8.1, y: 1.2, z: -18 };
    const to = { x: -8.1, y: 3.2, z: -18 };
    const hit = segmentHitsObstacles(from, to, 0.15, obstacles);
    assert(hit !== null, "LoS from ground through platform wall should be blocked");
  });

  await step(result, "LoS from platform to ground (looking over edge) is not blocked", () => {
    const obstacles = [{ x: 0, z: -18, w: 16, d: 8, h: 3, platformTop: 3.0 }];
    // Enemy on platform looking down at player on ground.
    const from = { x: 0, y: 4.2, z: -18 };
    const to = { x: 0, y: 1.5, z: 5 };
    const hit = segmentHitsObstacles(from, to, 0.15, obstacles);
    assert(hit === null, "LoS from platform looking down over edge should be clear");
  });

  await step(result, "ordinary (non-platform) wall blocks regardless of elevation", () => {
    const obstacles = [{ x: 0, z: 0, w: 10, d: 3.2, h: 4.2 }];
    // High y but wall has no platformTop → always blocks.
    const from = { x: -10, y: 5, z: 0 };
    const to = { x: 10, y: 5, z: 0 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit !== null, "ordinary wall should block at any elevation");
  });

  await step(result, "multi-tier tower — ground shot toward top tier is blocked by a lower-tier wall", () => {
    // Stacked tiers (base 3 / mid 6 / top 9) as the layout emits them.
    const tower = [
      { x: 0, z: 4, w: 20, d: 22, h: 3, platformTop: 3.0 },
      { x: 0, z: -2, w: 16, d: 16, h: 6, platformTop: 6.0 },
      { x: 0, z: -7, w: 10, d: 10, h: 9, platformTop: 9.0 },
    ];
    // Enemy on the floor south of the tower shooting north at a player atop the
    // top tier. The path crosses the base wall at ground level → blocked.
    const from = { x: 0, y: 1.2, z: 18 };
    const to = { x: 0, y: 9.5, z: -7 };
    const hit = segmentHitsObstacles(from, to, 0.15, tower);
    assert(hit !== null, "ground→top-tier shot should be blocked by a lower-tier wall");
  });

  await step(result, "multi-tier tower — shot from the top tier outward clears all lower tiers", () => {
    const tower = [
      { x: 0, z: 4, w: 20, d: 22, h: 3, platformTop: 3.0 },
      { x: 0, z: -2, w: 16, d: 16, h: 6, platformTop: 6.0 },
      { x: 0, z: -7, w: 10, d: 10, h: 9, platformTop: 9.0 },
    ];
    // Player on the top tier (y≈9.5) shooting down/out at a ground target to the
    // south. Origin is above every platformTop, so each tier is skipped.
    const from = { x: 0, y: 9.5, z: -7 };
    const to = { x: 0, y: 1.5, z: 30 };
    const hit = segmentHitsObstacles(from, to, 0.15, tower);
    assert(hit === null, "shot exiting the top tier should clear all lower tiers");
  });

  await step(result, "multi-tier tower — mid-tier occupant is shielded from ground fire by the base wall", () => {
    const tower = [
      { x: 0, z: 4, w: 20, d: 22, h: 3, platformTop: 3.0 },
      { x: 0, z: -2, w: 16, d: 16, h: 6, platformTop: 6.0 },
    ];
    // Ground enemy firing at a player standing on the mid tier (y≈6.2). The base
    // wall (top 3) sits between them at ground level → blocked.
    const from = { x: 0, y: 1.2, z: 20 };
    const to = { x: 0, y: 6.2, z: -2 };
    const hit = segmentHitsObstacles(from, to, 0.15, tower);
    assert(hit !== null, "ground→mid-tier shot should be blocked by the base wall");
  });

  await step(result, "multiple platforms — each checked independently", () => {
    const obstacles = [
      { x: -26, z: 0, w: 12, d: 22, h: 3, platformTop: 3.0 },
      { x: 26, z: 0, w: 12, d: 22, h: 3, platformTop: 3.0 },
    ];
    // Ground-level path crosses west platform → blocked.
    const from = { x: -40, y: 1.2, z: 0 };
    const to = { x: -20, y: 1.2, z: 0 };
    const hit = segmentHitsObstacles(from, to, 0.1, obstacles);
    assert(hit !== null, "ground path through west platform should be blocked");
    // Elevated path above both → clear.
    const fromHigh = { x: -40, y: 4.0, z: 0 };
    const toHigh = { x: 40, y: 4.0, z: 0 };
    const highHit = segmentHitsObstacles(fromHigh, toHigh, 0.1, obstacles);
    assert(highHit === null, "elevated path above both platforms should be clear");
  });
}
