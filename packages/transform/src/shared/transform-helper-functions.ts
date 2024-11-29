// TODO: consider implementing these functions in stdlib instead of using dependencies
import getWorldMidpoint from '@turf/midpoint'
import getWorldDistance from '@turf/distance'

import GcpTransformer from '../transformer'
import {
  generalGcpToGcpForForward,
  generalGcpToGcpForBackward,
  gcpToGeneralGcpForForward,
  gcpToGeneralGcpForBackward,
  refineLineString,
  refineBboxToGcpGrid,
  refineGcpGrid,
  refineRing,
  defaultRefinementOptions
} from './refinement-helper-functions.js'

import type { TransformOptions, RefinementOptions } from './types.js'

import type {
  Point,
  LineString,
  Ring,
  Polygon,
  Bbox,
  Gcp,
  TypedGrid
} from '@allmaps/types'
import { mergeOptions } from '@allmaps/stdlib'

// Options

export const defaultTransformOptions: TransformOptions = {
  maxDepth: 0,
  minOffsetRatio: 0,
  minOffsetDistance: Infinity,
  minLineDistance: Infinity,
  destinationIsGeographic: false,
  sourceIsGeographic: false,
  inputIsMultiGeometry: false,
  differentHandedness: false,
  evaluationType: 'function',
  returnDomain: 'normal'
}

export function refinementOptionsFromForwardTransformOptions(
  transformOptions: TransformOptions
): RefinementOptions {
  const refinementOptions = mergeOptions(defaultRefinementOptions, {
    minOffsetRatio: transformOptions.minOffsetRatio,
    minOffsetDistance: transformOptions.minOffsetDistance,
    minLineDistance: transformOptions.minLineDistance,
    maxDepth: transformOptions.maxDepth
  })

  if (transformOptions.sourceIsGeographic) {
    refinementOptions.sourceMidPointFunction = (point0: Point, point1: Point) =>
      getWorldMidpoint(point0, point1).geometry.coordinates as Point
  }
  if (transformOptions.destinationIsGeographic) {
    refinementOptions.destinationMidPointFunction = (
      point0: Point,
      point1: Point
    ) => getWorldMidpoint(point0, point1).geometry.coordinates as Point
    refinementOptions.destinationDistanceFunction = getWorldDistance
  }
  if (transformOptions.returnDomain == 'inverse') {
    refinementOptions.returnDomain = 'source'
  }
  return refinementOptions
}

export function refinementOptionsFromBackwardTransformOptions(
  transformOptions: TransformOptions
): RefinementOptions {
  const refinementOptions = mergeOptions(defaultRefinementOptions, {
    minOffsetRatio: transformOptions.minOffsetRatio,
    minOffsetDistance: transformOptions.minOffsetDistance,
    minLineDistance: transformOptions.minLineDistance,
    maxDepth: transformOptions.maxDepth
  })

  if (transformOptions.destinationIsGeographic) {
    refinementOptions.sourceMidPointFunction = (point0: Point, point1: Point) =>
      getWorldMidpoint(point0, point1).geometry.coordinates as Point
  }
  if (transformOptions.sourceIsGeographic) {
    refinementOptions.destinationMidPointFunction = (
      point0: Point,
      point1: Point
    ) => getWorldMidpoint(point0, point1).geometry.coordinates as Point
    refinementOptions.destinationDistanceFunction = getWorldDistance
  }
  if (transformOptions.returnDomain == 'inverse') {
    refinementOptions.returnDomain = 'source'
  }
  return refinementOptions
}

// Transform Geometries

export function transformLineStringForwardToLineString(
  lineString: LineString,
  transformer: GcpTransformer,
  transformOptions: TransformOptions
): LineString {
  return refineLineString(
    lineString,
    (p) => transformer.transformForward(p),
    refinementOptionsFromForwardTransformOptions(transformOptions)
  )
}

export function transformLineStringBackwardToLineString(
  lineString: LineString,
  transformer: GcpTransformer,
  transformOptions: TransformOptions
): LineString {
  return refineLineString(
    lineString,
    (p) => transformer.transformBackward(p),
    refinementOptionsFromBackwardTransformOptions(transformOptions)
  )
}

export function transformRingForwardToRing(
  ring: Ring,
  transformer: GcpTransformer,
  transformOptions: TransformOptions
): Ring {
  return refineRing(
    ring,
    (p) => transformer.transformForward(p),
    refinementOptionsFromForwardTransformOptions(transformOptions)
  )
}

export function transformRingBackwardToRing(
  ring: Ring,
  transformer: GcpTransformer,
  transformOptions: TransformOptions
): Ring {
  return refineRing(
    ring,
    (p) => transformer.transformBackward(p),
    refinementOptionsFromBackwardTransformOptions(transformOptions)
  )
}

export function transformPolygonForwardToPolygon(
  polygon: Polygon,
  transformer: GcpTransformer,
  transformOptions: TransformOptions
): Polygon {
  return polygon.map((ring) => {
    return transformRingForwardToRing(ring, transformer, transformOptions)
  })
}

export function transformPolygonBackwardToPolygon(
  polygon: Polygon,
  transformer: GcpTransformer,
  transformOptions: TransformOptions
): Polygon {
  return polygon.map((ring) => {
    return transformRingBackwardToRing(ring, transformer, transformOptions)
  })
}

// Transform GcpGrid

export function transformBboxForwardToGcpGrid(
  bbox: Bbox,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGrid<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  const generalGcpGrid = refineBboxToGcpGrid(
    bbox,
    (p) => transformer.transformForward(p, transformOptions),
    refinementOptionsFromForwardTransformOptions(transformOptions)
  )
  return generalGcpGrid.map((typedRow) =>
    typedRow.map(generalGcpToGcpForForward)
  )
}

export function transformBboxBackwardToGcpGrid(
  bbox: Bbox,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGrid<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  const generalGcpGrid = refineBboxToGcpGrid(
    bbox,
    (p) => transformer.transformBackward(p, transformOptions),
    refinementOptionsFromBackwardTransformOptions(transformOptions)
  )
  return generalGcpGrid.map((typedRow) =>
    typedRow.map(generalGcpToGcpForBackward)
  )
}

export function transformGcpGridForward(
  gcpGrid: TypedGrid<Gcp>,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGrid<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  let generalGcpGrid = gcpGrid.map((typedRow) =>
    typedRow.map(gcpToGeneralGcpForForward)
  )
  generalGcpGrid = refineGcpGrid(
    generalGcpGrid,
    (p) => transformer.transformForward(p, transformOptions),
    refinementOptionsFromForwardTransformOptions(transformOptions)
  )
  return generalGcpGrid.map((typedRow) =>
    typedRow.map(generalGcpToGcpForForward)
  )
}

export function transformGcpGridBackward(
  gcpGrid: TypedGrid<Gcp>,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGrid<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  let generalGcpGrid = gcpGrid.map((typedRow) =>
    typedRow.map(gcpToGeneralGcpForBackward)
  )
  generalGcpGrid = refineGcpGrid(
    generalGcpGrid,
    (p) => transformer.transformBackward(p, transformOptions),
    refinementOptionsFromBackwardTransformOptions(transformOptions)
  )
  return generalGcpGrid.map((typedRow) =>
    typedRow.map(generalGcpToGcpForBackward)
  )
}
