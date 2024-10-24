import { toImage } from '@allmaps/transform'

import type { GCPTransformInfo } from '@allmaps/transform'
import type { BBox, SVGPolygon } from './types.js'

export function geoBBoxToSVGPolygon(
  transformer: GCPTransformInfo,
  bbox: BBox
): SVGPolygon {
  const [y1, x1, y2, x2] = bbox

  return [
    toImage(transformer, [y1, x1]),
    toImage(transformer, [y1, x2]),
    toImage(transformer, [y2, x2]),
    toImage(transformer, [y2, x1])
  ]
}
