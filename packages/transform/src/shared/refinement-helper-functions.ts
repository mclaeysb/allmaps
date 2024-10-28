import {
  midPoint,
  distance,
  conformLineString,
  conformRing,
  mergeOptions
} from '@allmaps/stdlib'

import type {
  Point,
  LineString,
  Ring,
  Rectangle,
  Gcp,
  TypedLine,
  TypedTriangle,
  TypedRectangle,
  QuadTree
} from '@allmaps/types'

import type { GeneralGcp, RefinementOptions } from './types.js'

// Note:
// The concepts of 'source' and 'destination' for refinement methods
// might differ from those in transform methods that called them.
// For forward transform methods, 'source' and 'destination' in the refinement context
// are the same as in their original transform context.
// For backward transform methods, they are inversed.
// Hence, in the refinement contect we always act source > destination.
// See the way refinement methods are called:
// with a different refinementFunction and refinementOptions for the forward and backward case.

export const defaultRefinementOptions: RefinementOptions = {
  maxOffsetRatio: 0,
  maxDepth: 0,
  minOffsetDistance: Infinity,
  minLineDistance: Infinity,
  sourceMidPointFunction: midPoint,
  destinationMidPointFunction: midPoint,
  destinationDistanceFunction: distance,
  returnDomain: 'destination'
}

// Refine

export function refineLineString(
  lineString: LineString,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): LineString {
  lineString = conformLineString(lineString)
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  const gcps: GeneralGcp[] = lineString.map((point) => ({
    source: point,
    destination: refinementFunction(point)
  }))
  const gcpLines = gcpsToGcpLines(gcps, false)
  const refinedGcpLines = gcpLines
    .map((gcpLine) =>
      splitGcpLineRecursively(gcpLine, refinementFunction, refinementOptions, 0)
    )
    .flat(1)

  return gcpLinesToGcps(refinedGcpLines, true).map((gcp) =>
    refinementOptions.returnDomain == 'destination'
      ? gcp.destination
      : gcp.source
  )
}

export function refineRing(
  ring: Ring,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): Ring {
  ring = conformRing(ring)
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  const gcps: GeneralGcp[] = ring.map((point) => ({
    source: point,
    destination: refinementFunction(point)
  }))
  const gcpLines = gcpsToGcpLines(gcps, true)
  const refinedGcpLines = gcpLines
    .map((line) =>
      splitGcpLineRecursively(line, refinementFunction, refinementOptions, 0)
    )
    .flat(1)

  return gcpLinesToGcps(refinedGcpLines, false).map((gcp) =>
    refinementOptions.returnDomain == 'destination'
      ? gcp.destination
      : gcp.source
  )
}

export function refineRectangleToRectangles(
  rectangle: Rectangle,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): Rectangle[] {
  // not conforming because happens in next function
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  const gcpQuadTree = refineRectangleToGcpQuadTree(
    rectangle,
    refinementFunction,
    partialRefinementOptions
  )

  const rectangles: Rectangle[] = []
  forEachQuadTreeRecursively(
    gcpQuadTree,
    () => {},
    (rectangle) => {
      rectangles.push(
        rectangle.map((gcp) =>
          refinementOptions.returnDomain == 'destination'
            ? gcp.destination
            : gcp.source
        ) as Rectangle
      )
    }
  )

  return rectangles
}

export function refineRectangleToGcpQuadTree(
  rectangle: Rectangle,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): QuadTree<GeneralGcp> {
  rectangle = conformRing(rectangle) as Rectangle
  // Not treating partialRefinementOptions because happens in next function

  const gcpQuadTree = rectangleToGcpQuadTree(rectangle, (point) => ({
    source: point,
    destination: refinementFunction(point)
  }))

  return refineGcpQuadTree(
    gcpQuadTree,
    refinementFunction,
    partialRefinementOptions
  )
}

export function refineGcpQuadTree(
  gcpQuadTree: QuadTree<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): QuadTree<GeneralGcp> {
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  return refineGcpQuadTreeRecursively(
    gcpQuadTree,
    refinementFunction,
    refinementOptions,
    0
  )
}

