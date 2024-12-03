import {
  computeBbox,
  distance,
  stepDistanceAngle,
  lineAngle
} from '@allmaps/stdlib'

import type { Bbox, Line, Ring, Point } from '@allmaps/types'

// Return an array of points containing the first line point,
// and betwen the first and last line point other points every `dist`
function interpolateLine(line: Line, dist: number): Point[] {
  let currentPoint = line[0]
  const result = [currentPoint]

  while (distance([currentPoint, line[1]]) > dist) {
    const nextPoint = stepDistanceAngle(currentPoint, dist, lineAngle(line))
    result.push(nextPoint)
    currentPoint = nextPoint
  }
  // note: the last nextpoint, which is also line[1], is not pushed
  return result
}

// Return an array of points containing the ring points,
// and between every pair of ring points other points every `dist`
export function interpolateRing(ring: Ring, dist: number): Point[] {
  // close ring
  ring = [...ring, ring[0]]

  let result: Ring = []
  for (let i = 0; i < ring.length - 1; i++) {
    result = result.concat(interpolateLine([ring[i], ring[i + 1]], dist))
  }
  return result
}

export function getGridPointsInRing(ring: Ring, gridSize: number): Point[] {
  const grid = []
  const bbox: Bbox = computeBbox(ring)
  for (let x = bbox[0] + gridSize, i = 0; x <= bbox[2]; i++, x += gridSize) {
    for (let y = bbox[1] + gridSize, j = 0; y <= bbox[3]; j++, y += gridSize) {
      grid.push([x, y] as Point)
    }
  }
  return grid
}
