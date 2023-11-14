import { Image } from '@allmaps/iiif-parser'
import { computeBbox, bboxToPolygon, distance } from '@allmaps/stdlib'
import { WarpedMapWithImageInfo } from '../WarpedMap'

import type {
  Point,
  Line,
  Ring,
  Bbox,
  Size,
  Tile,
  TileZoomLevel,
  NeededTile,
  PointByX
} from '@allmaps/types'
import type { GcpTransformer } from '@allmaps/transform'

/**
 * Scale factor sharpening: 1 = no sharpening, 2 = one level extra sharper, 4 = two levels extra sharper, ...
 */
const SCALE_FACTOR_SHARPENING = 2

function distanceTilePoint(tile: Tile, point: Point): number {
  return distance(tileCenter(tile), point)
}

export function resourcePointToTilePoint(
  tile: Tile,
  resourcePoint: Point,
  clip = true
): Point | undefined {
  const tileXMin = tile.column * tile.zoomLevel.originalWidth
  const tileYMin = tile.row * tile.zoomLevel.originalHeight

  const tileX = (resourcePoint[0] - tileXMin) / tile.zoomLevel.scaleFactor
  const tileY = (resourcePoint[1] - tileYMin) / tile.zoomLevel.scaleFactor

  if (
    !clip ||
    (resourcePoint[0] >= tileXMin &&
      resourcePoint[0] <= tileXMin + tile.zoomLevel.originalWidth &&
      resourcePoint[1] >= tileYMin &&
      resourcePoint[1] <= tileYMin + tile.zoomLevel.originalHeight &&
      resourcePoint[0] <= tile.imageSize[0] &&
      resourcePoint[1] <= tile.imageSize[1])
  ) {
    return [tileX, tileY]
  }
}

export function tileBbox(tile: Tile): Bbox {
  const tileXMin = tile.column * tile.zoomLevel.originalWidth
  const tileYMin = tile.row * tile.zoomLevel.originalHeight

  const tileXMax = Math.min(
    tileXMin + tile.zoomLevel.originalWidth,
    tile.imageSize[0]
  )
  const tileYMax = Math.min(
    tileYMin + tile.zoomLevel.originalHeight,
    tile.imageSize[1]
  )

  return [tileXMin, tileYMin, tileXMax, tileYMax]
}

export function tileCenter(tile: Tile): Point {
  const bbox = tileBbox(tile)

  return [(bbox[2] - bbox[0]) / 2 + bbox[0], (bbox[3] - bbox[1]) / 2 + bbox[1]]
}

// From:
//  https://github.com/vHawk/tiles-intersect
// See also:
//  https://www.redblobgames.com/grids/line-drawing.html
function tilesIntersect([a, b]: Line): Point[] {
  let x = Math.floor(a[0])
  let y = Math.floor(a[1])
  const endX = Math.floor(b[0])
  const endY = Math.floor(b[1])

  const points: Point[] = [[x, y]]

  if (x === endX && y === endY) {
    return points
  }

  const stepX = Math.sign(b[0] - a[0])
  const stepY = Math.sign(b[1] - a[1])

  const toX = Math.abs(a[0] - x - Math.max(0, stepX))
  const toY = Math.abs(a[1] - y - Math.max(0, stepY))

  const vX = Math.abs(a[0] - b[0])
  const vY = Math.abs(a[1] - b[1])

  let tMaxX = toX / vX
  let tMaxY = toY / vY

  const tDeltaX = 1 / vX
  const tDeltaY = 1 / vY

  while (!(x === endX && y === endY)) {
    if (tMaxX < tMaxY) {
      tMaxX = tMaxX + tDeltaX
      x = x + stepX
    } else {
      tMaxY = tMaxY + tDeltaY
      y = y + stepY
    }

    points.push([x, y])
  }

  return points
}

// TODO: once tileserver can import from stdlib, it can point to getBestTileZoomLevelForScale directly just like WebGL2Render, and this function can be removed.
export function getBestTileZoomLevel(
  image: Image,
  canvasSize: Size,
  resourceRing: Ring
): TileZoomLevel {
  const resourceBbox = computeBbox(resourceRing)

  const resourceBboxWidth = resourceBbox[2] - resourceBbox[0]
  const resourceBboxHeight = resourceBbox[3] - resourceBbox[1]

  const resourceToCanvasScaleX = resourceBboxWidth / canvasSize[0]
  const resourceToCanvasScaleY = resourceBboxHeight / canvasSize[1]
  const resourceToCanvasScale = Math.min(
    resourceToCanvasScaleX,
    resourceToCanvasScaleY
  )

  return getBestTileZoomLevelForScale(image, resourceToCanvasScale)
}

/**
 * Returns the best TileZoomLevel for a given resource-to-canvas scale.
 *
 * @export
 * @param {Image} image - A parsed IIIF Image
 * @param {number} scale - The resource-to-canvas scale, relating resource pixels to canvas pixels.
 * @returns {TileZoomLevel}
 */
