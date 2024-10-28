import { Map as GeoreferencedMap } from '@allmaps/annotation'
import {
  computeDistortionFromPartialDerivatives,
  getQuadTreeTriangles,
  mapQuadTreeRecursively
} from '@allmaps/transform'
import {
  bboxesIntersect,
  bboxToRectangle,
  bufferBboxByRatio,
  mixNumbers,
  mixPoints
} from '@allmaps/stdlib'

import WarpedMap from './WarpedMap.js'

import type { WarpedMapOptions } from '../shared/types.js'

import type { Gcp, Point, Ring, QuadTree, Rectangle } from '@allmaps/types'

function createDefaultTriangulatedWarpedMapOptions(): Partial<WarpedMapOptions> {
  return {}
}

export function createTriangulatedWarpedMapFactory() {
  return (
    mapId: string,
    georeferencedMap: GeoreferencedMap,
    options?: Partial<WarpedMapOptions>
  ) => new TriangulatedWarpedMap(mapId, georeferencedMap, options)
}

/**
 * Class for triangulated WarpedMaps.
 *
 * @export
 * @class TriangulatedWarpedMap
 * @param {QuadTree<Gcp>} projectedGeoQuadTree - QuadTree used to triangulate the map (at the current viewport)
 * @param {Point[]} resourceTrianglepoints - Triangle points of the triangles the triangulated resourceMask (at the current scaleFactor)
 * @param {Point[]} resourceUniquepoints - Unique points of the triangles the triangulated resourceMask (at the current scaleFactor)
 * @param {number[]} trianglePointsUniquePointsIndex - Index in resourceUniquepoints where a specific resourceTrianglepoint can be found
 * @param {number} triangulateErrorCount - Number of time the triangulation has resulted in an error
 * @param {Point[]} projectedGeoPreviousTrianglePoints - The projectedGeoTrianglePoints of the previous transformation type, used during transformation transitions
 * @param {Point[]} projectedGeoTrianglePoints - The resourceTrianglePoints in geospatial coordinates
 * @param {Point[]} projectedGeoUniquePoints - The resourceUniquePoints in geospatial coordinates
 * @param {Point[]} projectedGeoUniquePointsPartialDerivativeX - Partial Derivative to X at the projectedGeoUniquePoints
 * @param {Point[]} projectedGeoUniquePointsPartialDerivativeY - Partial Derivative to Y at the projectedGeoUniquePoints
 * @param {number[]} previousTrianglePointsDistortion - The trianglePointsDistortion of the previous transformation type, used during transformation transitions
 * @param {number[]} trianglePointsDistortion - Distortion amount of the distortionMeasure at the projectedGeoTrianglePoints
 * @param {number[]} uniquePointsDistortion - Distortion amount of the distortionMeasure at the projectedGeoUniquePoints
 */
export default class TriangulatedWarpedMap extends WarpedMap {
  projectedGcpQuadTree?: QuadTree<{
    geo: Point
    resource: Point
    partialDerivativeX?: Point
    partialDerivativeY?: Point
    distortionMeasure?: number
  }>

  resourceTrianglePoints: Point[] = []

  projectedGeoPreviousTrianglePoints: Point[] = []
  projectedGeoTrianglePoints: Point[] = []

  previousTrianglePointsDistortion: number[] = []
  trianglePointsDistortion: number[] = []

  /**
   * Creates an instance of a TriangulatedWarpedMap.
   *
   * @constructor
   * @param {string} mapId - ID of the map
   * @param {GeoreferencedMap} georeferencedMap - Georeferenced map used to construct the WarpedMap
   * @param {WarpedMapOptions} [options] - Options
   */
  constructor(
    mapId: string,
    georeferencedMap: GeoreferencedMap,
    options?: Partial<WarpedMapOptions>
  ) {
    options = {
      ...createDefaultTriangulatedWarpedMapOptions(),
      ...options
    }

    super(mapId, georeferencedMap, options)
  }

  /**
   * Update the resourceMask.
   *
   * @param {Ring} resourceMask
   */
  setResourceMask(resourceMask: Ring): void {
    super.setResourceMask(resourceMask)
    this.updateTriangulation()
  }

  /**
   * Set projectedGeoViewportRectangle of current viewport. Triggers triangulation update if needed.
   *
   * @param {Rectangle} [projectedGeoViewportRectangle]
   */
  setCurrentProjectedGeoViewportRectangle(
    projectedGeoViewportRectangle?: Rectangle
  ) {
    super.setCurrentProjectedGeoViewportRectangle(projectedGeoViewportRectangle)
    // TODO: check if changed significantly
    this.updateTriangulation(true)
  }

  /**
   * Reset the previous points and values.
   */
  resetPrevious() {
    super.resetPrevious()
    this.projectedGeoPreviousTrianglePoints = this.projectedGeoTrianglePoints
    this.previousTrianglePointsDistortion = this.trianglePointsDistortion
  }

