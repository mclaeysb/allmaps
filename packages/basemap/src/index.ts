import layers from 'protomaps-themes-base'
import mlcontour from 'maplibre-contour'
import maplibregl from 'maplibre-gl'
import { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'

export function basemapStyle():StyleSpecification {
  return {
    version: 8,
    glyphs:
      'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v3/light',
    sources: {
      protomaps: {
        type: 'vector',
        tiles: [
          'https://api.protomaps.com/tiles/v3/{z}/{x}/{y}.mvt?key=ca7652ec836f269a'
        ],
        maxzoom: 14,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>'
      }
    },
    layers: layers('protomaps', 'light')
  }
}

export function addTerrain(map: maplibregl.Map) {
  var demSource = new mlcontour.DemSource({
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    maxzoom: 13
  })
  demSource.setupMaplibre(maplibregl)
  map.on('load', () => {
    map.addSource('terrain', {
      type: 'raster-dem',
      tiles: [demSource.sharedDemProtocolUrl],
      maxzoom: 13,
      encoding: 'terrarium',
      attribution:
        "<a href='https://github.com/tilezen/joerd/tree/master'>Joerd</a>"
    })

    map.addSource('contour-source', {
      type: 'vector',
      tiles: [
        demSource.contourProtocolUrl({
          thresholds: {
            // zoom: [minor, major]
            11: [200, 1000],
            12: [100, 500],
            14: [50, 200],
            15: [20, 100]
          },
          // optional, override vector tile parameters:
          contourLayer: 'contours',
          elevationKey: 'ele',
          levelKey: 'level',
          extent: 4096,
          buffer: 1
        })
      ],
      maxzoom: 15
    })

    map.addLayer(
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          'hillshade-exaggeration': 0.6,
          'hillshade-shadow-color': '#bbb',
          'hillshade-highlight-color': 'white',
          'hillshade-accent-color': 'green'
        }
      },
      'water'
    )

    map.addLayer(
      {
        id: 'contour-lines',
        type: 'line',
        source: 'contour-source',
        'source-layer': 'contours',
        paint: {
          // level = highest index in thresholds array the elevation is a multiple of
          'line-width': ['match', ['get', 'level'], 1, 1, 0.5]
        }
      },
      'water'
    )
  })
}