// Recursively

function splitGcpLineRecursively(
  gcpLine: TypedLine<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  refinementOptions: RefinementOptions,
  depth: number
): TypedLine<GeneralGcp>[] {
  if (depth >= refinementOptions.maxDepth || refinementOptions.maxDepth <= 0) {
    return [gcpLine]
  }

  const sourceMidPoint = refinementOptions.sourceMidPointFunction(
    gcpLine[0].source,
    gcpLine[1].source
  )
  const destinationMidPoint = refinementOptions.destinationMidPointFunction(
    gcpLine[0].destination,
    gcpLine[1].destination
  )
  const destinationMidPointFromRefinementFunction =
    refinementFunction(sourceMidPoint)

  const destinationLineDistance = refinementOptions.destinationDistanceFunction(
    gcpLine[0].destination,
    gcpLine[1].destination
  )
  const destinationRefinedLineDistance =
    refinementOptions.destinationDistanceFunction(
      refinementFunction(gcpLine[0].source),
      refinementFunction(gcpLine[1].source)
    )
  const destinationMidPointsDistance =
    refinementOptions.destinationDistanceFunction(
      destinationMidPoint,
      destinationMidPointFromRefinementFunction
    )

  if (
    destinationMidPointsDistance / destinationLineDistance >
      refinementOptions.maxOffsetRatio &&
    destinationMidPointsDistance < refinementOptions.minOffsetDistance &&
    destinationRefinedLineDistance < refinementOptions.minLineDistance
    // destinationLineDistance > 0 // Todo: can this line be removed?
  ) {
    const newMidGcp: GeneralGcp = {
      source: sourceMidPoint,
      destination: destinationMidPointFromRefinementFunction
    }

    return [
      splitGcpLineRecursively(
        [gcpLine[0], newMidGcp],
        refinementFunction,
        refinementOptions,
        depth + 1
      ),
      splitGcpLineRecursively(
        [newMidGcp, gcpLine[1]],
        refinementFunction,
        refinementOptions,
        depth + 1
      )
    ].flat(1)
  } else {
    return [gcpLine]
  }
}

