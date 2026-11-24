export { ProjectedGcpTransformer } from './projected-transformers/ProjectedGcpTransformer.js'

export {
  lonLatProjection,
  webMercatorProjection,
  defaultProjectedGcpTransformerOptions,
  defaultProjectedGcpTransformOptions,
  lonLatToWebMercator,
  webMercatorToLonLat,
  isEqualProjection,
  projectionToAntialiasedProjection,
  projectionDefinitionToAntialiasedDefinition,
  getLonLatDefinition,
  getWebMercatorDefinition
} from './shared/project-functions.js'

export {
  projectPoint,
  projectPoints,
  projectBbox
} from './shared/projection-function.js'

export type {
  ProjectionDefinition,
  Projection,
  ProjectedGcpTransformOptions,
  ProjectedGcpTransformerOptions,
  ProjectionInputs,
  InternalProjectionInputs,
  ProjectedGcpTransformerInputs
} from './shared/types.js'
