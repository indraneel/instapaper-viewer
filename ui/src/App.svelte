<script>
  import { onMount } from 'svelte';

  // Shared state
  let bookmarks = [];
  let filteredBookmarks = [];
  let selectedBookmark = 0;
  let selectedBookmarkId = 0;
  let textViewContent = '';
  let currentSummary = '';
  let isLoadingSummary = false;
  let groupBy = 'month';
  let filterProgress = null;
  let groups = {};
  let collapsedGroups = new Set();
  let searchTimeout;
  let searchQuery = '';
  let searchResults = [];
  let isSearching = false;
  let currentDate = undefined;
  let scrollTimeout;
  
  function calculateReadingProgress(element) {
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight - element.clientHeight;
    
    // Simply divide scrolled amount by total scrollable height
    return Math.max(0, Math.min(scrollTop / scrollHeight, 1));
  }

  function handleScroll(event) {
    const element = event.target;
    
    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Set new timeout to update progress after scroll stops
    scrollTimeout = setTimeout(() => {
      const progress = calculateReadingProgress(element);
      if (selectedBookmarkId) {
        updateReadProgress(selectedBookmarkId, progress);
      }
    }, 1000);
  }

  function getAllBookmarks() {
    if (groupBy) {
      return Object.values(groups).flat();
    }
    return bookmarks;
  }

  function handleKeydown(e) {
    const allBookmarks = getAllBookmarks();
    if (allBookmarks.length === 0) return;

    const currentIndex = allBookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);

    if (e.key === 'j') {
      const nextIndex = (currentIndex + 1) % allBookmarks.length;
      selectedBookmarkId = allBookmarks[nextIndex].bookmark_id;
      selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
    } else if (e.key === 'k') {
      const prevIndex = currentIndex - 1 < 0 ? allBookmarks.length - 1 : currentIndex - 1;
      selectedBookmarkId = allBookmarks[prevIndex].bookmark_id;
      selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
    } else if (e.key === 'l') {
      const bookmark = allBookmarks[currentIndex];
      if (bookmark.starred === '0') {
        star(selectedBookmarkId);
      } else {
        unstar(selectedBookmarkId);
      }
    } else if (e.key === 'Enter') {
      getText(selectedBookmarkId);
    } else if (e.key === 'Backspace') {
      archive(selectedBookmarkId, selectedBookmark);
    } else if (e.key === '0') {
      selectedBookmarkId = allBookmarks[0].bookmark_id;
      selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
    } else if (e.key === 'r') {
      const randomIndex = Math.floor(Math.random() * allBookmarks.length);
      selectedBookmarkId = allBookmarks[randomIndex].bookmark_id;
      selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
      getText(selectedBookmarkId);
    } else if (e.key === 's') {
      getSummary(selectedBookmarkId);
    }
  }

  async function fetchBookmarks() {
    const response = await fetch('http://localhost:3000/bookmarks');
    if (response.ok) {
      bookmarks = await response.json();
      if (bookmarks.length > 0) {
        selectedBookmarkId = bookmarks[0].bookmark_id;
      }
      groupBookmarks();
    }
  }

  function getDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.startsWith('www.') ? domain.slice(4) : domain;
    } catch (e) {
      return url;
    }
  }

  function groupBookmarks() {
    if (!groupBy) {
      groups = {};
      filteredBookmarks = [...bookmarks];
      return;
    }

    groups = {};
    let groupedBookmarks = [];

    bookmarks.forEach((bookmark) => {
      let key;
      const date = new Date(bookmark.time);

      switch (groupBy) {
        case 'day':
          key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
          break;
        case 'month':
          key = `${date.getFullYear()}-${date.getMonth() + 1}`;
          break;
        case 'year':
          key = date.getFullYear().toString();
          break;
        case 'domain':
          key = getDomain(bookmark.url);
          break;
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(bookmark);
      groupedBookmarks.push(bookmark);
    });

    filteredBookmarks = groupedBookmarks;
  }

  function filterByProgress() {
    let filtered = [...bookmarks];

    if (filterProgress) {
      filtered = filtered.filter((bookmark) => {
        const progress = bookmark.progress * 100;
        switch (filterProgress) {
          case 'unread':
            return progress === 0;
          case 'in-progress':
            return progress > 0 && progress < 100;
          case 'completed':
            return progress === 100;
          default:
            return true;
        }
      });
    }

    bookmarks = filtered;
    groupBookmarks();
  }

  function resetFilters() {
    filterProgress = null;
    groups = {};
    fetchBookmarks();
  }

  function closeSearch() {
    searchResults = [];
    searchQuery = '';
  }

  async function performSearch() {
    if (!searchQuery.trim()) return;

    isSearching = true;
    try {
      const response = await fetch(
        `http://localhost:3000/search?query=${encodeURIComponent(searchQuery)}`
      );
      if (response.ok) {
        searchResults = await response.json();
        selectedBookmark = bookmarks.findIndex(
          (b) => b.bookmark_id === searchResults[0]?.bookmark_id
        );
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      isSearching = false;
    }
  }

  async function getSummary(bookmarkId) {
    isLoadingSummary = true;
    try {
      const response = await fetch(`http://localhost:3000/summary/${bookmarkId}`);
      if (response.ok) {
        const data = await response.json();
        currentSummary = data.summary;
      }
    } catch (error) {
      console.error('Summary error:', error);
    } finally {
      isLoadingSummary = false;
    }
  }

  async function archive(id, index) {
    await fetch(`http://localhost:3000/archive?id=${id}`);
    bookmarks = bookmarks.filter((b) => b.bookmark_id !== id);
    if (selectedBookmark >= bookmarks.length) {
      selectedBookmark--;
    }
  }

  async function star(id) {
    await fetch(`http://localhost:3000/star?id=${id}`);
    bookmarks = bookmarks.map((b) => (b.bookmark_id === id ? { ...b, starred: '1' } : b));
  }

  async function unstar(id) {
    await fetch(`http://localhost:3000/unstar?id=${id}`);
    bookmarks = bookmarks.map((b) => (b.bookmark_id === id ? { ...b, starred: '0' } : b));
  }

  async function updateReadProgress(id, progress) {
    try {
      const response = await fetch(`http://localhost:3000/updateProgress?id=${id}&progress=${progress}`);
      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to update progress:', error.error);
        return;
      }
      // Update local state
      bookmarks = bookmarks.map(b => 
        b.bookmark_id === id 
          ? { ...b, progress, progress_timestamp: Math.floor(Date.now() / 1000) }
          : b
      );
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }

  async function getText(id) {
    console.log('Fetching text for bookmark ID:', id);
    try {
      const response = await fetch(`http://localhost:3000/getText?id=${id}`);
      console.log('Response status:', response.status);

      if (!response.ok) {
        console.error('Failed to fetch text:', response.statusText);
        textViewContent = 'Error fetching text';
        return;
      }

      const text = await response.text();
      console.log('Fetched text length:', text.length);
      console.log('First 100 characters:', text.substring(0, 100));

      textViewContent = text;
      console.log('textViewContent set successfully');
    } catch (error) {
      console.error('Error in getText:', error);
      textViewContent = 'Error: ' + error.message;
    }
  }

  onMount(() => {
    fetchBookmarks();
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<svelte:head>
  <title>Instapaper quick view</title>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="flex flex-col h-screen">
  <!-- Menubar -->
  <div class="bg-stone-900 p-4 flex items-center gap-4 sticky top-0 z-50 border-b border-stone-700">
    <div class="flex-1 max-w-md relative">
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search articles..."
          class="w-full p-2 pr-8 bg-stone-800 text-stone-100 rounded"
          on:keydown|stopPropagation={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              performSearch();
            } else if (e.key === 'Escape') {
              closeSearch();
            }
          }}
          on:input={() => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(performSearch, 1000);
          }}
        />
        {#if searchQuery || searchResults.length > 0}
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 px-1"
            on:click={closeSearch}
          >
            ✕
          </button>
        {/if}
      </div>
      {#if isSearching}
        <div class="text-stone-400 text-sm mt-2">Searching...</div>
      {/if}
      {#if searchResults.length > 0}
        <div
          class="absolute top-full left-0 right-0 mt-1 bg-stone-900 border border-stone-700 rounded shadow-lg max-h-96 overflow-y-auto z-50"
        >
          {#each searchResults as result}
            <div
              class="cursor-pointer p-3 hover:bg-stone-700 text-stone-400 border-b border-stone-700 last:border-b-0"
              on:click={() => {
                const index = bookmarks.findIndex((b) => b.bookmark_id === result.bookmark_id);
                if (index !== -1) {
                  selectedBookmark = index;
                  selectedBookmarkId = result.bookmark_id;
                  getText(result.bookmark_id);
                  searchResults = [];
                  searchQuery = '';
                }
              }}
            >
              <div class="text-sm font-medium">{result.title}</div>
              <div class="text-xs">Similarity: {(result.similarity * 100).toFixed(1)}%</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="relative group">
      <button class="px-4 py-2 bg-stone-800 text-stone-100 rounded hover:bg-stone-700">
        Filter Progress
      </button>
      <div
        class="hidden group-hover:block absolute top-full left-0 mt-1 bg-stone-900 border border-stone-700 rounded shadow-lg z-50"
      >
        <button
          class="block w-full text-left px-4 py-2 hover:bg-stone-700 text-stone-400"
          on:click={() => {
            filterProgress = 'unread';
            filterByProgress();
          }}
        >
          Unread
        </button>
        <button
          class="block w-full text-left px-4 py-2 hover:bg-stone-700 text-stone-400"
          on:click={() => {
            filterProgress = 'in-progress';
            filterByProgress();
          }}
        >
          In Progress
        </button>
        <button
          class="block w-full text-left px-4 py-2 hover:bg-stone-700 text-stone-400"
          on:click={() => {
            filterProgress = 'completed';
            filterByProgress();
          }}
        >
          Completed
        </button>
      </div>
    </div>

    <button
      class="px-4 py-2 bg-stone-800 text-stone-100 rounded hover:bg-stone-700"
      on:click={resetFilters}
    >
      Reset
    </button>
  </div>

  <!-- Main content -->
  <div class="flex-1 flex min-h-0">
    <div class="flex-1">
      <div class="bg-stone-800 h-[calc(100vh-4rem)] overflow-auto">
        <table class="text-lg text-left table-fixed w-full">
          <tbody class="w-full">
            {#if groupBy}
              {#each Object.entries(groups) as [groupKey, groupBookmarks]}
                <!-- Group header row -->
                <tr class="text-stone-100 bg-stone-700">
                  <td
                    colspan="5"
                    class="px-4 py-2 font-medium cursor-pointer hover:bg-stone-600"
                    on:click={() => {
                      if (collapsedGroups.has(groupKey)) {
                        collapsedGroups.delete(groupKey);
                      } else {
                        collapsedGroups.add(groupKey);
                      }
                      collapsedGroups = collapsedGroups;
                    }}
                  >
                    <div class="flex items-center">
                      <span class="mr-2">{collapsedGroups.has(groupKey) ? '►' : '▼'}</span>
                      {#if groupBy === 'day'}
                        {new Date(groupKey).toLocaleDateString()}
                      {:else if groupBy === 'month'}
                        {new Date(groupKey + '-01').toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                        })}
                      {:else if groupBy === 'year'}
                        {groupKey}
                      {:else if groupBy === 'domain'}
                        {groupKey}
                      {/if}
                      <span class="text-sm text-stone-400 ml-2"
                        >({groupBookmarks.length} items)</span
                      >
                    </div>
                  </td>
                </tr>

                <!-- Bookmark rows -->
                {#if !collapsedGroups.has(groupKey)}
                  {#each groupBookmarks as bookmark, i}
                    <tr
                      id="row-{bookmark.bookmark_id}"
                      class="cursor-pointer min-w-full border-b text-stone-400 {selectedBookmarkId ===
                      bookmark.bookmark_id
                        ? 'bg-stone-600'
                        : ''}"
                      on:click={() => {
                        selectedBookmark = i;
                        selectedBookmarkId = bookmark.bookmark_id;
                        getText(bookmark.bookmark_id);
                      }}
                    >
                      <td class="w-full flex justify-between" style="min-width: 45vw  ">
                        <div class="flex flex-col gap-1 w-5/6">
                          <div class="truncate">
                            <a href={bookmark.url} target="_blank" class="hover:underline">
                              {bookmark.title || bookmark.url}
                            </a>
                          </div>
                          <div class="text-xs truncate">
                            {#if bookmark.progress_timestamp !== 0}
                              <span>
                                Last read {new Date(bookmark.progress_timestamp).getFullYear()}-
                                {new Date(bookmark.progress_timestamp).getMonth() + 1}-
                                {new Date(bookmark.progress_timestamp).getDate()} |
                              </span>
                            {/if}
                            <span class="text-xs">{bookmark.url}</span>
                          </div>
                        </div>
                        <div class="flex flex-row items-center gap-1 w-1/6">
                          <span>{Math.round(bookmark.progress * 100)}%</span>
                          <div class="flex gap-2">
                            <button
                              on:click|stopPropagation={() => archive(bookmark.bookmark_id, i)}
                            >
                              Archive
                            </button>
                            <button on:click|stopPropagation={() => getText(bookmark.bookmark_id)}>
                              ▶
                            </button>
                            <button
                              on:click|stopPropagation={() => {
                                if (bookmark.starred === '1') {
                                  unstar(bookmark.bookmark_id);
                                } else {
                                  star(bookmark.bookmark_id);
                                }
                              }}
                            >
                              {bookmark.starred === '1' ? '♥' : '♡'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  {/each}
                {/if}
              {/each}
            {:else}
              {#each bookmarks as bookmark}
                {@const dateAdded = new Date(bookmark.time)}
                {@const formattedDate = `${dateAdded.getFullYear()}-${dateAdded.getMonth() + 1}-${dateAdded.getDate()}`}
                {#if currentDate !== formattedDate}
                  {@const temp = currentDate = formattedDate}
                  <tr class="text-stone-100">
                    <td colspan="5" class="px-4 py-2">{formattedDate}</td>
                  </tr>
                {/if}
                <tr
                  id="row-{bookmark.bookmark_id}"
                  class="cursor-pointer border-b text-stone-400 {selectedBookmarkId ===
                  bookmark.bookmark_id
                    ? 'bg-stone-600'
                    : ''}"
                  on:click={() => {
                    selectedBookmark = bookmarks.indexOf(bookmark);
                    selectedBookmarkId = bookmark.bookmark_id;
                    getText(bookmark.bookmark_id);
                  }}
                >
                  <td class="w-[5%] text-center">
                    <button
                      on:click|stopPropagation={() => {
                        if (bookmark.starred === '1') {
                          unstar(bookmark.bookmark_id);
                        } else {
                          star(bookmark.bookmark_id);
                        }
                      }}
                    >
                      {bookmark.starred === '1' ? '♥' : '♡'}
                    </button>
                  </td>
                  <td class="w-[60%] max-w-0">
                    <div class="truncate">
                      <a href={bookmark.url} target="_blank" class="hover:underline">
                        {bookmark.title || bookmark.url}
                      </a>
                    </div>
                    <div class="text-xs truncate">
                      {#if bookmark.progress_timestamp !== 0}
                        <span>
                          Last read {new Date(bookmark.progress_timestamp).getFullYear()}-
                          {new Date(bookmark.progress_timestamp).getMonth() + 1}-
                          {new Date(bookmark.progress_timestamp).getDate()} |
                        </span>
                      {/if}
                      <span class="text-xs">{bookmark.url}</span>
                    </div>
                  </td>
                  <td class="w-[10%] text-center">{Math.round(bookmark.progress * 100)}%</td>
                  <td class="w-[15%] text-center">
                    <button
                      on:click|stopPropagation={() =>
                        archive(bookmark.bookmark_id, bookmarks.indexOf(bookmark))}
                    >
                      Archive
                    </button>
                  </td>
                  <td class="w-[10%] text-center">
                    <button on:click|stopPropagation={() => getText(bookmark.bookmark_id)}>
                      ▶
                    </button>
                  </td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>

    <div id="text-view-container" class="flex-1">
      <div
        id="text-view"
        class="bg-stone-800 text-stone-400 w-full h-[calc(100vh-4rem)] text-lg overflow-auto"
        on:scroll={handleScroll}
      >
        {@html textViewContent}
      </div>
    </div>

    <!-- Summary panel -->
    {#if currentSummary}
      <div class="w-64 bg-stone-900 p-4 overflow-auto">
        <h3 class="text-stone-100 mb-2">Summary</h3>
        {#if isLoadingSummary}
          <div class="text-stone-400">Loading summary...</div>
        {:else}
          <div class="text-stone-400 text-sm">{currentSummary}</div>
        {/if}
      </div>
    {/if}
  </div>
</div>