export function getBestTileZoomLevelForScale(
  image: Image,
  scale: number
): TileZoomLevel {
  // Returning the TileZoomLevel with the scalefactor closest to the current scale.
  //
  // Available scaleFactors in tileZoomLevels:
  // 1---------2---------4---------8---------16
  // Math.log() of those scaleFactors
  // 0---------0.69------1.38------2.07------2.77
  //
  // Current scale of the map = 3
  // 1---------2----|----4---------8---------16
  // Math.log(3) = 1.09
  // 0------*--0.69---|--1.38------2.07------2.77
  //
  // scaleFactor = 1
  // Math.log(1) = 0
  // Math.log(3) = 1.09 (current)
  // Math.log(SCALE_FACTOR_SHARPENING) = 0.69
  // diff = abs(0 - (1.09 - 0.69)) = abs(-0.4) = 0.4
  //
  // scaleFactor = 2
  // Math.log(2) = 0.69
  // Math.log(3) = 1.09 (current)
  // Math.log(SCALE_FACTOR_SHARPENING) = 0.69
  // diff = abs(0.69 - (1.09 - 0.69)) = abs(0.29) = 0.29
  //
  // scaleFactor = 4
  // Math.log(4) = 1.38
  // Math.log(3) = 1.09 (current)
  // Math.log(SCALE_FACTOR_SHARPENING) = 0.69
  // diff = abs(1.38 - (1.09 - 0.69)) = abs(0.98) = 0.98
  //
  // => Pick scale factor 2, with minimum diff.
  // Notice how 3 lies in the middle of 2 and 4, but on the log scale log(3) lies closer to log(4) then log(2)
  // Notice how the SCALE_FACTOR_SHARPENING makes the actual current log scale for which the closest scaleFactor is searched move one factor of two sharper
  // On the schematic drawing above, this is represented with a '*', left of the '|'.
  //
  // Math reminder: log(A)-log(B)=log(A/B)

  let smallestdiffLogScaleFactor = Number.POSITIVE_INFINITY
  let bestTileZoomLevel = image.tileZoomLevels.at(-1) as TileZoomLevel

  for (const tileZoomLevel of image.tileZoomLevels) {
    const diffLogScaleFactor = Math.abs(
      Math.log(tileZoomLevel.scaleFactor) -
        (Math.log(scale) - Math.log(SCALE_FACTOR_SHARPENING))
    )
    if (diffLogScaleFactor < smallestdiffLogScaleFactor) {
      smallestdiffLogScaleFactor = diffLogScaleFactor
      bestTileZoomLevel = tileZoomLevel
    }
  }

  return bestTileZoomLevel
}

function scalePointsToTileZoomLevel(
  points: Point[],
  zoomLevel: TileZoomLevel
): Point[] {
  return points.map((point) => [
    point[0] / zoomLevel.originalWidth,
    point[1] / zoomLevel.originalHeight
  ])
}

function findNeededTilesByX(tilePixelExtent: Ring) {
  const tiles: PointByX = {}
  for (let i = 0; i < tilePixelExtent.length; i++) {
    const line: Line = [
      tilePixelExtent[i],
      tilePixelExtent[(i + 1) % tilePixelExtent.length]
    ]
    const lineTiles = tilesIntersect(line)

    lineTiles.forEach(([x, y]) => {
      if (!tiles[x]) {
        tiles[x] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
      }

      if (y < tiles[x][0]) {
        tiles[x][0] = y
      }

      if (y > tiles[x][1]) {
        tiles[x][1] = y
      }
    })
  }

  return tiles
}

function tilesByXToArray(
  zoomLevel: TileZoomLevel,
  imageSize: Size,
  tilesByX: PointByX
): Tile[] {
  const neededTiles: Tile[] = []
  for (const xKey in tilesByX) {
    const x = parseInt(xKey)

    if (x < 0 || x >= zoomLevel.columns) {
      break
    }

    const fromY = Math.max(tilesByX[x][0], 0)
    const toY = Math.min(tilesByX[x][1], zoomLevel.rows - 1)

    for (let y = fromY; y <= toY; y++) {
      neededTiles.push({
        column: x,
        row: y,
        zoomLevel,
        imageSize
      })
    }
  }

  return neededTiles
}

// TODO: move to render
export function geoBboxToResourceRing(
  transformer: GcpTransformer,
  geoBbox: Bbox
): Ring {
  // transformer is the transformer built from the (projected) Gcps. It transforms forward from resource coordinates to projected geo coordinates, and backward from (projected) geo coordinates to resource coordinates.
  // geoBbox is a Bbox (e.g. of the viewport) in (projected) geo coordinates
  // geoBboxResourceRing is a ring of this Bbox, transformed backward to resource coordinates.
  // Due to transformerOptions this in not necessarilly a 4-point ring, but can have more points.

  const geoBboxRing = bboxToPolygon(geoBbox)[0]
  const geoBboxResourceRing = transformer.transformBackward(geoBboxRing, {
    maxOffsetRatio: 0.00001,
    maxDepth: 2
  }) as Ring

  return geoBboxResourceRing
}

export function computeTilesForPolygonAndZoomLevel(
  image: Image,
  resourceRing: Ring,
  tileZoomLevel: TileZoomLevel
): Tile[] {
  const scaledResourcePolygon = scalePointsToTileZoomLevel(
    resourceRing,
    tileZoomLevel
  )

  const tilesByX = findNeededTilesByX(scaledResourcePolygon)
  const tiles = tilesByXToArray(
    tileZoomLevel,
    [image.width, image.height],
    tilesByX
  )

  // sort tiles to load tiles in order of their distance to center
  // TODO: move to new SortedFetch class
  const resourceBbox = computeBbox(resourceRing)
  const resourceCenter: Point = [
    (resourceBbox[0] + resourceBbox[2]) / 2,
    (resourceBbox[1] + resourceBbox[3]) / 2
  ]

  tiles.sort(
    (tileA, tileB) =>
      distanceTilePoint(tileA, resourceCenter) -
      distanceTilePoint(tileB, resourceCenter)
  )

  return tiles
}

export function makeNeededTile(
  tile: Tile,
  warpedMap: WarpedMapWithImageInfo
): NeededTile {
  const mapId = warpedMap.mapId
  const imageRequest = warpedMap.parsedImage.getIiifTile(
    tile.zoomLevel,
    tile.column,
    tile.row
  )
  const url = warpedMap.parsedImage.getImageUrl(imageRequest)
  return {
    mapId,
    tile,
    imageRequest,
    url
  }
}
