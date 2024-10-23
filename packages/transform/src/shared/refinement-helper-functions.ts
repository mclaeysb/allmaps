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
  TypedRectangle,
  TypedGrid
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

  const gcpGrid = refineRectangleToGcpGrid(
    rectangle,
    refinementFunction,
    partialRefinementOptions
  )

  const rectangles: Rectangle[] = []
  forEachGcpGridRecursively(
    gcpGrid,
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

export function refineRectangleToGcpGrid(
  rectangle: Rectangle,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): TypedGrid<GeneralGcp> {
  rectangle = conformRing(rectangle) as Rectangle
  // Not treating partialRefinementOptions because happens in next function

  const gcpGrid = rectangleToGcpGrid(rectangle, (point) => ({
    source: point,
    destination: refinementFunction(point)
  }))

  return refineGcpGrid(gcpGrid, refinementFunction, partialRefinementOptions)
}

export function refineGcpGrid(
  gcpGrid: TypedGrid<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): TypedGrid<GeneralGcp> {
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  return refineGcpGridRecursively(
    gcpGrid,
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

export function refineGcpGridRecursively(
  gcpGrid: TypedGrid<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  refinementOptions: RefinementOptions,
  depth: number
): TypedGrid<GeneralGcp> {
  if (depth >= refinementOptions.maxDepth || refinementOptions.maxDepth <= 0) {
    return gcpGrid
  }

  const gcpLine = [gcpGrid.tr, gcpGrid.bl] as TypedLine<GeneralGcp>
  const refinedGcpLines = splitGcpLineRecursively(
    gcpLine,
    refinementFunction,
    { ...refinementOptions, maxDepth: 1 },
    0
  )

  if (refinedGcpLines.length > 1) {
    gcpGrid.cc = refinedGcpLines[0][1]

    const sourceTcPoint = refinementOptions.sourceMidPointFunction(
      gcpGrid.tl.source,
      gcpGrid.tr.source
    )
    gcpGrid.tc = {
      source: sourceTcPoint,
      destination: refinementFunction(sourceTcPoint)
    }
    const sourceCrPoint = refinementOptions.sourceMidPointFunction(
      gcpGrid.tr.source,
      gcpGrid.br.source
    )
    gcpGrid.cr = {
      source: sourceCrPoint,
      destination: refinementFunction(sourceCrPoint)
    }
    const sourceBcPoint = refinementOptions.sourceMidPointFunction(
      gcpGrid.br.source,
      gcpGrid.bl.source
    )
    gcpGrid.bc = {
      source: sourceBcPoint,
      destination: refinementFunction(sourceBcPoint)
    }
    const sourceClPoint = refinementOptions.sourceMidPointFunction(
      gcpGrid.bl.source,
      gcpGrid.tl.source
    )
    gcpGrid.cl = {
      source: sourceClPoint,
      destination: refinementFunction(sourceClPoint)
    }

    gcpGrid.tlGrid = refineGcpGridRecursively(
      { tl: gcpGrid.tl, tr: gcpGrid.tc, br: gcpGrid.cc, bl: gcpGrid.cl },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
    gcpGrid.trGrid = refineGcpGridRecursively(
      { tl: gcpGrid.tc, tr: gcpGrid.tr, br: gcpGrid.cr, bl: gcpGrid.cc },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
    gcpGrid.brGrid = refineGcpGridRecursively(
      { tl: gcpGrid.cc, tr: gcpGrid.cr, br: gcpGrid.br, bl: gcpGrid.bc },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
    gcpGrid.blGrid = refineGcpGridRecursively(
      { tl: gcpGrid.cl, tr: gcpGrid.cc, br: gcpGrid.bc, bl: gcpGrid.bl },
      refinementFunction,
      refinementOptions,
      depth + 1
    )
  }

  return gcpGrid
}

export function mapGcpGridRecursively<P0, P1>(
  gcpGrid: TypedGrid<P0>,
  gcpMapFunction: (p0: P0) => P1,
  cornerGcpsFromParent?: TypedGrid<P1>
): TypedGrid<P1> {
  const newGcpGrid: TypedGrid<P1> = {
    tl: cornerGcpsFromParent
      ? cornerGcpsFromParent.tl
      : gcpMapFunction(gcpGrid.tl),
    tr: cornerGcpsFromParent
      ? cornerGcpsFromParent.tr
      : gcpMapFunction(gcpGrid.tr),
    br: cornerGcpsFromParent
      ? cornerGcpsFromParent.br
      : gcpMapFunction(gcpGrid.br),
    bl: cornerGcpsFromParent
      ? cornerGcpsFromParent.bl
      : gcpMapFunction(gcpGrid.bl)
  }

  if (gcpGrid.cc) newGcpGrid.cc = gcpMapFunction(gcpGrid.cc)
  if (gcpGrid.tc) newGcpGrid.tc = gcpMapFunction(gcpGrid.tc)
  if (gcpGrid.cr) newGcpGrid.cr = gcpMapFunction(gcpGrid.cr)
  if (gcpGrid.bc) newGcpGrid.bc = gcpMapFunction(gcpGrid.bc)
  if (gcpGrid.cl) newGcpGrid.cl = gcpMapFunction(gcpGrid.cl)

  if (
    newGcpGrid.cc &&
    newGcpGrid.tc &&
    newGcpGrid.cr &&
    newGcpGrid.bc &&
    newGcpGrid.cl
  ) {
    if (gcpGrid.tlGrid)
      newGcpGrid.tlGrid = mapGcpGridRecursively<P0, P1>(
        gcpGrid.tlGrid,
        gcpMapFunction,
        {
          tl: newGcpGrid.tl,
          tr: newGcpGrid.tc,
          br: newGcpGrid.cc,
          bl: newGcpGrid.cl
        }
      )
    if (gcpGrid.trGrid)
      newGcpGrid.trGrid = mapGcpGridRecursively<P0, P1>(
        gcpGrid.trGrid,
        gcpMapFunction,
        {
          tl: newGcpGrid.tc,
          tr: newGcpGrid.tr,
          br: newGcpGrid.cr,
          bl: newGcpGrid.cc
        }
      )
    if (gcpGrid.brGrid)
      newGcpGrid.brGrid = mapGcpGridRecursively<P0, P1>(
        gcpGrid.brGrid,
        gcpMapFunction,
        {
          tl: newGcpGrid.cc,
          tr: newGcpGrid.cr,
          br: newGcpGrid.br,
          bl: newGcpGrid.bc
        }
      )
    if (gcpGrid.blGrid)
      newGcpGrid.blGrid = mapGcpGridRecursively<P0, P1>(
        gcpGrid.blGrid,
        gcpMapFunction,
        {
          tl: newGcpGrid.cl,
          tr: newGcpGrid.cc,
          br: newGcpGrid.bc,
          bl: newGcpGrid.bl
        }
      )
  }

  return newGcpGrid
}

export function forEachGcpGridRecursively<P>(
  gcpGrid: TypedGrid<P>,
  gcpForEachFunction: (p: P) => void,
  gcpRectangleForEachFunction: (typedRectangle: TypedRectangle<P>) => void,
  onlyFinest = true,
  doOuter = true
): void {
  if (doOuter) {
    gcpForEachFunction(gcpGrid.tl)
    gcpForEachFunction(gcpGrid.tr)
    gcpForEachFunction(gcpGrid.br)
    gcpForEachFunction(gcpGrid.bl)
  }

  if (gcpGrid.cc) gcpForEachFunction(gcpGrid.cc)
  if (gcpGrid.tc) gcpForEachFunction(gcpGrid.tc)
  if (gcpGrid.cr) gcpForEachFunction(gcpGrid.cr)
  if (gcpGrid.bc) gcpForEachFunction(gcpGrid.bc)
  if (gcpGrid.cl) gcpForEachFunction(gcpGrid.cl)

  if (
    !onlyFinest ||
    (!gcpGrid.tlGrid && !gcpGrid.trGrid && !gcpGrid.brGrid && !gcpGrid.blGrid)
  ) {
    gcpRectangleForEachFunction(gcpGridToGcpRectangle<P>(gcpGrid))
  }

  if (gcpGrid.tlGrid)
    forEachGcpGridRecursively(
      gcpGrid.tlGrid,
      gcpForEachFunction,
      gcpRectangleForEachFunction,
      onlyFinest,
      !onlyFinest
    )
  if (gcpGrid.trGrid)
    forEachGcpGridRecursively(
      gcpGrid.trGrid,
      gcpForEachFunction,
      gcpRectangleForEachFunction,
      onlyFinest,
      !onlyFinest
    )
  if (gcpGrid.brGrid)
    forEachGcpGridRecursively(
      gcpGrid.brGrid,
      gcpForEachFunction,
      gcpRectangleForEachFunction,
      onlyFinest,
      !onlyFinest
    )
  if (gcpGrid.blGrid)
    forEachGcpGridRecursively(
      gcpGrid.blGrid,
      gcpForEachFunction,
      gcpRectangleForEachFunction,
      onlyFinest,
      !onlyFinest
    )
}

// Convert

export function generalGcpToGcp(generalGcp: GeneralGcp): Gcp {
  return { resource: generalGcp.source, geo: generalGcp.destination }
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

export function rectangleToGcpGrid(
  rectangle: Rectangle,
  pointToGcp: (point: Point) => GeneralGcp
): TypedGrid<GeneralGcp> {
  return {
    tl: pointToGcp(rectangle[0]),
    tr: pointToGcp(rectangle[1]),
    br: pointToGcp(rectangle[2]),
    bl: pointToGcp(rectangle[3])
  }
}

export function gcpGridToGcpRectangle<P>(
  gcpGrid: TypedGrid<P>
): TypedRectangle<P> {
  return [gcpGrid.tl, gcpGrid.tr, gcpGrid.br, gcpGrid.bl]
}
