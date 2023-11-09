import type { Point, Size } from './geometry'

export type XYZTile = {
  z: number
  x: number
  y: number
}

export type PointByX = { [key: number]: Point }

export type Tile = {
  column: number
  row: number
  zoomLevel: TileZoomLevel
  imageSize: Size
}

export type NeededTile = {
  mapId: string
  tile: Tile
  imageRequest: ImageRequest
  url: string
}

export type StoredTile = Omit<NeededTile, 'mapId'>

export type ImageRequest = {
  region?: Region
  size?: SizeObject
}

export type SizeObject = {
  width: number
  height: number
}

export type Region = {
  x: number
  y: number
  width: number
  height: number
}

export type TileZoomLevel = {
  scaleFactor: number
  width: number
  height: number
  originalWidth: number
  originalHeight: number
  columns: number
  rows: number
}