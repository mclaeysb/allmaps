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
  TypedGrid,
  TypedGridWithDepth
} from '@allmaps/types'

import type {
  GeneralGcp,
  SplitInfo,
  RefinementOptions,
  SplitLineInfo
} from './types.js'

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

export function refineRectangleToGcpGrid(
  rectangle: Rectangle,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): TypedGridWithDepth<GeneralGcp> {
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
): TypedGridWithDepth<GeneralGcp> {
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
  const newMidGcp = newMidGcpIfShouldSplitGcpLine(
    gcpLine,
    refinementFunction,
    refinementOptions,
    depth
  )

  if (newMidGcp) {
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
): TypedGridWithDepth<GeneralGcp> {
  if (
    splitInfoIfShouldRefineGcpGrid(
      gcpGrid,
      refinementFunction,
      refinementOptions,
      depth
    )
  ) {
    const refinedRowsGcpGrid: GeneralGcp[][] = []
    for (let i = 0; i < gcpGrid.length; i++) {
      refinedRowsGcpGrid[i] = []
      for (let j = 0; j < gcpGrid.length - 1; j++) {
        // TODO: force split here, and only pass that option, not refinement options, as speedup
        const splitLines = splitGcpLineRecursively(
          [gcpGrid[i][j], gcpGrid[i][j + 1]],
          refinementFunction,
          { ...refinementOptions, maxDepth: 1 },
          0
        )
        refinedRowsGcpGrid[i].push(splitLines[0][0], splitLines[0][1])
      }
      refinedRowsGcpGrid[i].push(gcpGrid[i][gcpGrid[i].length - 1])
    }

    const refinedRowsAndColumnsGcpGrid: GeneralGcp[][] = []
    for (let i = 0; i < refinedRowsGcpGrid.length - 1; i++) {
      refinedRowsAndColumnsGcpGrid[2 * i] = []
      refinedRowsAndColumnsGcpGrid[2 * i + 1] = []
      for (let j = 0; j < refinedRowsGcpGrid[i].length; j++) {
        // TODO: force split here, and only pass that option, not refinement options, as speedup
        const splitLines = splitGcpLineRecursively(
          [refinedRowsGcpGrid[i][j], refinedRowsGcpGrid[i + 1][j]],
          refinementFunction,
          { ...refinementOptions, maxDepth: 1 },
          0
        )
        refinedRowsAndColumnsGcpGrid[2 * i].push(splitLines[0][0])
        refinedRowsAndColumnsGcpGrid[2 * i + 1].push(splitLines[0][1])
      }
      refinedRowsAndColumnsGcpGrid[2 * refinedRowsGcpGrid.length - 2] =
        refinedRowsGcpGrid[refinedRowsGcpGrid.length - 1]
    }

    return refineGcpGridRecursively(
      refinedRowsAndColumnsGcpGrid,
      refinementFunction,
      refinementOptions,
      depth + 1
    )
  } else {
    return { depth: depth, grid: gcpGrid }
  }
}

// Should split/refine

// This function checks if a GcpLine should be splits, and returns the new midGcp if so, or undefined otherwise
export function newMidGcpIfShouldSplitGcpLine(
  gcpLine: TypedLine<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  refinementOptions: RefinementOptions,
  depth: number
): GeneralGcp | undefined {
  if (depth >= refinementOptions.maxDepth || refinementOptions.maxDepth <= 0) {
    return undefined
  }

  const {
    sourceMidPoint,
    destinationMidPointFromRefinementFunction,
    destinationMidPointsDistance,
    destinationLineDistance,
    destinationRefinedLineDistance
  } = gcpLineSplitInfo(gcpLine, refinementFunction, refinementOptions)

  const shouldSplit = shouldSplitFromSplitInfo(
    {
      destinationMidPointsDistance,
      destinationLineDistance,
      destinationRefinedLineDistance
    },
    refinementOptions
  )

  return shouldSplit
    ? {
        source: sourceMidPoint,
        destination: destinationMidPointFromRefinementFunction
      }
    : undefined
}

export function splitInfoIfShouldRefineGcpGrid(
  gcpGrid: TypedGrid<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>,
  depth: number
): SplitInfo | undefined {
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  if (depth >= refinementOptions.maxDepth || refinementOptions.maxDepth <= 0) {
    return undefined
  }

  // TODO: make shouldSplitGcpLine and getGcpLineDistance functions so we can only get the absolute distance and store that
  // TODO: spead up by allowing to force split instead of checking every time
  // TODO: make this return distance or undefined
  let gcpGridSplitInfo = undefined
  for (let i = 0; i < gcpGrid.length - 1; i++) {
    const gcpLine = [
      gcpGrid[i][i],
      gcpGrid[i + 1][i + 1]
    ] as TypedLine<GeneralGcp>
    const splitInfo = gcpLineSplitInfo(
      gcpLine,
      refinementFunction,
      refinementOptions
    )
    const shouldSplit = shouldSplitFromSplitInfo(splitInfo, refinementOptions)
    if (!shouldSplit) {
      return undefined
    } else if (!gcpGridSplitInfo) {
      gcpGridSplitInfo = {
        destinationMidPointsDistance: splitInfo.destinationMidPointsDistance,
        destinationLineDistance: splitInfo.destinationLineDistance,
        destinationRefinedLineDistance: splitInfo.destinationRefinedLineDistance
      }
    } else {
      // TODO: compute these at the end, reconsider min/max/avg/median
      gcpGridSplitInfo = {
        destinationMidPointsDistance: Math.max(
          gcpGridSplitInfo.destinationMidPointsDistance,
          splitInfo.destinationMidPointsDistance
        ),
        destinationLineDistance: Math.max(
          gcpGridSplitInfo.destinationLineDistance,
          splitInfo.destinationLineDistance
        ),
        destinationRefinedLineDistance: Math.max(
          gcpGridSplitInfo.destinationRefinedLineDistance,
          splitInfo.destinationRefinedLineDistance
        )
      }
    }
  }

  return gcpGridSplitInfo
}

// Split info

function gcpLineSplitInfo(
  gcpLine: TypedLine<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  refinementOptions: RefinementOptions
): SplitLineInfo {
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

  return {
    sourceMidPoint,
    destinationMidPointFromRefinementFunction,
    destinationMidPointsDistance,
    destinationLineDistance,
    destinationRefinedLineDistance
  }
}

function shouldSplitFromSplitInfo(
  {
    destinationMidPointsDistance,
    destinationLineDistance,
    destinationRefinedLineDistance
  }: SplitInfo,
  refinementOptions: RefinementOptions
): boolean {
  return (
    destinationMidPointsDistance / destinationLineDistance >
      refinementOptions.maxOffsetRatio &&
    destinationMidPointsDistance < refinementOptions.minOffsetDistance &&
    destinationRefinedLineDistance < refinementOptions.minLineDistance
  )
}

// TypedGrids // TODO: move to stdlib

export function mixTypedGrids<P0, P1, P2>(
  typedGrid0: TypedGrid<P0>,
  typedGrid1: TypedGrid<P1>,
  mixFunction: (p0: P0, p1: P1) => P2
): TypedGrid<P2> {
  const mixedGrid: TypedGrid<P2> = []
  if (typedGrid0.length != typedGrid1.length) {
    throw new Error('Dimension mismatch')
  }
  for (let i = 0; i < typedGrid0.length; i++) {
    if (typedGrid0[i].length != typedGrid1[i].length) {
      throw new Error('Dimension mismatch')
    }
    mixedGrid[i] = []
    for (let j = 0; j < typedGrid0.length; i++) {
      mixedGrid[i].push(mixFunction(typedGrid0[i][j], typedGrid1[i][j]))
    }
  }
  return mixedGrid
}

export function getTypedGridTriangles<P>(
  grid: TypedGrid<P>
): TypedTriangle<P>[] {
  const triangles: TypedTriangle<P>[] = []
  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < grid.length - 1; j++) {
      triangles.push(
        ...[
          [grid[i][j], grid[i][j + 1], grid[i + 1][j]] as TypedTriangle<P>,
          [
            grid[i][j + 1],
            grid[i + 1][j],
            grid[i + 1][j + 1]
          ] as TypedTriangle<P>
        ]
      )
    }
  }
  return triangles
}

// Convert

export function generalGcpToGcpForForward(generalGcp: GeneralGcp): Gcp {
  return { resource: generalGcp.source, geo: generalGcp.destination }
}

export function generalGcpToGcpForBackward(generalGcp: GeneralGcp): Gcp {
  return { resource: generalGcp.destination, geo: generalGcp.source }
}

export function gcpToGeneralGcpForForward(gcp: Gcp): GeneralGcp {
  return { source: gcp.resource, destination: gcp.geo }
}

export function gcpToGeneralGcpForBackward(gcp: Gcp): GeneralGcp {
  return { destination: gcp.resource, source: gcp.geo }
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
  return [
    [pointToGcp(rectangle[0]), pointToGcp(rectangle[1])],
    [pointToGcp(rectangle[3]), pointToGcp(rectangle[2])]
  ]
}
