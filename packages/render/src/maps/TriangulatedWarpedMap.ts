import { Map as GeoreferencedMap } from '@allmaps/annotation'
import {
  computeDistortionFromPartialDerivatives,
  transformGcpGridForward,
  transformBboxForwardToGcpGrid
} from '@allmaps/transform'
import {
  mixNumbers,
  mixPoints,
  mixTypedGrids,
  getTypedGridTriangles,
  getTypedGridDepth
} from '@allmaps/stdlib'

import WarpedMap from './WarpedMap.js'

import type { WarpedMapOptions } from '../shared/types.js'

import type { Point, Ring, Gcp, TileZoomLevel, TypedGrid } from '@allmaps/types'

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

type GcpAndDistortionMeasure = Gcp & {
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
  projectedPreviousGcpGrid?: TypedGrid<GcpAndDistortionMeasure>
  projectedGcpGrid?: TypedGrid<GcpAndDistortionMeasure>

  computePrevious = true

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

    console.log('since constructor')
    this.updateTriangulation()
  }

  /**
   * Update the resourceMask.
   *
   * @param {Ring} resourceMask
   */
  setResourceMask(resourceMask: Ring): void {
    super.setResourceMask(resourceMask)
    console.log('since set resource mask')
    this.updateTriangulation()
  }

  /**
   * Set the overview tile zoom level for the current viewport
   *
   * @param {TileZoomLevel} [tileZoomLevel] - tile zoom level
   */
  setCurrentTileZoomLevel(tileZoomLevel?: TileZoomLevel) {
    super.setCurrentTileZoomLevel(tileZoomLevel)
    // TODO: this can be used to update the triangulation based on the scalefactor
    // By setting the allowed absolute error based on the scale and projectedGeo error
    // Keeping this here for now since it's the only cases where updateTriangulation() is called with 'true'
    // this.updateTriangulation(true)
  }

  /**
   * Reset the previous points and values.
   */
  resetPrevious() {
    super.resetPrevious()
    this.projectedPreviousGcpGrid = this.projectedGcpGrid
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
    if (this.projectedGcpGrid && this.projectedPreviousGcpGrid) {
      if (
        this.projectedGcpGrid.length != this.projectedPreviousGcpGrid.length ||
        getTypedGridDepth(this.projectedGcpGrid) !=
          getTypedGridDepth(this.projectedPreviousGcpGrid)
      ) {
        throw new Error('Mixing grids of different size or depth')
      }
      this.projectedPreviousGcpGrid = mixTypedGrids(
        this.projectedGcpGrid,
        this.projectedPreviousGcpGrid,
        (
          projectedGcpAndDistortion0: GcpAndDistortionMeasure,
          projectedGcpAndDistortion1: GcpAndDistortionMeasure
        ) => {
          return {
            resource: mixPoints(
              projectedGcpAndDistortion0.resource,
              projectedGcpAndDistortion1.resource,
              t
            ),
            geo: mixPoints(
              projectedGcpAndDistortion0.geo,
              projectedGcpAndDistortion1.geo,
              t
            ),
            distortionMeasure:
              projectedGcpAndDistortion0.distortionMeasure &&
              projectedGcpAndDistortion1.distortionMeasure
                ? mixNumbers(
                    projectedGcpAndDistortion0.distortionMeasure,
                    projectedGcpAndDistortion1.distortionMeasure,
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
   * Update the (previous and new) points of the triangulated resourceMask, at the current bestScaleFactor, in projectedGeo coordinates. Use cache if available.
   *
   * @param {boolean} [previousIsNew] - whether the previous and new triangulation are the same - true by default, false during a transformation transition
   */
  private updateTriangulation(previousIsNew = false) {
    console.log('>> updateTriangulation()')
    const triangulationTransformOptions = {
      maxOffsetRatio: 0.02,
      maxDepth: 6
    }

    this.computePrevious = true

    console.log(
      'starting from',
      this.projectedPreviousGcpGrid,
      this.projectedGcpGrid,
      this.previousTransformationType,
      this.transformationType,
      this.projectedPreviousTransformer,
      this.projectedTransformer
    )

    if (!this.projectedPreviousGcpGrid) {
      // Computing current grid from bbox
      // TODO: replace in cached
      console.log('from scratch')
      this.projectedGcpGrid = transformBboxForwardToGcpGrid(
        this.resourceMaskBbox,
        this.projectedTransformer,
        triangulationTransformOptions
      )
      this.projectedPreviousGcpGrid = this.projectedGcpGrid
    } else {
      console.log('from previous')
      const previousDepth = getTypedGridDepth(this.projectedPreviousGcpGrid)
      // Computing current grid from previous, with current transformer
      // TODO: replace in cached
      this.projectedGcpGrid = transformGcpGridForward(
        this.projectedPreviousGcpGrid,
        this.projectedTransformer,
        triangulationTransformOptions
      )
      // Re-compute current if previous is finer
      // TODO: replace in cached
      if (
        getTypedGridDepth(this.projectedPreviousGcpGrid) !=
        getTypedGridDepth(this.projectedGcpGrid)
      ) {
        console.log(
          'adapting previous since',
          getTypedGridDepth(this.projectedPreviousGcpGrid),
          getTypedGridDepth(this.projectedGcpGrid)
        )
        this.projectedPreviousGcpGrid = transformGcpGridForward(
          this.projectedGcpGrid,
          this.projectedPreviousTransformer,
          triangulationTransformOptions
        )
        this.computePrevious =
          previousDepth < getTypedGridDepth(this.projectedPreviousGcpGrid)
      }
      console.log(
        'depths afterwards',
        previousDepth,
        getTypedGridDepth(this.projectedPreviousGcpGrid)
      )
    }

    console.log(
      'results',
      this.projectedGcpGrid,
      this.projectedPreviousGcpGrid,
      this.computePrevious
    )

    // New function here that's only called if something changed and sets 'shouldUpdateVertexBuffers' which is checked when updating buffer

    this.resourceTrianglePoints = getTypedGridTriangles(this.projectedGcpGrid)
      .flat(1)
      .map((projectedGcp) => projectedGcp.resource)

    this.projectedGeoTrianglePoints = getTypedGridTriangles(
      this.projectedGcpGrid
    )
      .flat(1)
      .map((projectedGcp) => projectedGcp.geo)

    if (
      previousIsNew ||
      !this.projectedGeoPreviousTrianglePoints ||
      !this.projectedPreviousGcpGrid
    ) {
      console.log('previous by setting previous from current')
      this.projectedGeoPreviousTrianglePoints = this.projectedGeoTrianglePoints
    } else if (this.computePrevious) {
      console.log('previous by computing')
      this.projectedGeoPreviousTrianglePoints = getTypedGridTriangles(
        this.projectedPreviousGcpGrid
      )
        .flat(1)
        .map((projectedGcp) => projectedGcp.geo)
    }

    console.log(
      'and results',
      this.resourceTrianglePoints.slice(0, 5),
      this.projectedGeoTrianglePoints.slice(0, 5),
      this.projectedGeoPreviousTrianglePoints.slice(0, 5)
    )

    this.updateTrianglePointsDistortion(previousIsNew)
  }

  /**
   * Update the (previous and new) distortion at the points of the triangulated resourceMask. Use cache if available.
   *
   * @param {boolean} [previousIsNew=false]
   */
  private updateTrianglePointsDistortion(previousIsNew = false) {
    if (!this.projectedPreviousGcpGrid || !this.projectedGcpGrid) {
      return
    }

    if (this.distortionMeasure) {
      this.projectedGcpGrid = this.projectedGcpGrid.map((projectedGcpRow) =>
        projectedGcpRow.map((projectedGcp) => {
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
        })
      )
    }

    this.projectedGcpGrid = this.projectedGcpGrid.map((projectedGcpRow) =>
      projectedGcpRow.map((projectedGcpAndPartialDerivatives) => {
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
      })
    )

    this.trianglePointsDistortion = getTypedGridTriangles(this.projectedGcpGrid)
      .flat(1)
      .map(
        (projectedGcpAndDistortion) =>
          projectedGcpAndDistortion.distortionMeasure as number
      )

    if (previousIsNew || !this.previousTrianglePointsDistortion) {
      this.previousTrianglePointsDistortion = this.trianglePointsDistortion
    } else if (this.computePrevious) {
      this.previousTrianglePointsDistortion = getTypedGridTriangles(
        this.projectedPreviousGcpGrid
      )
        .flat(1)
        .map(
          (projectedGcpAndDistortion) =>
            projectedGcpAndDistortion.distortionMeasure as number
        )
    }
  }

  protected updateTransformerProperties(useCache = true): void {
    console.log('since update transform properties')
    super.updateTransformerProperties(useCache)
    this.updateTriangulation(false)
  }

  protected updateDistortionProperties(): void {
    super.updateDistortionProperties()
    this.updateTrianglePointsDistortion(false)
  }
}
