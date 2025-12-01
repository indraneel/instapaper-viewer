<script>
  let { open = false, onclose, title = '', children } = $props();

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      onclose?.();
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      onclose?.();
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="bg-stone-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-auto">
      <div class="flex justify-between items-center p-4 border-b border-stone-700">
        <h2 class="text-lg font-medium text-stone-100">{title}</h2>
        <button
          class="text-stone-400 hover:text-stone-200 text-xl leading-none"
          onclick={onclose}
        >
          &times;
        </button>
      </div>
      <div class="p-4">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
