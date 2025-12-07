<script>
  import { onMount } from 'svelte';
  import Modal from './lib/Modal.svelte';

  // Shared state
  let bookmarks = [];
  let showShortcutsModal = false;
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
  let originalBookmarks = null;
  let scrollTimeout;
  let isMobile = false;
  let mobileListVisible = true;

  // Reader typography settings
  let fontSize = '2xl';
  let lineHeight = 'snug';
  let readerMargin = 'xl';

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
    if (e.key === '?') {
      showShortcutsModal = !showShortcutsModal;
      return;
    }

    if (showShortcutsModal) return;

    const allBookmarks = getAllBookmarks();
    if (allBookmarks.length === 0) return;

    const currentIndex = allBookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);

    if (e.shiftKey && e.key === 'J') {
      // Jump to next group
      const groupKeys = Object.keys(groups);
      if (groupKeys.length === 0) return;
      const currentGroupIndex = groupKeys.findIndex(key =>
        groups[key].some(b => b.bookmark_id === selectedBookmarkId)
      );
      const nextGroupIndex = (currentGroupIndex + 1) % groupKeys.length;
      const nextGroup = groups[groupKeys[nextGroupIndex]];
      if (nextGroup?.length > 0) {
        selectedBookmarkId = nextGroup[0].bookmark_id;
        selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
        setTimeout(() => {
          document.getElementById(`row-${selectedBookmarkId}`)?.scrollIntoView({ block: 'center' });
        }, 0);
      }
    } else if (e.shiftKey && e.key === 'K') {
      // Jump to previous group
      const groupKeys = Object.keys(groups);
      if (groupKeys.length === 0) return;
      const currentGroupIndex = groupKeys.findIndex(key =>
        groups[key].some(b => b.bookmark_id === selectedBookmarkId)
      );
      const prevGroupIndex = currentGroupIndex - 1 < 0 ? groupKeys.length - 1 : currentGroupIndex - 1;
      const prevGroup = groups[groupKeys[prevGroupIndex]];
      if (prevGroup?.length > 0) {
        selectedBookmarkId = prevGroup[0].bookmark_id;
        selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
        setTimeout(() => {
          document.getElementById(`row-${selectedBookmarkId}`)?.scrollIntoView({ block: 'center' });
        }, 0);
      }
    } else if (e.key === 'j') {
      const nextIndex = (currentIndex + 1) % allBookmarks.length;
      selectedBookmarkId = allBookmarks[nextIndex].bookmark_id;
      selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
      setTimeout(() => {
        document.getElementById(`row-${selectedBookmarkId}`)?.scrollIntoView({ block: 'nearest' });
      }, 0);
    } else if (e.key === 'k') {
      const prevIndex = currentIndex - 1 < 0 ? allBookmarks.length - 1 : currentIndex - 1;
      selectedBookmarkId = allBookmarks[prevIndex].bookmark_id;
      selectedBookmark = bookmarks.findIndex((b) => b.bookmark_id === selectedBookmarkId);
      setTimeout(() => {
        document.getElementById(`row-${selectedBookmarkId}`)?.scrollIntoView({ block: 'nearest' });
      }, 0);
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
    const response = await fetch(`${import.meta.env.VITE_API_URL}/bookmarks`);
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

  // Typography control functions
  const fontSizes = ['sm', 'base', 'lg', 'xl', '2xl'];
  const lineHeights = ['tight', 'snug', 'normal', 'relaxed', 'loose'];
  const marginSizes = ['sm', 'md', 'lg', 'xl'];
  const fontSizeMap = { sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem' };
  const lineHeightMap = { tight: '1.25', snug: '1.375', normal: '1.5', relaxed: '1.625', loose: '2' };
  const marginMap = { sm: '0.5rem', md: '1rem', lg: '2rem', xl: '4rem' };

  function cycleFontSize() {
    const idx = fontSizes.indexOf(fontSize);
    fontSize = fontSizes[(idx + 1) % fontSizes.length];
  }

  function cycleLineHeight() {
    const idx = lineHeights.indexOf(lineHeight);
    lineHeight = lineHeights[(idx + 1) % lineHeights.length];
  }

  function cycleMargin() {
    const idx = marginSizes.indexOf(readerMargin);
    readerMargin = marginSizes[(idx + 1) % marginSizes.length];
  }

  function closeSearch(keepSelection = false) {
    const previousSelection = selectedBookmarkId;
    searchResults = [];
    searchQuery = '';
    if (originalBookmarks) {
      bookmarks = originalBookmarks;
      originalBookmarks = null;
      groupBookmarks();
    }
    if (keepSelection && previousSelection) {
      selectedBookmarkId = previousSelection;
      setTimeout(() => {
        document.getElementById(`row-${selectedBookmarkId}`)?.scrollIntoView({ block: 'center' });
      }, 0);
    }
  }

  async function performSearch() {
    if (!searchQuery.trim()) {
      // Empty query = restore full list
      if (originalBookmarks) {
        bookmarks = originalBookmarks;
        originalBookmarks = null;
        groupBookmarks();
      }
      return;
    }

    isSearching = true;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/search?query=${encodeURIComponent(searchQuery)}`
      );
      if (response.ok) {
        searchResults = await response.json();
        // Store original bookmarks for restoration
        if (!originalBookmarks) {
          originalBookmarks = [...bookmarks];
        }
        // Filter bookmarks to only those in search results, maintaining search order
        bookmarks = searchResults.map(r =>
          originalBookmarks.find(b => b.bookmark_id === r.bookmark_id)
        ).filter(Boolean);
        groupBookmarks();
        // Select first result
        if (bookmarks.length > 0) {
          selectedBookmarkId = bookmarks[0].bookmark_id;
        }
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/summary/${bookmarkId}`);
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
    await fetch(`${import.meta.env.VITE_API_URL}/archive?id=${id}`);
    bookmarks = bookmarks.filter((b) => b.bookmark_id !== id);
    if (selectedBookmark >= bookmarks.length) {
      selectedBookmark--;
    }
  }

  async function star(id) {
    await fetch(`${import.meta.env.VITE_API_URL}/star?id=${id}`);
    bookmarks = bookmarks.map((b) => (b.bookmark_id === id ? { ...b, starred: '1' } : b));
  }

  async function unstar(id) {
    await fetch(`${import.meta.env.VITE_API_URL}/unstar?id=${id}`);
    bookmarks = bookmarks.map((b) => (b.bookmark_id === id ? { ...b, starred: '0' } : b));
  }

  async function updateReadProgress(id, progress) {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/updateProgress?id=${id}&progress=${progress}`);
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
      groupBookmarks();
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }

  async function getText(id) {
    console.log('Fetching text for bookmark ID:', id);
    // Hide bottom sheet on mobile when opening article
    if (isMobile) {
      mobileListVisible = false;
    }
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/getText?id=${id}`);
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

    // Mobile detection
    const checkMobile = () => {
      isMobile = window.innerWidth < 640;
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('resize', checkMobile);
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
  <div class="bg-stone-900 p-2 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-4 sticky top-0 z-50 border-b border-stone-700">
    <div class="flex-1 min-w-[150px] sm:max-w-md relative">
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
    </div>

    <div class="relative group">
      <button class="px-2 sm:px-4 py-1 sm:py-2 text-sm sm:text-base bg-stone-800 text-stone-100 rounded hover:bg-stone-700">
        <span class="hidden sm:inline">Filter Progress</span>
        <span class="sm:hidden">Filter</span>
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
      class="px-2 sm:px-4 py-1 sm:py-2 text-sm sm:text-base bg-stone-800 text-stone-100 rounded hover:bg-stone-700"
      on:click={resetFilters}
    >
      Reset
    </button>

    <button
      class="hidden sm:block px-3 py-1.5 text-sm bg-stone-800 text-stone-100 rounded hover:bg-stone-700"
      on:click={cycleFontSize}
      title="Font size"
    >
      Aa {fontSize}
    </button>
    <button
      class="hidden sm:block px-3 py-1.5 text-sm bg-stone-800 text-stone-100 rounded hover:bg-stone-700"
      on:click={cycleLineHeight}
      title="Line height"
    >
      ↕ {lineHeight}
    </button>
    <button
      class="hidden sm:block px-3 py-1.5 text-sm bg-stone-800 text-stone-100 rounded hover:bg-stone-700"
      on:click={cycleMargin}
      title="Margin"
    >
      ⬌ {readerMargin}
    </button>
  </div>

  <!-- Main content -->
  <div class="flex-1 flex min-h-0 relative sm:flex-row flex-col-reverse">
    <!-- Bookmark list - bottom sheet on mobile, flex-1 on desktop -->
    <div class="
      fixed bottom-0 left-0 right-0 z-40 h-[70vh] rounded-t-2xl bg-stone-800
      sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:z-auto sm:h-auto sm:rounded-none
      sm:flex-1
      transition-transform duration-300 ease-out
      {isMobile && !mobileListVisible ? 'translate-y-[calc(100%-3rem)]' : 'translate-y-0'}
    ">
      <!-- Handle bar (mobile only) -->
      <button
        class="sm:hidden flex justify-center py-2 cursor-pointer bg-stone-700 rounded-t-2xl w-full"
        on:click={() => mobileListVisible = !mobileListVisible}
        aria-label={mobileListVisible ? 'Hide bookmark list' : 'Show bookmark list'}
      >
        <div class="w-12 h-1.5 bg-stone-500 rounded-full"></div>
      </button>
      <div class="bg-stone-800 h-[calc(70vh-2.5rem)] sm:h-[calc(100vh-4rem)] overflow-auto">
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
                        if (originalBookmarks) closeSearch(true);
                      }}
                    >
                      <td colspan="5" class="w-full p-2 sm:p-0">
                        <div class="flex justify-between w-full">
                          <div class="flex flex-col gap-1 flex-1 min-w-0">
                            <div class="truncate text-sm sm:text-base">
                              <a
                                href={bookmark.url}
                                target="_blank"
                                class="hover:underline"
                                on:click|stopPropagation={(e) => { if (isMobile) e.preventDefault(); }}
                              >
                                {bookmark.title || bookmark.url}
                              </a>
                            </div>
                            <div class="text-xs truncate hidden sm:block">
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
                          <div class="flex flex-row items-center gap-1 sm:w-1/6 shrink-0">
                            <span class="text-xs sm:text-base">{Math.round(bookmark.progress * 100)}%</span>
                            <div class="flex gap-2">
                              <button
                                class="hidden sm:block"
                                on:click|stopPropagation={() => archive(bookmark.bookmark_id, i)}
                              >
                                Archive
                              </button>
                              <button class="hidden sm:block" on:click|stopPropagation={() => getText(bookmark.bookmark_id)}>
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
                    if (originalBookmarks) closeSearch(true);
                  }}
                >
                  <!-- Mobile: Single cell layout -->
                  <td class="sm:hidden w-full p-2">
                    <div class="flex justify-between w-full">
                      <div class="flex flex-col gap-1 flex-1 min-w-0">
                        <div class="truncate text-sm">
                          <a
                            href={bookmark.url}
                            target="_blank"
                            class="hover:underline"
                            on:click|stopPropagation={(e) => { if (isMobile) e.preventDefault(); }}
                          >
                            {bookmark.title || bookmark.url}
                          </a>
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <span class="text-xs">{Math.round(bookmark.progress * 100)}%</span>
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
                  <!-- Desktop: Multi-column layout -->
                  <td class="hidden sm:table-cell w-[5%] text-center">
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
                  <td class="hidden sm:table-cell w-[60%] max-w-0">
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
                  <td class="hidden sm:table-cell w-[10%] text-center">{Math.round(bookmark.progress * 100)}%</td>
                  <td class="hidden sm:table-cell w-[15%] text-center">
                    <button
                      on:click|stopPropagation={() =>
                        archive(bookmark.bookmark_id, bookmarks.indexOf(bookmark))}
                    >
                      Archive
                    </button>
                  </td>
                  <td class="hidden sm:table-cell w-[10%] text-center">
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

    <!-- Article reader - full width on mobile, flex-1 on desktop -->
    <div id="text-view-container" class="w-full sm:flex-1 h-full">
      {#if selectedBookmarkId && bookmarks.length > 0}
        {@const selectedBookmarkData = bookmarks.find(b => b.bookmark_id === selectedBookmarkId)}
        {#if selectedBookmarkData}
          <div class="bg-stone-700 p-4 border-b border-stone-600">
            <div class="flex justify-between items-center">
              <div class="flex flex-col gap-1 w-5/6">
                <div class="truncate text-stone-100">
                  <a href={selectedBookmarkData.url} target="_blank" class="hover:underline">
                    {selectedBookmarkData.title || selectedBookmarkData.url}
                  </a>
                </div>
                <div class="text-xs truncate text-stone-400">
                  {#if selectedBookmarkData.progress_timestamp !== 0}
                    <span>
                      Last read {new Date(selectedBookmarkData.progress_timestamp).getFullYear()}-
                      {new Date(selectedBookmarkData.progress_timestamp).getMonth() + 1}-
                      {new Date(selectedBookmarkData.progress_timestamp).getDate()} |
                    </span>
                  {/if}
                  <span class="text-xs">{selectedBookmarkData.url}</span>
                </div>
              </div>
              <div class="flex flex-row items-center gap-1">
                <!-- Close button (mobile only) -->
                {#if isMobile}
                  <button
                    class="text-stone-400 hover:text-stone-200 mr-2"
                    on:click={() => {
                      textViewContent = '';
                      mobileListVisible = true;
                    }}
                    aria-label="Close article"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                {/if}
                <span class="text-stone-400 hidden sm:inline">{Math.round(selectedBookmarkData.progress * 100)}%</span>
                <div class="flex gap-2">
                  <button
                    class="text-stone-400 hover:text-stone-200 hidden sm:block"
                    on:click={() => archive(selectedBookmarkData.bookmark_id, selectedBookmark)}
                  >
                    Archive
                  </button>
                  <button
                    class="text-stone-400 hover:text-stone-200"
                    on:click={() => getText(selectedBookmarkData.bookmark_id)}
                  >
                    ▶
                  </button>
                  <button
                    class="text-stone-400 hover:text-stone-200"
                    on:click={() => {
                      if (selectedBookmarkData.starred === '1') {
                        unstar(selectedBookmarkData.bookmark_id);
                      } else {
                        star(selectedBookmarkData.bookmark_id);
                      }
                    }}
                  >
                    {selectedBookmarkData.starred === '1' ? '♥' : '♡'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      {/if}
      <div
        id="text-view"
        class="bg-stone-800 text-stone-400 w-full h-[calc(100vh-4rem-3.5rem)] overflow-auto"
        style="font-size: {fontSizeMap[fontSize]}; line-height: {lineHeightMap[lineHeight]}; padding-left: {marginMap[readerMargin]}; padding-right: {marginMap[readerMargin]};"
        on:scroll={handleScroll}
      >
        {@html textViewContent}
      </div>
    </div>

    <!-- Summary panel -->
    {#if currentSummary}
      <!-- Desktop: Side panel -->
      <div class="hidden sm:block w-64 bg-stone-900 p-4 overflow-auto">
        <h3 class="text-stone-100 mb-2">Summary</h3>
        {#if isLoadingSummary}
          <div class="text-stone-400">Loading summary...</div>
        {:else}
          <div class="text-stone-400 text-sm">{currentSummary}</div>
        {/if}
      </div>
      <!-- Mobile: Modal overlay -->
      <div class="sm:hidden fixed inset-0 bg-black/50 z-50 flex items-end">
        <div class="bg-stone-900 w-full max-h-[60vh] overflow-auto rounded-t-2xl p-4">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-stone-100">Summary</h3>
            <button
              class="text-stone-400 hover:text-stone-200"
              on:click={() => currentSummary = ''}
              aria-label="Close summary"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          {#if isLoadingSummary}
            <div class="text-stone-400">Loading summary...</div>
          {:else}
            <div class="text-stone-400 text-sm">{currentSummary}</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<Modal open={showShortcutsModal} onclose={() => showShortcutsModal = false} title="Keyboard Shortcuts">
  <table class="w-full text-stone-300">
    <tbody>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">j</kbd></td>
        <td class="py-2">Next article</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">k</kbd></td>
        <td class="py-2">Previous article</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">Shift</kbd> + <kbd class="bg-stone-700 px-2 py-1 rounded">J</kbd></td>
        <td class="py-2">Next group</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">Shift</kbd> + <kbd class="bg-stone-700 px-2 py-1 rounded">K</kbd></td>
        <td class="py-2">Previous group</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">l</kbd></td>
        <td class="py-2">Toggle star</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">Enter</kbd></td>
        <td class="py-2">View article</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">Backspace</kbd></td>
        <td class="py-2">Archive article</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">0</kbd></td>
        <td class="py-2">Jump to first</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">r</kbd></td>
        <td class="py-2">Random article</td>
      </tr>
      <tr class="border-b border-stone-700">
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">s</kbd></td>
        <td class="py-2">Show AI summary</td>
      </tr>
      <tr>
        <td class="py-2 pr-4"><kbd class="bg-stone-700 px-2 py-1 rounded">?</kbd></td>
        <td class="py-2">Show this help</td>
      </tr>
    </tbody>
  </table>
</Modal>
