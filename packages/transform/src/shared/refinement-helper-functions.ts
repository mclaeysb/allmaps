import {
  midPoint,
  distance,
  conformLineString,
  conformRing,
  mergeOptions,
  computeBbox,
  bboxToSize
} from '@allmaps/stdlib'

import type {
  Point,
  LineString,
  Ring,
  Gcp,
  TypedLine,
  TypedTriangle,
  TypedGrid,
  TypedGridWithDepth,
  Bbox,
  Line
} from '@allmaps/types'

import type {
  GeneralGcp,
  SplitInfo,
  RefinementOptions,
  SplitLineInfo,
  GcpGridWithDepthSplitInfo
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

// Refine Geometries

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

// Refine Bbox to GcpGrid

export function refineBboxToGcpGridWithDepth(
  bbox: Bbox,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): TypedGridWithDepth<GeneralGcp> {
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  const gcpGridWithDepth = {
    depth: 0,
    grid: bboxToGcpGrid(bbox, 1, 1, refinementFunction)
  }

  return refineGcpGridWithDepth(
    gcpGridWithDepth,
    refinementFunction,
    refinementOptions
  )
}

export function refineGcpGridWithDepth(
  gcpGridWithDepth: TypedGridWithDepth<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  partialRefinementOptions: Partial<RefinementOptions>
): TypedGridWithDepth<GeneralGcp> {
  const refinementOptions = mergeOptions(
    defaultRefinementOptions,
    partialRefinementOptions
  )

  const gcpGridSplitInfo = gcpGridWithDepthSplitInfoIfshouldRefineGcpGrid(
    gcpGridWithDepth,
    refinementFunction,
    refinementOptions
  )

  console.log('gcpGridSplitInfo', gcpGridSplitInfo)

  if (gcpGridSplitInfo) {
    const { bbox, cols, rows, depth } = gcpGridSplitInfo
    const refinedGcpGrid = bboxToGcpGrid(bbox, cols, rows, refinementFunction)

    return { depth, grid: refinedGcpGrid }
  } else {
    return {
      depth: gcpGridWithDepth.depth,
      grid: mapTypedGrid(gcpGridWithDepth.grid, (generalGcp) => ({
        source: generalGcp.source,
        destination: refinementFunction(generalGcp.source)
      }))
    }
  }
}

// Should split line

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
  // debugger
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

export function mapTypedGrid<P0, P1>(
  typedGrid: TypedGrid<P0>,
  mapFunction: (p0: P0) => P1
): TypedGrid<P1> {
  console.log('mapping so recalculating!')

  return typedGrid.map((pRow) => pRow.map(mapFunction))
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

// Should refine gcp grid

export function gcpGridWithDepthSplitInfoIfshouldRefineGcpGrid(
  gcpGridWithDepth: TypedGridWithDepth<GeneralGcp>,
  refinementFunction: (p: Point) => Point,
  refinementOptions: RefinementOptions
): GcpGridWithDepthSplitInfo | undefined {
  if (
    gcpGridWithDepth.depth >= refinementOptions.maxDepth ||
    refinementOptions.maxDepth <= 0
  ) {
    return undefined
  }

  const gcpGrid = gcpGridWithDepth.grid

  const sourcePointNE = gcpGrid[0][0].source
  const sourcePointNW = gcpGrid[0][gcpGrid[0].length - 1].source
  const sourcePointSE = gcpGrid[gcpGrid.length - 1][0].source
  const sourcePointSW =
    gcpGrid[gcpGrid.length - 1][gcpGrid[gcpGrid.length - 1].length - 1].source

  const sourcePointCE = refinementOptions.sourceMidPointFunction(
    sourcePointNE,
    sourcePointSE
  )
  const sourcePointCW = refinementOptions.sourceMidPointFunction(
    sourcePointNW,
    sourcePointSW
  )
  const sourcePointNC = refinementOptions.sourceMidPointFunction(
    sourcePointNE,
    sourcePointNW
  )
  const sourcePointSC = refinementOptions.sourceMidPointFunction(
    sourcePointSE,
    sourcePointSW
  )

  const bbox = computeBbox([
    sourcePointNE,
    sourcePointNW,
    sourcePointSE,
    sourcePointSW
  ])

  const sourceHorizontalLine = [sourcePointCE, sourcePointCW] as Line
  const sourceVerticalLine = [sourcePointNC, sourcePointSC] as Line

  const sourceHorizontalLenght = distance(sourceHorizontalLine)
  const sourceVerticalLenght = distance(sourceVerticalLine)

  const sourceRefinedHorizontalLineString = refineLineString(
    sourceHorizontalLine,
    refinementFunction,
    { ...refinementOptions, returnDomain: 'source' }
  )
  const sourceRefinedVerticalLineString = refineLineString(
    sourceVerticalLine,
    refinementFunction,
    { ...refinementOptions, returnDomain: 'source' }
  )

  // TODO: used squared distance
  const sourceMinHorizontalLineLenghts = []
  for (let i = 0; i < sourceRefinedHorizontalLineString.length - 1; i++) {
    sourceMinHorizontalLineLenghts.push(
      distance(
        sourceRefinedHorizontalLineString[i],
        sourceRefinedHorizontalLineString[i + 1]
      )
    )
  }
  const sourceMinHorizontalLineLenght = Math.min(
    ...sourceMinHorizontalLineLenghts
  )
  const sourceMinVerticalLineLenghts = []
  for (let i = 0; i < sourceRefinedVerticalLineString.length - 1; i++) {
    sourceMinVerticalLineLenghts.push(
      distance(
        sourceRefinedVerticalLineString[i],
        sourceRefinedVerticalLineString[i + 1]
      )
    )
  }
  const sourceMinVerticalLineLenght = Math.min(...sourceMinVerticalLineLenghts)

  const cols = Math.round(
    sourceHorizontalLenght / sourceMinHorizontalLineLenght
  )
  const rows = Math.round(sourceVerticalLenght / sourceMinVerticalLineLenght)
  const depth = Math.round(Math.log2(Math.max(cols, rows)))

  return cols > 1 && rows > 1
    ? {
        cols,
        rows,
        bbox,
        depth
      }
    : undefined
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

export function bboxToGcpGrid(
  bbox: Bbox,
  cols = 1,
  rows = 1,
  refinementFunction: (p: Point) => Point
): TypedGrid<GeneralGcp> {
  const pointGrid = bboxToPointGrid(bbox, cols, rows)

  return mapTypedGrid(pointGrid, (point) => ({
    source: point,
    destination: refinementFunction(point)
  }))
}

export function bboxToPointGrid(
  bbox: Bbox,
  cols = 1,
  rows = 1
): TypedGrid<Point> {
  const grid: TypedGrid<Point> = []
  const size = bboxToSize(bbox)
  const stepX = size[0] / cols
  const stepY = size[1] / rows

  for (let i = 0; i <= cols; i++) {
    grid[i] = []
    for (let j = 0; j <= rows; j++) {
      grid[i].push([bbox[0] + i * stepX, bbox[1] + j * stepY] as Point)
    }
  }

  return grid
}
