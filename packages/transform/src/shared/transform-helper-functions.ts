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
  refineBboxToGcpGridWithDepth,
  refineGcpGridWithDepth,
  refineRing
} from './refinement-helper-functions.js'

import type { TransformOptions, RefinementOptions } from './types.js'

import type {
  Point,
  LineString,
  Ring,
  Polygon,
  Bbox,
  Gcp,
  TypedGridWithDepth
} from '@allmaps/types'
import { mergeOptions } from '@allmaps/stdlib'

// Options

export const defaultTransformOptions: TransformOptions = {
  maxOffsetRatio: 0,
  minOffsetDistance: Infinity,
  minLineDistance: Infinity,
  maxDepth: 0,
  destinationIsGeographic: false,
  sourceIsGeographic: false,
  inputIsMultiGeometry: false,
  differentHandedness: false,
  evaluationType: 'function',
  returnDomain: 'normal'
}

export function refinementOptionsFromForwardTransformOptions(
  transformOptions: TransformOptions
): Partial<RefinementOptions> {
  const refinementOptions: Partial<RefinementOptions> = {
    maxOffsetRatio: transformOptions.maxOffsetRatio,
    minOffsetDistance: transformOptions.minOffsetDistance,
    minLineDistance: transformOptions.minLineDistance,
    maxDepth: transformOptions.maxDepth
  }

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
): Partial<RefinementOptions> {
  const refinementOptions: Partial<RefinementOptions> = {
    maxOffsetRatio: transformOptions.maxOffsetRatio,
    minOffsetDistance: transformOptions.minOffsetDistance,
    minLineDistance: transformOptions.minLineDistance,
    maxDepth: transformOptions.maxDepth
  }

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
): TypedGridWithDepth<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  const generalGcpGridWithDepth = refineBboxToGcpGridWithDepth(
    bbox,
    (p) => transformer.transformForward(p, transformOptions),
    refinementOptionsFromForwardTransformOptions(transformOptions)
  )
  return {
    depth: generalGcpGridWithDepth.depth,
    grid: generalGcpGridWithDepth.grid.map((typedRow) =>
      typedRow.map(generalGcpToGcpForForward)
    )
  }
}

export function transformBboxBackwardToGcpGrid(
  bbox: Bbox,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGridWithDepth<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  const generalGcpGridWithDepth = refineBboxToGcpGridWithDepth(
    bbox,
    (p) => transformer.transformBackward(p, transformOptions),
    refinementOptionsFromBackwardTransformOptions(transformOptions)
  )
  return {
    depth: generalGcpGridWithDepth.depth,
    grid: generalGcpGridWithDepth.grid.map((typedRow) =>
      typedRow.map(generalGcpToGcpForBackward)
    )
  }
}

export function transformGcpGridForward(
  gcpGridWithDepth: TypedGridWithDepth<Gcp>,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGridWithDepth<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  let generalGcpGridWithDepth = {
    depth: gcpGridWithDepth.depth,
    grid: gcpGridWithDepth.grid.map((typedRow) =>
      typedRow.map(gcpToGeneralGcpForForward)
    )
  }
  generalGcpGridWithDepth = refineGcpGridWithDepth(
    generalGcpGridWithDepth,
    (p) => transformer.transformForward(p, transformOptions),
    refinementOptionsFromForwardTransformOptions(transformOptions)
  )
  return {
    depth: generalGcpGridWithDepth.depth,
    grid: generalGcpGridWithDepth.grid.map((typedRow) =>
      typedRow.map(generalGcpToGcpForForward)
    )
  }
}

export function transformGcpGridBackward(
  gcpGridWithDepth: TypedGridWithDepth<Gcp>,
  transformer: GcpTransformer,
  partialTransformOptions: Partial<TransformOptions>
): TypedGridWithDepth<Gcp> {
  const transformOptions = mergeOptions(
    transformer.options,
    partialTransformOptions
  )
  let generalGcpGridWithDepth = {
    depth: gcpGridWithDepth.depth,
    grid: gcpGridWithDepth.grid.map((typedRow) =>
      typedRow.map(gcpToGeneralGcpForBackward)
    )
  }
  generalGcpGridWithDepth = refineGcpGridWithDepth(
    generalGcpGridWithDepth,
    (p) => transformer.transformBackward(p, transformOptions),
    refinementOptionsFromBackwardTransformOptions(transformOptions)
  )
  return {
    depth: generalGcpGridWithDepth.depth,
    grid: generalGcpGridWithDepth.grid.map((typedRow) =>
      typedRow.map(generalGcpToGcpForBackward)
    )
  }
}
