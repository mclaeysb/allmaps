import proj4 from 'proj4'

import { bboxToLine, computeBbox } from '@allmaps/stdlib'

import { isEqualProjection } from './project-functions.js'

import type { Bbox, Point } from '@allmaps/types'

import type { Projection } from './types.js'

export function projectPoint(
  projectionFrom: Projection,
  projectionTo: Projection,
  point: Point
): Point {
  return isEqualProjection(projectionFrom, projectionTo)
    ? point
    : proj4(projectionFrom?.definition, projectionTo?.definition, point)
}

export function projectPoints<T extends Point[]>(
  projectionFrom: Projection,
  projectionTo: Projection,
  points: T
): T {
  return isEqualProjection(projectionFrom, projectionTo)
    ? points
    : (points.map((point) =>
        proj4(projectionFrom?.definition, projectionTo?.definition, point)
      ) as T)
}

export function projectBbox(
  projectionFrom: Projection,
  projectionTo: Projection,
  bbox: Bbox
): Bbox {
  return computeBbox(
    projectPoints(projectionFrom, projectionTo, bboxToLine(bbox))
  )
}
