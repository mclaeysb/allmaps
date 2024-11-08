import type {
  Bbox,
  ColsRows,
  Point,
  TypedGrid,
  TypedTriangle
} from '@allmaps/types'
import { computeBbox } from './bbox'

export function getTypedGridColsRows<P>(typedGrid: TypedGrid<P>): ColsRows {
  return { rows: typedGrid.length - 1, cols: typedGrid[0].length - 1 }
}

export function getTypedGridDepth<P>(typedGrid: TypedGrid<P>): number {
  return getDepthFromColsRows(getTypedGridColsRows(typedGrid))
}

export function getDepthFromColsRows({ cols, rows }: ColsRows): number {
  return Math.round(Math.log2(Math.max(cols, rows)))
}

export function getColsOrRowsFromDepth(depth: number): number {
  return Math.pow(2, Math.round(depth))
}

export function computeBboxTypedGrid<P>(
  typedGrid: TypedGrid<P>,
  pToPoint: (p: P) => Point
): Bbox {
  const sourcePointNE = pToPoint(typedGrid[0][0])
  const sourcePointNW = pToPoint(typedGrid[0][typedGrid[0].length - 1])
  const sourcePointSE = pToPoint(typedGrid[typedGrid.length - 1][0])
  const sourcePointSW = pToPoint(
    typedGrid[typedGrid.length - 1][typedGrid[typedGrid.length - 1].length - 1]
  )

  return computeBbox([
    sourcePointNE,
    sourcePointNW,
    sourcePointSE,
    sourcePointSW
  ])
}

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
  return typedGrid.map((pRow) => pRow.map(mapFunction))
}

export function getTypedGridTriangles<P>(
  grid: TypedGrid<P>
): TypedTriangle<P>[] {
  const triangles: TypedTriangle<P>[] = []
  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < grid[i].length - 1; j++) {
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
