import earcut from 'earcut'

import { Map as GeoreferencedMap } from '@allmaps/annotation'
import {
  computeDistortionFromPartialDerivatives,
  transformGcpGridForward,
  transformBboxForwardToGcpGrid,
  GcpTransformer,
  DistortionMeasure
} from '@allmaps/transform'
import {
  mixNumbers,
  mixPoints,
  mixTypedGrids,
  getTypedGridTriangles,
  getTypedGridDepth,
  mapTypedGrid,
  getPropertyFromCacheOrComputation
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
  distortion?: number
}

/**
 * Class for triangulated WarpedMaps.
 *
 * @export
 * @class TriangulatedWarpedMap
 * @param {Point[]} resourceMaskTrianglePointIndices - Triangle point incidices of the triangulated resourceMask. These are only used for the WebGL stencil, and dont correspont to the other triangle points used for drawing the maps
 * @param {Point[]} projectedGeoPreviousMaskTrianglePoints - The projectedGeoMaskTrianglePoints of the previous transformation type, used during transformation transitions
 * @param {Point[]} projectedGeoMaskTrianglePoints - The resourceMaskTrianglePoints in projected geospatial coordinated.
 * @param {QuadTree<Gcp>} projectedPreviousGeoQuadTree - QuadTree of the previous transformation type used to triangulate the map (at the current viewport)
 * @param {QuadTree<Gcp>} projectedGeoQuadTree - QuadTree used to triangulate the map (at the current viewport)
 * @param {Point[]} resourceTrianglepoints - Triangle points of the triangulated resourceMask (at the current scaleFactor)
 * @param {Point[]} resourceUniquepoints - Unique points of the triangles the triangulated resourceMask (at the current scaleFactor)
 * @param {number[]} trianglePointsUniquePointsIndex - Index in resourceUniquepoints where a specific resourceTrianglepoint can be found
 * @param {number} triangulateErrorCount - Number of time the triangulation has resulted in an error
 * @param {Point[]} projectedGeoPreviousTrianglePoints - The projectedGeoTrianglePoints of the previous transformation type, used during transformation transitions
 * @param {Point[]} projectedGeoTrianglePoints - The resourceTrianglePoints in projected geospatial coordinates
 * @param {Point[]} projectedGeoUniquePoints - The resourceUniquePoints in projected geospatial coordinates
 * @param {Point[]} projectedGeoUniquePointsPartialDerivativeX - Partial Derivative to X at the projectedGeoUniquePoints
 * @param {Point[]} projectedGeoUniquePointsPartialDerivativeY - Partial Derivative to Y at the projectedGeoUniquePoints
 * @param {number[]} previousTrianglePointsDistortion - The trianglePointsDistortion of the previous transformation type, used during transformation transitions
 * @param {number[]} trianglePointsDistortion - Distortion amount of the distortionMeasure at the projectedGeoTrianglePoints
 * @param {number[]} uniquePointsDistortion - Distortion amount of the distortionMeasure at the projectedGeoUniquePoints
 */
export default class TriangulatedWarpedMap extends WarpedMap {
  resourceMaskTrianglePointIndices: number[] = []
  projectedGeoPreviousMaskTrianglePoints: Point[] = []
  projectedGeoMaskTrianglePoints: Point[] = []

  projectedPreviousGcpGrid?: TypedGrid<GcpAndDistortionMeasure>
  projectedGcpGrid?: TypedGrid<GcpAndDistortionMeasure>
  private projectedGcpGridByTransformationType: Map<
    string,
    TypedGrid<GcpAndDistortionMeasure>
  > = new Map()

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

