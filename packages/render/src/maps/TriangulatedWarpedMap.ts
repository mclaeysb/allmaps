import { Map as GeoreferencedMap } from '@allmaps/annotation'
import {
  computeDistortionFromPartialDerivatives,
  getQuadTreeTriangles,
  mapQuadTreeRecursively,
  mixQuadTreesRecursively
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

import type { Point, Ring, QuadTree, Rectangle, Gcp } from '@allmaps/types'

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

type GcpWithDistortionMeasure = Gcp & {
  partialDerivativeX?: Point
  partialDerivativeY?: Point
  distortionMeasure?: number
}

/**
 * Class for triangulated WarpedMaps.
 *
 * @export
 * @class TriangulatedWarpedMap
 * @param {QuadTree<Gcp>} projectedPreviousGeoQuadTree - QuadTree of the previous transformation type used to triangulate the map (at the current viewport)
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
  projectedPreviousGcpQuadTree?: QuadTree<GcpWithDistortionMeasure>
  projectedGcpQuadTree?: QuadTree<GcpWithDistortionMeasure>
  projectedPreviousFinerGcpQuadTree?: QuadTree<GcpWithDistortionMeasure>
  projectedFinerGcpQuadTree?: QuadTree<GcpWithDistortionMeasure>

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
   * Set currentResourceViewportRing at current viewport. Triggers triangulation update if needed.
   *
   * @param {Ring} [resourceViewportRing]
   */
  setCurrentResourceViewportRing(resourceViewportRing?: Ring) {
    super.setCurrentResourceViewportRing(resourceViewportRing)
    // TODO: check if changed significantly
    this.updateTriangulation(true)
  }

  /**
   * Reset the previous points and values.
   */
  resetPrevious() {
    super.resetPrevious()
    this.projectedPreviousGcpQuadTree = this.projectedGcpQuadTree
    this.projectedPreviousFinerGcpQuadTree = this.projectedGcpQuadTree // Note: no 'Finer'!
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
    if (
      this.projectedFinerGcpQuadTree &&
      this.projectedPreviousFinerGcpQuadTree
    ) {
      this.projectedPreviousFinerGcpQuadTree = mixQuadTreesRecursively(
        this.projectedFinerGcpQuadTree,
        this.projectedPreviousFinerGcpQuadTree,
        (
          projectedGcpWithDistortion0: GcpWithDistortionMeasure,
          projectedGcpWithDistortion1: GcpWithDistortionMeasure
        ) => {
          return {
            resource: mixPoints(
              projectedGcpWithDistortion0.resource,
              projectedGcpWithDistortion1.resource,
              t
            ),
            geo: mixPoints(
              projectedGcpWithDistortion0.geo,
              projectedGcpWithDistortion1.geo,
              t
            ),
            distortionMeasure:
              projectedGcpWithDistortion0.distortionMeasure &&
              projectedGcpWithDistortion1.distortionMeasure
                ? mixNumbers(
                    projectedGcpWithDistortion0.distortionMeasure,
                    projectedGcpWithDistortion1.distortionMeasure,
                    t
                  )
                : undefined
          }
        }
      )
    }
  }

  /**
   * Update the triangulation of the resourceMask.
   *
   * @param {boolean} [previousIsNew] - whether the previous and new triangulation are the same - true by default, false during a transformation transition
   */
  private updateTriangulation(previousIsNew = false) {
    if (!this.currentResourceViewportRingBbox) return

    const resourceMaskInViewportBbox = bboxesIntersect(
      bufferBboxByRatio(this.currentResourceViewportRingBbox, 1),
      this.resourceMaskBbox
    )

    if (!resourceMaskInViewportBbox) return

    this.projectedGcpQuadTree =
      this.projectedTransformer.transformRectangleForwardToGcpQuadTree(
        bboxToRectangle(resourceMaskInViewportBbox),
        {
          maxOffsetRatio: 0.001,
          maxDepth: 5
        }
      )

    this.projectedFinerGcpQuadTree = this.projectedGcpQuadTree

    if (!this.projectedPreviousFinerGcpQuadTree) {
      this.projectedPreviousFinerGcpQuadTree = this.projectedFinerGcpQuadTree
    }
    // Make previous and current GcpQuadTree be of same fineness
    // Note: don't do anything if they already are
    if (
      this.objectDepth(this.projectedPreviousFinerGcpQuadTree!) >
        this.objectDepth(this.projectedFinerGcpQuadTree!) &&
      !previousIsNew // TODO: check
    ) {
      this.projectedFinerGcpQuadTree = mapQuadTreeRecursively(
        this.projectedPreviousFinerGcpQuadTree,
        (projectedGcp) => {
          return {
            ...projectedGcp,
            geo: this.projectedTransformer.transformForward(
              projectedGcp.resource
            )
          }
        }
      )
    }
    if (
      this.objectDepth(this.projectedPreviousFinerGcpQuadTree!) <
        this.objectDepth(this.projectedFinerGcpQuadTree!) &&
      !previousIsNew // TODO: check
    ) {
      this.projectedPreviousFinerGcpQuadTree = mapQuadTreeRecursively(
        this.projectedFinerGcpQuadTree,
        (projectedGcp) => {
          return {
            ...projectedGcp,
            geo: this.projectedPreviousTransformer.transformForward(
              projectedGcp.resource
            )
          }
        }
      )
    }

    this.resourceTrianglePoints = getQuadTreeTriangles(
      this.projectedFinerGcpQuadTree
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
    if (!this.projectedFinerGcpQuadTree) return
    this.projectedGeoTrianglePoints = getQuadTreeTriangles(
      this.projectedFinerGcpQuadTree
    )
      .flat(1)
      .map((projectedGcp) => projectedGcp.geo)

    if (previousIsNew || !this.projectedGeoPreviousTrianglePoints.length) {
      this.projectedGeoPreviousTrianglePoints = this.projectedGeoTrianglePoints
    } else {
      if (this.projectedPreviousFinerGcpQuadTree) {
        this.projectedGeoPreviousTrianglePoints = getQuadTreeTriangles(
          this.projectedPreviousFinerGcpQuadTree
        )
          .flat(1)
          .map((projectedGcp) => projectedGcp.geo)
      }
    }

    this.updateTrianglePointsDistortion(previousIsNew)
  }

  /**
   * Update the (previous and new) distortion at the points of the triangulated resourceMask. Use cache if available.
   *
   * @param {boolean} [previousIsNew=false]
   */
  private updateTrianglePointsDistortion(previousIsNew = false) {
    if (!this.projectedFinerGcpQuadTree) return

    if (this.distortionMeasure) {
      this.projectedFinerGcpQuadTree = mapQuadTreeRecursively(
        this.projectedFinerGcpQuadTree,
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

    this.projectedFinerGcpQuadTree = mapQuadTreeRecursively(
      this.projectedFinerGcpQuadTree,
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
      this.projectedFinerGcpQuadTree
    )
      .flat(1)
      .map(
        (projectedGcpAndDistortion) =>
          projectedGcpAndDistortion.distortionMeasure as number
      )

    if (previousIsNew || !this.previousTrianglePointsDistortion.length) {
      this.previousTrianglePointsDistortion = this.trianglePointsDistortion
    } else {
      if (this.projectedPreviousFinerGcpQuadTree) {
        this.previousTrianglePointsDistortion = getQuadTreeTriangles(
          this.projectedPreviousFinerGcpQuadTree
        )
          .flat(1)
          .map(
            (projectedGcpAndDistortion) =>
              projectedGcpAndDistortion.distortionMeasure as number
          )
      }
    }
  }

  protected updateTransformerProperties(useCache = true): void {
    super.updateTransformerProperties(useCache)
    this.updateTriangulation(false)
  }

  protected updateDistortionProperties(): void {
    super.updateDistortionProperties()
    this.updateTrianglePointsDistortion(false)
  }

  // TODO: move to stdlib
  // Or use same as for longer line
  protected objectDepth = (o: Object): number => {
    return Object(o) === o
      ? 1 + Math.max(-1, ...Object.values(o).map(this.objectDepth))
      : 0
  }
}
