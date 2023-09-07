import { Command } from 'commander'

import { GCPTransformer } from '@allmaps/transform'

import { parseJsonInput, printJson } from '../../lib/io.js'
import {
  parseAnnotationsValidateMaps,
  parseTransformOptions
} from '../../lib/parse.js'
import { addTransformOptions } from '../../lib/options.js'

export default function resourceMask() {
  let command = new Command('resource-mask')
    .argument('[files...]')
    .summary('transform resource masks to GeoJSON')
    .description(
      'Transform SVG resource masks of input Georeference Annotations to GeoJSON using a transformation built from the GCPs and transformation type specified in a Georeference Annotation itself.\n' +
        "This is a faster alternative for 'transform svg' where the resource mask from the Georeference Annotation specified in the arguments is also the input SVG."
    )

  command = addTransformOptions(command)

  return command.action(async (files, options) => {
    const jsonValues = await parseJsonInput(files as string[])
    const maps = parseAnnotationsValidateMaps(jsonValues)

    const features = []

    const transformOptions = parseTransformOptions(options)

    for (const map of maps) {
      if (map.gcps.length >= 3) {
        const transformer = new GCPTransformer(
          map.gcps,
          map.transformation?.type
        )
        const polygon = transformer.transformForwardRingToGeoJSONPolygon(
          map.resourceMask,
          transformOptions
        )

        features.push({
          type: 'Feature',
          properties: {
            imageId: map.resource.id
          },
          geometry: polygon
        })
      } else {
        // TODO: this can be removed because an error will be given by the transformer.
        console.error(
          'Encountered Georeference Annotation with less than 3 points'
        )
      }
    }

    const featureCollection = {
      type: 'FeatureCollection',
      features
    }

    printJson(featureCollection)
  })
}