    this.updateMaskTriangulation()
    this.updateTriangulation()
  }

  /**
   * Update the resourceMask.
   *
   * @param {Ring} resourceMask
   */
  setResourceMask(resourceMask: Ring): void {
    super.setResourceMask(resourceMask)
    this.updateMaskTriangulation()
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
    this.projectedGeoPreviousMaskTrianglePoints =
      this.projectedGeoMaskTrianglePoints
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
            distortionMeasure: mixNumbers(
              projectedGcpAndDistortion0.distortion || 0,
              projectedGcpAndDistortion1.distortion || 0,
              t
            )
          }
        }
      )
    }
  }

  /**
   * Update the earcut triangulation of the resourceMask.
   */
  private updateMaskTriangulation() {
    // Ensure this function is only run after initialisation (see also updateTriangulation())
    if (!this.resourceMaskTrianglePointIndices) {
      return
    }

    this.resourceMaskTrianglePointIndices = earcut(
      this.resourceFinerMask.flat()
    )
    this.projectedGeoMaskTrianglePoints =
      this.resourceMaskTrianglePointIndices.map(
        (i) => this.projectedGeoFinerMask[i]
      )
    this.projectedGeoPreviousMaskTrianglePoints =
      this.resourceMaskTrianglePointIndices.map(
        (i) => this.projectedGeoPreviousFinerMask[i]
      )
  }

  /**
   * Update the triangulation of the resourceMask.
   * Update the (previous and new) points of the triangulated resourceMask, at the current bestScaleFactor, in projectedGeo coordinates. Use cache if available.
   *
   * @param {boolean} [previousIsNew] - whether the previous and new triangulation are the same - true by default, false during a transformation transition
   */
  private updateTriangulation(previousIsNew = false) {
    const triangulationTransformOptions = {
      maxOffsetRatio: 0.01,
      maxDepth: 5
    }

    // Ensure this function is only run after initialisation
    // The TriangulatedMap constructor calls this function twice
    // Once via super() and updateTransformerProperties()
    // but then the cache is not ready yet, so we make it return
    // And once at the end
    if (!this.projectedGcpGridByTransformationType) {
      return
    }

    if (previousIsNew) {
      this.projectedPreviousGcpGrid = this.projectedGcpGrid
      this.previousTransformationType = this.transformationType
    }

    if (!this.projectedPreviousGcpGrid) {
      // Compute grid from bbox
      this.projectedGcpGrid = getPropertyFromCacheOrComputation(
        this.projectedGcpGridByTransformationType,
        this.transformationType,
        () => {
          return transformBboxForwardToGcpGrid(
            this.resourceMaskBbox,
            this.projectedTransformer,
            triangulationTransformOptions
          )
        }
      )
      this.projectedPreviousGcpGrid = this.projectedGcpGrid
    } else {
      // Computing current grid from previous grid (or cache)
      this.projectedGcpGrid = getPropertyFromCacheOrComputation(
        this.projectedGcpGridByTransformationType,
        this.transformationType,
        () => {
          return transformGcpGridForward(
            this.projectedPreviousGcpGrid!,
            this.projectedTransformer,
            triangulationTransformOptions
          )
        },
        () => !this.mixed,
        () => !this.mixed
      )

      // Refine previous grid from grid (if needed)
      if (
        getTypedGridDepth(this.projectedPreviousGcpGrid) !=
        getTypedGridDepth(this.projectedGcpGrid!)
      ) {
        this.projectedPreviousGcpGrid = getPropertyFromCacheOrComputation(
          this.projectedGcpGridByTransformationType,
          this.previousTransformationType,
          () => {
            return transformGcpGridForward(
              this.projectedGcpGrid!,
              this.projectedPreviousTransformer,
              triangulationTransformOptions
            )
          },
          (projectedPreviousGcpGrid) =>
            getTypedGridDepth(projectedPreviousGcpGrid) ==
              getTypedGridDepth(this.projectedGcpGrid!) && !this.mixed,
          () => !this.mixed
        )
      }
    }

    this.updateTrianglePoints()
  }

  /**
   * Update the points of the triangulated resourceMask. Use cache if available.
   */
  private updateTrianglePoints() {
    if (!this.projectedPreviousGcpGrid || !this.projectedGcpGrid) {
      return
    }

    this.resourceTrianglePoints = getTypedGridTriangles(this.projectedGcpGrid)
      .flat(1)
      .map((projectedGcp) => projectedGcp.resource)

    this.projectedGeoTrianglePoints = getTypedGridTriangles(
      this.projectedGcpGrid
    )
      .flat(1)
      .map((projectedGcp) => projectedGcp.geo)

    this.projectedGeoPreviousTrianglePoints = getTypedGridTriangles(
      this.projectedPreviousGcpGrid
    )
      .flat(1)
      .map((projectedGcp) => projectedGcp.geo)

    this.updateTrianglePointsDistortion()
  }

  /**
   * Update the (previous and new) distortion at the points of the triangulated resourceMask. Use cache if available.
   *
   * @param {boolean} [previousIsNew=false]
   */
  private updateTrianglePointsDistortion() {
    if (!this.projectedPreviousGcpGrid || !this.projectedGcpGrid) {
      return
    }

    this.projectedGcpGrid = mapTypedGrid(
      this.projectedGcpGrid,
      (projectedGcp) =>
        this.computeDistortion(
          this.projectedTransformer,
          projectedGcp as Gcp,
          this.distortionMeasure,
          this.getReferenceScale()
        )
    )

    this.projectedPreviousGcpGrid = mapTypedGrid(
      this.projectedPreviousGcpGrid,
      (projectedGcp) =>
        this.computeDistortion(
          this.projectedPreviousTransformer,
          projectedGcp as Gcp,
          this.previousDistortionMeasure,
          this.getReferenceScale()
        )
    )

    this.trianglePointsDistortion = getTypedGridTriangles(this.projectedGcpGrid)
      .flat(1)
      .map(
        (projectedGcpAndDistortion) =>
          projectedGcpAndDistortion.distortion as number
      )

    this.previousTrianglePointsDistortion = getTypedGridTriangles(
      this.projectedPreviousGcpGrid
    )
      .flat(1)
      .map(
        (projectedGcpAndDistortion) =>
          projectedGcpAndDistortion.distortion as number
      )
  }

  protected updateTransformerProperties(useCache = true): void {
    super.updateTransformerProperties(useCache)
    this.updateMaskTriangulation()
    this.updateTriangulation(false)
  }

  protected updateDistortionProperties(): void {
    super.updateDistortionProperties()
    this.updateTrianglePointsDistortion()
  }

  private computeDistortion(
    transformer: GcpTransformer,
    projectedGcp: Gcp,
    distortionMeasure?: DistortionMeasure,
    referenceScale?: number
  ) {
    if (distortionMeasure) {
      const partialDerivativeX = transformer.transformToGeo(
        projectedGcp.resource,
        {
          evaluationType: 'partialDerivativeX'
        }
      )
      const partialDerivativeY = transformer.transformToGeo(
        projectedGcp.resource,
        {
          evaluationType: 'partialDerivativeY'
        }
      )
      const distortion = computeDistortionFromPartialDerivatives(
        partialDerivativeX,
        partialDerivativeY,
        distortionMeasure,
        referenceScale
      )
      return {
        ...projectedGcp,
        distortion
      }
    } else {
      return {
        ...projectedGcp,
        distortion: 0
      }
    }
  }
}
