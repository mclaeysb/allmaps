<script lang="ts">
  import type { GeoreferencedMapsComponentOptions } from './GeoreferencedMaps.svelte'

  let {
    options = $bindable()
  }: {
    options: Partial<GeoreferencedMapsComponentOptions>
  } = $props()

  let backupOpacity = options.opacity

  function onKeyDown(e: KeyboardEvent) {
    console.log('onKeyDown')
    console.log(options)
    if (e.key === 'o') {
      if (options.opacity !== 0) {
        backupOpacity = options.opacity
      }
      options.opacity = 0
    } else if (e.key === 't') {
      // transformationType = nextTransformationType
    }
    console.log(options)
  }

  function onKeyUp(e: KeyboardEvent) {
    console.log('onKeyUp')
    console.log(options)
    if (e.key === 'o') {
      options.opacity = backupOpacity
    }
    console.log(options)
  }
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />
