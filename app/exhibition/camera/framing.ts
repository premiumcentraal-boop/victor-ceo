import * as THREE from "three";
import { ORBIT } from "../scene/layout";

// Where the galaxy rests on the screen. Pure, so the framing rule can be tested without a browser.

/** The band of the screen the galaxy may use: below the headline, above the scroll cue, in pixels from the top. */
export interface OpenArea {
  top: number;
  bottom: number;
}

/** Half the height of a picture, from its centre, in world units. Pictures are 1 : √2, and 1.35 wide. */
const PICTURE_HALF_HEIGHT = (1.35 / 2) * Math.SQRT2;

/** The camera that measures where the galaxy lands. It is only ever read, so one is enough. */
const measuring = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

/** The screen height, in pixels from the top, of a point in the world, for a camera at `position` looking at `look`. */
function screenYOf(point: THREE.Vector3, position: THREE.Vector3, look: THREE.Vector3, fovDeg: number, width: number, height: number): number {
  measuring.fov = fovDeg;
  measuring.aspect = width / height;
  measuring.updateProjectionMatrix();
  measuring.position.copy(position);
  measuring.lookAt(look);
  measuring.updateMatrixWorld(true);
  const ndc = point.clone().applyMatrix4(measuring.matrixWorldInverse).applyMatrix4(measuring.projectionMatrix);
  return ((1 - ndc.y) / 2) * height;
}

/**
 * The top and bottom, in pixels from the top of the screen, of the ring of pictures as the camera sees it. The
 * ring is a circle, so its nearest and farthest points are the same however the galaxy turns. The near
 * pictures are larger and reach lower than the far ones reach up, so the extent is measured, not the centre.
 */
export function ringExtent(position: THREE.Vector3, look: THREE.Vector3, fovDeg: number, width: number, height: number): OpenArea {
  const toward = new THREE.Vector3(position.x, 0, position.z).normalize();
  const near = toward.clone().multiplyScalar(ORBIT.radius);
  const far = near.clone().negate();
  const nearBottom = new THREE.Vector3(near.x, -PICTURE_HALF_HEIGHT, near.z);
  const farTop = new THREE.Vector3(far.x, PICTURE_HALF_HEIGHT, far.z);
  return {
    top: screenYOf(farTop, position, look, fovDeg, width, height),
    bottom: screenYOf(nearBottom, position, look, fovDeg, width, height),
  };
}

/**
 * How far the galaxy is shifted down the screen at rest, in pixels. On a portrait screen the ring of pictures
 * is centred in the open area, so it sits between the headline and the controls, not pressed under the
 * headline. A landscape screen has room already, and does not move. The shift is clamped, so a strange open
 * area cannot throw the galaxy off the screen.
 */
export function restShift(input: {
  width: number;
  height: number;
  openArea: OpenArea | null;
  fovDeg: number;
  position: THREE.Vector3;
  look: THREE.Vector3;
}): number {
  const { width, height, openArea } = input;
  if (width >= height || !openArea) return 0;
  const ring = ringExtent(input.position, input.look, input.fovDeg, width, height);
  const ringCentre = (ring.top + ring.bottom) / 2;
  const openCentre = (openArea.top + openArea.bottom) / 2;
  return THREE.MathUtils.clamp(openCentre - ringCentre, -height * 0.1, height * 0.3);
}
