import type { Signal } from "./types";
export type Point = { x: number; y: number };
export const LEFT = [33, 160, 158, 133, 153, 144],
  RIGHT = [362, 385, 387, 263, 373, 380];
const distance = (a: Point, b: Point, w: number, h: number) =>
  Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
export function ear(points: Point[], indices: number[], w: number, h: number) {
  const [a, b, c, d, e, f] = indices.map((i) => points[i]);
  const horizontal = distance(a, d, w, h);
  return horizontal > 0
    ? (distance(b, f, w, h) + distance(c, e, w, h)) / (2 * horizontal)
    : null;
}
export function metrics(points: Point[], w: number, h: number) {
  if (points.length < 468 || w <= 0 || h <= 0) return null;
  const l = ear(points, LEFT, w, h),
    r = ear(points, RIGHT, w, h),
    width = distance(points[78], points[308], w, h);
  if (l === null || r === null || width <= 0) return null;
  return {
    ear: (l + r) / 2,
    mar: distance(points[13], points[14], w, h) / width,
  };
}
export class SignalDetector {
  private eyes: number | null = null;
  private mouth: number | null = null;
  private eyesEmitted = false;
  private mouthEmitted = false;
  private last = -Infinity;
  reset() {
    this.eyes = null;
    this.mouth = null;
    this.eyesEmitted = false;
    this.mouthEmitted = false;
  }
  update(
    values: { ear: number; mar: number } | null,
    now: number,
  ): Signal | null {
    if (
      !values ||
      !Number.isFinite(values.ear) ||
      !Number.isFinite(values.mar)
    ) {
      this.reset();
      return null;
    }
    if (values.ear < 0.21) {
      this.eyes ??= now;
    } else {
      this.eyes = null;
      this.eyesEmitted = false;
    }
    if (values.mar > 0.6) {
      this.mouth ??= now;
    } else {
      this.mouth = null;
      this.mouthEmitted = false;
    }
    if (
      this.eyes !== null &&
      !this.eyesEmitted &&
      now - this.eyes >= 2500 &&
      now - this.last >= 30000
    ) {
      this.eyesEmitted = true;
      this.last = now;
      return { tipo: "OLHOS_FECHADOS", valorMetrica: values.ear };
    }
    if (
      this.mouth !== null &&
      !this.mouthEmitted &&
      now - this.mouth >= 1200 &&
      now - this.last >= 30000
    ) {
      this.mouthEmitted = true;
      this.last = now;
      return { tipo: "BOCEJO", valorMetrica: values.mar };
    }
    return null;
  }
}
