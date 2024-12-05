import { getGridPointsInRing, interpolateRing } from './shared.js'
import { midPoint } from '@allmaps/stdlib'

import classifyPoint from 'robust-point-in-polygon'
import Delaunator from 'delaunator'
import Constrainautor from '@kninnug/constrainautor'

import type {
  Point,
  Ring,
  Triangle,
  UniquePointsIndexTriangle
} from '@allmaps/types'

export type triangulateConstrainautorOutput = {
  con: Constrainautor
  points: Point[]
  triangles: Triangle[]
  uniquePointsIndexTriangles: UniquePointsIndexTriangle[]
}

/**
 * Triangulates a polygon
 *
 * @remark Polygons with < 3 points just return an empty array.
 *
 * @param {Ring} polygon - Polygon
 * @param {number} distance - Distance between the grid points placed inside the polygon
 * @returns {Triangle[]} Array of triangles partitioning the polygon
 */
export function triangulate(polygon: Ring, distance?: number): Triangle[] {
  if (polygon.length < 3) {
    return []
  }

  {
    const { triangles } = triangulateConstrainautor(polygon, distance)
    return triangles
  }
}

/**
 * Triangulates a polygon and return unique points.
 * This function returns the list of unique points, and returns the triangles as uniquePointsIndexTriangles with indices refering to the unique points
 *
 * @remark Polygons with < 3 points just return an empty array for uniquePointsIndexTriangles.
 *
 * @param {Ring} polygon - Polygon
 * @param {number} [distance] - Distance between the grid points placed inside the polygon
 * @returns {{uniquePointsIndexTriangles: UniquePointsIndexTriangle[], uniquePoints: Point[]}} Object with uniquePointsIndexTriangles and uniquePoints
 */
export function triangulateToUnique(
  polygon: Ring,
  distance?: number
): {
  uniquePointsIndexTriangles: UniquePointsIndexTriangle[]
  uniquePoints: Point[]
} {
  if (polygon.length < 3) {
    return {
      uniquePointsIndexTriangles: [],
      uniquePoints: polygon
    }
  }

  const { points, uniquePointsIndexTriangles } = triangulateConstrainautor(
    polygon,
    distance
  )
  return {
    uniquePointsIndexTriangles,
    uniquePoints: points
  }
}

/**
 * Triangulates a polygon using Constrainautor
 *
 * @param {Ring} polygon - Polygon
 * @param {number} [distance] - Distance between the grid points placed inside the polygon
 * @returns {triangulateConstrainautorOutput} Constrainautor object
 */
export function triangulateConstrainautor(
  polygon: Ring,
  distance?: number
): triangulateConstrainautorOutput {
  let polygonOrInterpolatedPolygon: Point[]
  let points: Point[]
  if (distance) {
    // Interpolate polygon
    polygonOrInterpolatedPolygon = interpolateRing(polygon, distance)

    // Add grid points inside the polygon
    const gridPoints = getGridPointsInRing(polygon, distance)
    const gridPointsInPolygon = gridPoints.filter((point) => {
      if (classifyPoint(polygon, point) == -1) {
        return true
      }
    })
    points = [...polygonOrInterpolatedPolygon, ...gridPointsInPolygon]
  } else {
    polygonOrInterpolatedPolygon = polygon
    points = polygon
  }

  // Initialize Delaunay triangulation from polygon + grid points
  const del = new Delaunator(points.flat())

  // Collect indices of (interpolated) polygon edges
  const edgeIndices = []
  for (let i = 0; i < polygonOrInterpolatedPolygon.length - 1; i++) {
    edgeIndices.push([i, i + 1] as [number, number])
  }
  edgeIndices.push([polygonOrInterpolatedPolygon.length - 1, 0] as [
    number,
    number
  ])

  // Constrain triangulation
  const con = new Constrainautor(del, edgeIndices)

  let uniquePointsIndexTriangles: UniquePointsIndexTriangle[] = []
  let triangles: Triangle[] = []
  const shouldClassify: boolean[] = []
  for (let i = 0; i < con.del.triangles.length; i += 3) {
    uniquePointsIndexTriangles.push([
      con.del.triangles[i],
      con.del.triangles[i + 1],
      con.del.triangles[i + 2]
    ])
    triangles.push([
      points[con.del.triangles[i]],
      points[con.del.triangles[i + 1]],
      points[con.del.triangles[i + 2]]
    ])
    shouldClassify.push(
      con.del.triangles[i] < polygonOrInterpolatedPolygon.length ||
        con.del.triangles[i + 1] < polygonOrInterpolatedPolygon.length ||
        con.del.triangles[i + 2] < polygonOrInterpolatedPolygon.length
    )
  }

  // Check if triangles inside
  const classifications = triangles.map((triangle, index) => {
    // TODO: speed up by checking only if at least one point is on polygon

    // Only keep if inside
    return shouldClassify[index]
      ? classifyPoint(polygon, midPoint(triangle)) == -1
      : true
  })
  uniquePointsIndexTriangles = uniquePointsIndexTriangles.filter(
    (_triangle, index) => classifications[index]
  )
  triangles = triangles.filter((_triangle, index) => classifications[index])

  return {
    con,
    points,
    triangles,
    uniquePointsIndexTriangles
  }
}