export function refineGcpQuadTreeRecursively(
  gcpQuadTree: QuadTree<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  refinementOptions: RefinementOptions,
  depth: number
): QuadTree<GeneralGcp> {
  if (depth >= refinementOptions.maxDepth || refinementOptions.maxDepth <= 0) {
    return gcpQuadTree
  }

  const gcpLine = [gcpQuadTree.tr, gcpQuadTree.bl] as TypedLine<GeneralGcp>
  const refinedGcpLines = splitGcpLineRecursively(
    gcpLine,
    refinementFunction,
    { ...refinementOptions, maxDepth: 1 },
    0
  )

  if (refinedGcpLines.length > 1) {
    gcpQuadTree.cc = refinedGcpLines[0][1]

    const sourceTcPoint = refinementOptions.sourceMidPointFunction(
      gcpQuadTree.tl.source,
      gcpQuadTree.tr.source
    )
    gcpQuadTree.tc = {
      source: sourceTcPoint,
      destination: refinementFunction(sourceTcPoint)
    }
    const sourceCrPoint = refinementOptions.sourceMidPointFunction(
      gcpQuadTree.tr.source,
      gcpQuadTree.br.source
    )
    gcpQuadTree.cr = {
      source: sourceCrPoint,
      destination: refinementFunction(sourceCrPoint)
    }
    const sourceBcPoint = refinementOptions.sourceMidPointFunction(
      gcpQuadTree.br.source,
      gcpQuadTree.bl.source
    )
    gcpQuadTree.bc = {
      source: sourceBcPoint,
      destination: refinementFunction(sourceBcPoint)
    }
    const sourceClPoint = refinementOptions.sourceMidPointFunction(
      gcpQuadTree.bl.source,
      gcpQuadTree.tl.source
    )
    gcpQuadTree.cl = {
      source: sourceClPoint,
      destination: refinementFunction(sourceClPoint)
    }

    gcpQuadTree.tlQuadTree = refineGcpQuadTreeRecursively(
      {
        tl: gcpQuadTree.tl,
        tr: gcpQuadTree.tc,
        br: gcpQuadTree.cc,
        bl: gcpQuadTree.cl
      },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
    gcpQuadTree.trQuadTree = refineGcpQuadTreeRecursively(
      {
        tl: gcpQuadTree.tc,
        tr: gcpQuadTree.tr,
        br: gcpQuadTree.cr,
        bl: gcpQuadTree.cc
      },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
    gcpQuadTree.brQuadTree = refineGcpQuadTreeRecursively(
      {
        tl: gcpQuadTree.cc,
        tr: gcpQuadTree.cr,
        br: gcpQuadTree.br,
        bl: gcpQuadTree.bc
      },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
    gcpQuadTree.blQuadTree = refineGcpQuadTreeRecursively(
      {
        tl: gcpQuadTree.cl,
        tr: gcpQuadTree.cc,
        br: gcpQuadTree.bc,
        bl: gcpQuadTree.bl
      },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
  }

  return gcpQuadTree
}

// QuadTree functions

export function mapQuadTreeRecursively<P0, P1>(
  quadTree: QuadTree<P0>,
  mapFunction: (p0: P0) => P1,
  cornerGcpsFromParent?: QuadTree<P1>
): QuadTree<P1> {
  const newQuadTree: QuadTree<P1> = {
    tl: cornerGcpsFromParent
      ? cornerGcpsFromParent.tl
      : mapFunction(quadTree.tl),
    tr: cornerGcpsFromParent
      ? cornerGcpsFromParent.tr
      : mapFunction(quadTree.tr),
    br: cornerGcpsFromParent
      ? cornerGcpsFromParent.br
      : mapFunction(quadTree.br),
    bl: cornerGcpsFromParent
      ? cornerGcpsFromParent.bl
      : mapFunction(quadTree.bl)
  }

  if (quadTree.cc) newQuadTree.cc = mapFunction(quadTree.cc)
  if (quadTree.tc) newQuadTree.tc = mapFunction(quadTree.tc)
  if (quadTree.cr) newQuadTree.cr = mapFunction(quadTree.cr)
  if (quadTree.bc) newQuadTree.bc = mapFunction(quadTree.bc)
  if (quadTree.cl) newQuadTree.cl = mapFunction(quadTree.cl)

  if (
    newQuadTree.cc &&
    newQuadTree.tc &&
    newQuadTree.cr &&
    newQuadTree.bc &&
    newQuadTree.cl
  ) {
    if (quadTree.tlQuadTree)
      newQuadTree.tlQuadTree = mapQuadTreeRecursively<P0, P1>(
        quadTree.tlQuadTree,
        mapFunction,
        {
          tl: newQuadTree.tl,
          tr: newQuadTree.tc,
          br: newQuadTree.cc,
          bl: newQuadTree.cl
        }
      )
    if (quadTree.trQuadTree)
      newQuadTree.trQuadTree = mapQuadTreeRecursively<P0, P1>(
        quadTree.trQuadTree,
        mapFunction,
        {
          tl: newQuadTree.tc,
          tr: newQuadTree.tr,
          br: newQuadTree.cr,
          bl: newQuadTree.cc
        }
      )
    if (quadTree.brQuadTree)
      newQuadTree.brQuadTree = mapQuadTreeRecursively<P0, P1>(
        quadTree.brQuadTree,
        mapFunction,
        {
          tl: newQuadTree.cc,
          tr: newQuadTree.cr,
          br: newQuadTree.br,
          bl: newQuadTree.bc
        }
      )
    if (quadTree.blQuadTree)
      newQuadTree.blQuadTree = mapQuadTreeRecursively<P0, P1>(
        quadTree.blQuadTree,
        mapFunction,
        {
          tl: newQuadTree.cl,
          tr: newQuadTree.cc,
          br: newQuadTree.bc,
          bl: newQuadTree.bl
        }
      )
  }

  return newQuadTree
}

export function forEachQuadTreeRecursively<P>(
  quadTree: QuadTree<P>,
  forEachFunction: (p: P) => void,
  rectangleForEachFunction: (rectangle: TypedRectangle<P>) => void,
  onlyLeaves = true,
  alsoOuter = true
): void {
  if (alsoOuter) {
    forEachFunction(quadTree.tl)
    forEachFunction(quadTree.tr)
    forEachFunction(quadTree.br)
    forEachFunction(quadTree.bl)
  }

  if (quadTree.cc) forEachFunction(quadTree.cc)
  if (quadTree.tc) forEachFunction(quadTree.tc)
  if (quadTree.cr) forEachFunction(quadTree.cr)
  if (quadTree.bc) forEachFunction(quadTree.bc)
  if (quadTree.cl) forEachFunction(quadTree.cl)

  if (
    !onlyLeaves ||
    (!quadTree.tlQuadTree &&
      !quadTree.trQuadTree &&
      !quadTree.brQuadTree &&
      !quadTree.blQuadTree)
  ) {
    rectangleForEachFunction(gcpQuadTreeToTypedRectangle<P>(quadTree))
  }

  if (quadTree.tlQuadTree)
    forEachQuadTreeRecursively(
      quadTree.tlQuadTree,
      forEachFunction,
      rectangleForEachFunction,
      onlyLeaves,
      !onlyLeaves
    )
  if (quadTree.trQuadTree)
    forEachQuadTreeRecursively(
      quadTree.trQuadTree,
      forEachFunction,
      rectangleForEachFunction,
      onlyLeaves,
      !onlyLeaves
    )
  if (quadTree.brQuadTree)
    forEachQuadTreeRecursively(
      quadTree.brQuadTree,
      forEachFunction,
      rectangleForEachFunction,
      onlyLeaves,
      !onlyLeaves
    )
  if (quadTree.blQuadTree)
    forEachQuadTreeRecursively(
      quadTree.blQuadTree,
      forEachFunction,
      rectangleForEachFunction,
      onlyLeaves,
      !onlyLeaves
    )
}

export function mixQuadTreesRecursively<P0, P1, P2>(
  quadTree0: QuadTree<P0>,
  quadTree1: QuadTree<P1>,
  mixFunction: (p0: P0, p1: P1) => P2,
  cornerGcpsFromParent?: QuadTree<P2>
): QuadTree<P2> {
  const newQuadTree: QuadTree<P2> = {
    tl: cornerGcpsFromParent
      ? cornerGcpsFromParent.tl
      : mixFunction(quadTree0.tl, quadTree1.tl),
    tr: cornerGcpsFromParent
      ? cornerGcpsFromParent.tr
      : mixFunction(quadTree0.tr, quadTree1.tr),
    br: cornerGcpsFromParent
      ? cornerGcpsFromParent.br
      : mixFunction(quadTree0.br, quadTree1.br),
    bl: cornerGcpsFromParent
      ? cornerGcpsFromParent.bl
      : mixFunction(quadTree0.bl, quadTree1.bl)
  }

  if (quadTree0.cc && quadTree1.cc)
    newQuadTree.cc = mixFunction(quadTree0.cc, quadTree1.cc)
  if (quadTree0.tc && quadTree1.tc)
    newQuadTree.tc = mixFunction(quadTree0.tc, quadTree1.tc)
  if (quadTree0.cr && quadTree1.cr)
    newQuadTree.cr = mixFunction(quadTree0.cr, quadTree1.cr)
  if (quadTree0.bc && quadTree1.bc)
    newQuadTree.bc = mixFunction(quadTree0.bc, quadTree1.bc)
  if (quadTree0.cl && quadTree1.cl)
    newQuadTree.cl = mixFunction(quadTree0.cl, quadTree1.cl)

  if (
    newQuadTree.cc &&
    newQuadTree.tc &&
    newQuadTree.cr &&
    newQuadTree.bc &&
    newQuadTree.cl
  ) {
    if (quadTree0.tlQuadTree && quadTree1.tlQuadTree)
      newQuadTree.tlQuadTree = mixQuadTreesRecursively<P0, P1, P2>(
        quadTree0.tlQuadTree,
        quadTree1.tlQuadTree,
        mixFunction,
        {
          tl: newQuadTree.tl,
          tr: newQuadTree.tc,
          br: newQuadTree.cc,
          bl: newQuadTree.cl
        }
      )
    if (quadTree0.trQuadTree && quadTree1.trQuadTree)
      newQuadTree.trQuadTree = mixQuadTreesRecursively<P0, P1, P2>(
        quadTree0.trQuadTree,
        quadTree1.trQuadTree,
        mixFunction,
        {
          tl: newQuadTree.tc,
          tr: newQuadTree.tr,
          br: newQuadTree.cr,
          bl: newQuadTree.cc
        }
      )
    if (quadTree0.brQuadTree && quadTree1.brQuadTree)
      newQuadTree.brQuadTree = mixQuadTreesRecursively<P0, P1, P2>(
        quadTree0.brQuadTree,
        quadTree1.brQuadTree,
        mixFunction,
        {
          tl: newQuadTree.cc,
          tr: newQuadTree.cr,
          br: newQuadTree.br,
          bl: newQuadTree.bc
        }
      )
    if (quadTree0.blQuadTree && quadTree1.blQuadTree)
      newQuadTree.blQuadTree = mixQuadTreesRecursively<P0, P1, P2>(
        quadTree0.blQuadTree,
        quadTree1.blQuadTree,
        mixFunction,
        {
          tl: newQuadTree.cl,
          tr: newQuadTree.cc,
          br: newQuadTree.bc,
          bl: newQuadTree.bl
        }
      )
  }
  return newQuadTree
}

export function getQuadTreeTriangles<P>(
  quadTree: QuadTree<P>,
  onlyLeaves = true,
  alsoOuter = true
): TypedTriangle<P>[] {
  const triangles: TypedTriangle<P>[] = []
  forEachQuadTreeRecursively(
    quadTree,
    () => {},
    (typedRectangle) => {
      triangles.push(
        ...[
          [
            typedRectangle[0],
            typedRectangle[1],
            typedRectangle[3]
          ] as TypedTriangle<P>,
          [
            typedRectangle[1],
            typedRectangle[2],
            typedRectangle[3]
          ] as TypedTriangle<P>
        ]
      )
    },
    onlyLeaves,
    alsoOuter
  )
  return triangles
}

// Convert

export function generalGcpToGcpForForward(generalGcp: GeneralGcp): Gcp {
  return { resource: generalGcp.source, geo: generalGcp.destination }
}

export function generalGcpToGcpForBackward(generalGcp: GeneralGcp): Gcp {
  return { resource: generalGcp.destination, geo: generalGcp.source }
}

export function gcpsToGcpLines(
  gcps: GeneralGcp[],
  close = false
): TypedLine<GeneralGcp>[] {
  const lineCount = gcps.length - (close ? 0 : 1)

  const lines: TypedLine<GeneralGcp>[] = []
  for (let index = 0; index < lineCount; index++) {
    lines.push([gcps[index], gcps[(index + 1) % gcps.length]])
  }

  return lines
}

export function gcpLinesToGcps(
  lines: TypedLine<GeneralGcp>[],
  close = false
): GeneralGcp[] {
  const gcps = lines.map((line) => line[0])
  if (close) {
    gcps.push(lines[lines.length - 1][1])
  }
  return gcps
}

export function rectangleToGcpQuadTree(
  rectangle: Rectangle,
  pointToGcp: (point: Point) => GeneralGcp
): QuadTree<GeneralGcp> {
  return {
    tl: pointToGcp(rectangle[0]),
    tr: pointToGcp(rectangle[1]),
    br: pointToGcp(rectangle[2]),
    bl: pointToGcp(rectangle[3])
  }
}

export function gcpQuadTreeToTypedRectangle<P>(
  gcpQuadTree: QuadTree<P>
): TypedRectangle<P> {
  return [gcpQuadTree.tl, gcpQuadTree.tr, gcpQuadTree.br, gcpQuadTree.bl]
}
