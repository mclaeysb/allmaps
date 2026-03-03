<script lang="ts">
  import Input from '../ui/input/input.svelte'
  import Button from '../ui/button/button.svelte'
  import { Plus, Minus } from 'phosphor-svelte'
  import { untrack } from 'svelte'

  let {
    ondata,
    onclear,
    onAdd,
    onRemove,
    showAdd = false,
    disableRemove = false
  }: {
    ondata: (data: unknown) => void
    onclear: () => void
    onAdd: () => void
    onRemove: () => void
    showAdd?: boolean
    disableRemove?: boolean
  } = $props()

  let url = $state('')
  let abortController: AbortController | null = null

  $effect(() => {
    // Establish `url` as the only reactive dependency for this effect
    const trimmed = url.trim()

    // Cancel any in-flight request
    abortController?.abort()

    if (!trimmed) {
      // untrack: calling onclear() must not enroll any of the parent's
      // reactive state into THIS effect's dependency graph, which would
      // cause an effect_update_depth_exceeded cycle on mount.
      untrack(() => onclear())
      return
    }

    abortController = new AbortController()
    const signal = abortController.signal

    fetch(trimmed, { signal })
      .then((res) => res.json())
      .then((data) => {
        // Async callbacks run outside the reactive flush, but wrap in
        // untrack for consistency and safety.
        if (!signal.aborted) untrack(() => ondata(data))
      })
      .catch((err) => {
        if (err.name !== 'AbortError') untrack(() => onclear())
      })

    return () => {
      abortController?.abort()
    }
  })
</script>

<div class="flex items-center gap-2">
  <Input
    type="url"
    placeholder="Enter Georeference Annotation URL ..."
    bind:value={url}
    class="flex-1 w-80"
    onfocus={(e) => (e.target as HTMLInputElement).select()}
  />

  <Button
    variant="outline"
    size="icon"
    onclick={onRemove}
    disabled={disableRemove}
    aria-label="Remove input"
  >
    <Minus class="h-4 w-4" />
  </Button>

  {#if showAdd}
    <Button
      variant="outline"
      size="icon"
      onclick={onAdd}
      aria-label="Add input"
    >
      <Plus class="h-4 w-4" />
    </Button>
  {:else}
    <div class="h-9 w-9"></div>
  {/if}
</div>
