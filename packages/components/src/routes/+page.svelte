<script lang="ts">
  import Viewer from '$lib/components/Viewer.svelte'

  let componentOptions = {
    addNavigationControl: true,
    addGeolocateControl: true
  }
</script>

<div class="absolute w-full h-full flex flex-col">
  <Viewer {componentOptions} />
</div>
