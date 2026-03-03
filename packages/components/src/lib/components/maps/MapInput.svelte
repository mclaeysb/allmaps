<script lang="ts">
  import AnnotationInput from './AnnotationInput.svelte'

  let {
    annotations = $bindable([])
  }: {
    annotations: unknown[]
  } = $props()

  type Entry = { id: number; data: unknown | null }

  let nextId = $state(0)
  let entries = $state<Entry[]>([{ id: nextId++, data: null }])

  function addEntry() {
    entries = [...entries, { id: nextId++, data: null }]
  }

  function removeEntry(id: number) {
    entries = entries.filter((e) => e.id !== id)
    syncAnnotations()
  }

  function setData(id: number, data: unknown) {
    entries = entries.map((e) => (e.id === id ? { ...e, data } : e))
    syncAnnotations()
  }

  function clearData(id: number) {
    entries = entries.map((e) => (e.id === id ? { ...e, data: null } : e))
    syncAnnotations()
  }

  function syncAnnotations() {
    annotations = entries.map((e) => e.data).filter((d) => d !== null)
  }

  $inspect(annotations)
</script>

<div class="flex flex-col gap-2">
  {#each entries as entry, i (entry.id)}
    <AnnotationInput
      ondata={(data) => setData(entry.id, data)}
      onclear={() => clearData(entry.id)}
      onAdd={addEntry}
      onRemove={() => removeEntry(entry.id)}
      showAdd={i === entries.length - 1}
      disableRemove={entries.length === 1}
      focusOnMount={i === entries.length - 1}
    />
  {/each}
</div>