  /**
   * Mix the previous and new points and values.
   *
   * @param {number} t
   */
  mixPreviousAndNew(t: number) {
    super.mixPreviousAndNew(t)
    this.projectedGeoPreviousTrianglePoints =
      this.projectedGeoTrianglePoints.map((point, index) => {
        return mixPoints(
          point,
          this.projectedGeoPreviousTrianglePoints[index],
          t
        )
      })
    this.previousTrianglePointsDistortion = this.trianglePointsDistortion.map(
      (distortion, index) => {
        return mixNumbers(
          distortion,
          this.previousTrianglePointsDistortion[index],
          t
        )
      }
    )
  }

  /**
   * Update the triangulation of the resourceMask.
   *
   * @param {boolean} [previousIsNew] - whether the previous and new triangulation are the same - true by default, false during a transformation transition
   */
  private updateTriangulation(previousIsNew = false) {
    if (!this.currentProjectedGeoViewportRectangleBbox) return

    console.log('updateTriangulation')

    const projectedGeoMaskInViewportBbox = bboxesIntersect(
      bufferBboxByRatio(this.currentProjectedGeoViewportRectangleBbox, 1),
      this.projectedGeoMaskBbox
    )

    if (!projectedGeoMaskInViewportBbox) return

    this.projectedGcpQuadTree =
      this.projectedTransformer.transformRectangleBackwardToGcpQuadTree(
        // this.resourceMaskRectangle,
        // bboxToRectangle(this.currentResourceViewportRingBbox),
        // this.currentProjectedGeoViewportRectangle,
        bboxToRectangle(projectedGeoMaskInViewportBbox),
        {
          maxOffsetRatio: 0.001,
          maxDepth: 4
        }
      )
    this.resourceTrianglePoints = getQuadTreeTriangles(
      this.projectedGcpQuadTree
    )
      .flat(1)
      .map((projectedGcp) => projectedGcp.resource)

    this.updateProjectedGeoTrianglePoints(previousIsNew)
  }

  /**
   * Update the (previous and new) points of the triangulated resourceMask, at the current bestScaleFactor, in projectedGeo coordinates. Use cache if available.
   *
   * @param {boolean} [previousIsNew=false]
   */
  private updateProjectedGeoTrianglePoints(previousIsNew = false) {
    if (!this.projectedGcpQuadTree) return
    console.log('setting current')

    this.projectedGeoTrianglePoints = getQuadTreeTriangles(
      this.projectedGcpQuadTree
    )
      .flat(1)
      .map((projectedGcp) => projectedGcp.geo)

    if (previousIsNew || !this.projectedGeoPreviousTrianglePoints.length) {
      console.log('setting previous')
      this.projectedGeoPreviousTrianglePoints = this.projectedGeoTrianglePoints
    }

    this.updateTrianglePointsDistortion(previousIsNew)
  }

  /**
   * Update the (previous and new) distortion at the points of the triangulated resourceMask. Use cache if available.
   *
   * @param {boolean} [previousIsNew=false]
   */
  private updateTrianglePointsDistortion(previousIsNew = false) {
    if (!this.projectedGcpQuadTree) return

    if (this.distortionMeasure) {
      this.projectedGcpQuadTree = mapQuadTreeRecursively(
        this.projectedGcpQuadTree,
        (projectedGcp) => {
          const partialDerivativeX = this.projectedTransformer.transformToGeo(
            projectedGcp.resource,
            {
              evaluationType: 'partialDerivativeX'
            }
          )
          const partialDerivativeY = this.projectedTransformer.transformToGeo(
            projectedGcp.resource,
            {
              evaluationType: 'partialDerivativeY'
            }
          )
          return {
            ...projectedGcp,
            partialDerivativeX,
            partialDerivativeY
          }
        }
      )
    }

    this.projectedGcpQuadTree = mapQuadTreeRecursively(
      this.projectedGcpQuadTree,
      (projectedGcpAndPartialDerivatives) => {
        const distortionMeasure = computeDistortionFromPartialDerivatives(
          projectedGcpAndPartialDerivatives.partialDerivativeX,
          projectedGcpAndPartialDerivatives.partialDerivativeY,
          this.distortionMeasure,
          this.getReferenceScale()
        )
        return {
          ...projectedGcpAndPartialDerivatives,
          distortionMeasure
        }
      }
    )

    this.trianglePointsDistortion = getQuadTreeTriangles(
      this.projectedGcpQuadTree
    )
      .flat(1)
      .map(
        (projectedGcpAndDistortion) =>
          projectedGcpAndDistortion.distortionMeasure as number
      )

    if (previousIsNew || !this.previousTrianglePointsDistortion.length) {
      this.previousTrianglePointsDistortion = this.trianglePointsDistortion
    }
  }

  protected updateTransformerProperties(useCache = true): void {
    console.log('updateTransformerProperties')
    super.updateTransformerProperties(useCache)
    this.updateTriangulation(false)
  }

  protected updateDistortionProperties(): void {
    super.updateDistortionProperties()
    this.updateTrianglePointsDistortion(false)
  }

  // TODO: move to stdlib
  protected objectDepth = (o: Object): number => {
    return Object(o) === o
      ? 1 + Math.max(-1, ...Object.values(o).map(this.objectDepth))
      : 0
  }
}
