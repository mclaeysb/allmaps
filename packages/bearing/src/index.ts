import {
  ProjectedGcpTransformer,
  ProjectedGcpTransformerOptions
} from '@allmaps/project'
import {
  affineTransformPoint,
  angle,
  angularMean,
  computeBbox,
  identityAffineTransform,
  mergeOptions,
  mergePartialOptions,
  midPoint,
  radiansToDegrees,
  sizeToRectangle
} from '@allmaps/stdlib'

import type { GeoreferencedMap } from '@allmaps/annotation'
import type { TransformationTypeInputs } from '@allmaps/transform'
import type { AffineTransform, Point, Ring } from '@allmaps/types'
import type { MaskOptions, WarpedMap } from '@allmaps/render'

export type BearingOptions = Partial<MaskOptions> & {
  orientation?: 'horizontal' | 'vertical'
  projectedGeoAffineTransform: AffineTransform
}

export const DEFAULT_BEARING_OPTIONS: BearingOptions = {
  projectedGeoAffineTransform: identityAffineTransform
}

/**
 * Compute the bearing of a Georeferenced Map.
 *
 * @param georeferencedMap - Georeferenced Map
 * @returns The bearing of the map in degrees, measured in degrees from the north line in the clockwise (negative) direction
 */
export function computeGeoreferencedMapBearing(
  georeferencedMap: GeoreferencedMap,
  options?: Partial<
    BearingOptions & ProjectedGcpTransformerOptions & TransformationTypeInputs
  >
) {
  if (georeferencedMap.gcps.length < 2) {
    throw new Error('Not enough GCPs to compute bearing')
  }

  let resourceMask
  if (options?.applyMask === false) {
    const width = georeferencedMap.resource.width
    const height = georeferencedMap.resource.height
    if (!width || !height) {
      throw new Error(
        'Width and height must be known to compute bearing without mask'
      )
    }
    resourceMask = sizeToRectangle([width, height])
  } else {
    resourceMask = georeferencedMap.resourceMask
  }

  const projectedTransformer = ProjectedGcpTransformer.fromGeoreferencedMap(
    georeferencedMap,
    options
  )

  return computeBearingInternal(resourceMask, projectedTransformer, options)
}

/**
 * Compute the bearing of a Warped Map.
 *
 * @param warpedMap - Warped Map
 * @returns The bearing of the map in degrees, measured in degrees from the north line in the clockwise (negative) direction
 */
export function computeWarpedMapBearing(
  warpedMap: WarpedMap,
  options?: Partial<
    BearingOptions & ProjectedGcpTransformerOptions & TransformationTypeInputs
  >
) {
  if (warpedMap.gcps.length < 2) {
    throw new Error('Not enough GCPs to compute bearing')
  }

  const projectedTransformer = warpedMap.getProjectedTransformer(
    options?.transformationType,
    options
  )

  return computeBearingInternal(
    warpedMap.getResourceMask(options),
    projectedTransformer,
    mergePartialOptions(options, {
      projectedGeoAffineTransform: warpedMap.projectedGeoAffineTransform
    })
  )
}

// Compute the bearing by checking the orientation of
function computeBearingInternal(
  resourceMask: Ring,
  projectedTransformer: ProjectedGcpTransformer,
  partialOptions?: Partial<BearingOptions>
): number {
  const options = mergeOptions(DEFAULT_BEARING_OPTIONS, partialOptions)

  const resourceMaskBbox = computeBbox(resourceMask)

  const resourceTopLeft = [resourceMaskBbox[0], resourceMaskBbox[1]] as Point
  const resourceBottomLeft = [resourceMaskBbox[0], resourceMaskBbox[3]] as Point
  const resourceTopRight = [resourceMaskBbox[2], resourceMaskBbox[1]] as Point
  const resourceBottomRight = [
    resourceMaskBbox[2],
    resourceMaskBbox[3]
  ] as Point

  const resourceTopCenter = midPoint(resourceTopLeft, resourceTopRight)
  const resourceBottomCenter = midPoint(resourceBottomLeft, resourceBottomRight)
  let projectedGeoTopCenter =
    projectedTransformer.transformToProjectedGeo(resourceTopCenter)
  let projectedGeoBottomCenter =
    projectedTransformer.transformToProjectedGeo(resourceBottomCenter)
  if (options.applyAffineTransformation) {
  }
  projectedGeoTopCenter = affineTransformPoint(
    options.projectedGeoAffineTransform,
    projectedGeoTopCenter
  )
  projectedGeoBottomCenter = affineTransformPoint(
    options.projectedGeoAffineTransform,
    projectedGeoBottomCenter
  )

  const resourceCenterRight = midPoint(resourceTopRight, resourceBottomRight)
  const resourceCenterLeft = midPoint(resourceTopLeft, resourceBottomLeft)
  let projectedGeoCenterLeft =
    projectedTransformer.transformToProjectedGeo(resourceCenterLeft)
  let projectedGeoCenterRight =
    projectedTransformer.transformToProjectedGeo(resourceCenterRight)
  if (options.applyAffineTransformation) {
  }
  projectedGeoCenterLeft = affineTransformPoint(
    options.projectedGeoAffineTransform,
    projectedGeoCenterLeft
  )
  projectedGeoCenterRight = affineTransformPoint(
    options.projectedGeoAffineTransform,
    projectedGeoCenterRight
  )

  const verticalAngle = angle([projectedGeoBottomCenter, projectedGeoTopCenter])

  const horizontalAngle = angle([
    projectedGeoCenterLeft,
    projectedGeoCenterRight
  ])

  if (options.orientation == 'horizontal') {
    return -radiansToDegrees(horizontalAngle)
  } else if (options.orientation == 'vertical') {
    return -radiansToDegrees(verticalAngle - Math.PI / 2)
  } else {
    return -radiansToDegrees(
      angularMean(verticalAngle - Math.PI / 2, horizontalAngle)
    )
  }
}
