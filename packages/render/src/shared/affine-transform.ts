import type { AffineTransform, Point, Matrix4 } from '@allmaps/types'

export const identityAffineTransform: AffineTransform = [1, 0, 0, 1, 0, 0]

export function affineTransformPoint(
  affineTransform: AffineTransform,
  point: Point
): Point {
  const x = point[0]
  const y = point[1]

  return [
    affineTransform[0] * x + affineTransform[2] * y + affineTransform[4],
    affineTransform[1] * x + affineTransform[3] * y + affineTransform[5]
  ]
}

export function affineTransformPoints(
  affineTransform: AffineTransform,
  points: Point[]
): Point[] {
  return points.map((point) => affineTransformPoint(affineTransform, point))
}

export function createAffineTransform(): AffineTransform {
  return identityAffineTransform
}

export function multiplyAffineTransform(
  affineTransform0: AffineTransform,
  affineTransform1: AffineTransform
): AffineTransform {
  const a1 = affineTransform0[0]
  const b1 = affineTransform0[1]
  const c1 = affineTransform0[2]
  const d1 = affineTransform0[3]
  const e1 = affineTransform0[4]
  const f1 = affineTransform0[5]
  const a2 = affineTransform1[0]
  const b2 = affineTransform1[1]
  const c2 = affineTransform1[2]
  const d2 = affineTransform1[3]
  const e2 = affineTransform1[4]
  const f2 = affineTransform1[5]

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ]
}

export function rotateAffineTransform(
  affineTransform: AffineTransform,
  angle: number
): AffineTransform {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return multiplyAffineTransform(affineTransform, [cos, sin, -sin, cos, 0, 0])
}

export function scaleAffineTransform(
  affineTransform: AffineTransform,
  x: number,
  y: number
): AffineTransform {
  return multiplyAffineTransform(affineTransform, [x, 0, 0, y, 0, 0])
}

export function translateAffineTransform(
  affineTransform: AffineTransform,
  dx: number,
  dy: number
): AffineTransform {
  return multiplyAffineTransform(affineTransform, [1, 0, 0, 1, dx, dy])
}

export function composeAffineTransform(
  dx1: number,
  dy1: number,
  sx: number,
  sy: number,
  angle: number,
  dx2: number,
  dy2: number
): AffineTransform {
  const sin = Math.sin(angle)
  const cos = Math.cos(angle)

  return [
    sx * cos,
    sy * sin,
    -sx * sin,
    sy * cos,
    dx2 * sx * cos - dy2 * sx * sin + dx1,
    dx2 * sy * sin + dy2 * sy * cos + dy1
  ]
}

export function invertAffineTransform(
  affineTransform: AffineTransform
): AffineTransform {
  const determinant = getDeterminant(affineTransform)

  const a = affineTransform[0]
  const b = affineTransform[1]
  const c = affineTransform[2]
  const d = affineTransform[3]
  const e = affineTransform[4]
  const f = affineTransform[5]

  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    -(a * f - b * e) / determinant
  ]
}

export function getDeterminant(affineTransform: AffineTransform): number {
  return (
    affineTransform[0] * affineTransform[3] -
    affineTransform[1] * affineTransform[2]
  )
}

export function affineTransformToMatrix4(
  affineTransform: AffineTransform
): Matrix4 {
  const matrix4: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  matrix4[0] = affineTransform[0]
  matrix4[1] = affineTransform[1]
  matrix4[4] = affineTransform[2]
  matrix4[5] = affineTransform[3]
  matrix4[12] = affineTransform[4]
  matrix4[13] = affineTransform[5]

  return matrix4
}
