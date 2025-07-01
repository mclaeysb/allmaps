<script lang="ts">
  import { parseAnnotation } from '@allmaps/annotation'

  import GeoreferencedMaps from './GeoreferencedMaps.svelte'
  import MapsOverview from './MapsOverview.svelte'
  import MapOrImage from './MapOrImage.svelte'
  import MapsList from './MapsList.svelte'

  import type { GeoreferencedMap } from '@allmaps/annotation'

  import type { GeoreferencedMapsComponentOptions } from './GeoreferencedMaps.svelte'
  import OptionsButton from './OptionsButton.svelte'

  let {
    annotations = [],
    options = {
      addNavigationControl: true,
      addGeolocateControl: true,
      opacity: 1,
      visible: true
    }
  }: {
    annotations: unknown[]
    options?: Partial<GeoreferencedMapsComponentOptions>
  } = $props()

  let selectedMapId: string | undefined = $state(undefined)
  let mapOrImage: 'map' | 'image' = $state('map')

  let georeferencedMaps: GeoreferencedMap[] = $derived(
    annotations.reduce(
      (georeferencedMaps: GeoreferencedMap[], annotation) => [
        ...georeferencedMaps,
        ...parseAnnotation(annotation)
      ],
      []
    )
  )
</script>

<div class="w-full h-full">
  <GeoreferencedMaps
    {georeferencedMaps}
    {options}
    {selectedMapId}
    {mapOrImage}
  />
</div>

<div class="absolute z-50 top-0 w-full p-2 grid grid-cols-3">
  <div class="flex justify-start"></div>
  <div class="flex justify-center"></div>
  <div class="flex justify-end">
    <MapOrImage bind:mapOrImage disabled={selectedMapId === undefined} />
  </div>
</div>
<div class="absolute z-50 bottom-0 w-full p-2 grid grid-cols-3">
  <div class="flex justify-start">
    <OptionsButton bind:options />
  </div>
  <div class="flex justify-center">
    <MapsOverview
      {georeferencedMaps}
      bind:selectedMapId
      {annotations}
      {mapOrImage}
    />
  </div>
  <div class="flex justify-end"></div>
</div>

<!--
<div class="absolute z-50 top-0 w-full h-full flex justify-center items-center">
  <MapsList {annotations} {selectedMapId} />
</div> -->
