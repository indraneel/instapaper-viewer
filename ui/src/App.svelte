<script>
  import { onMount } from 'svelte';

  let bookmarks = [];
  let selectedBookmark = 0;
  let selectedBookmarkId = 0;
  let textViewContent = '';

  async function fetchBookmarks() {
    const response = await fetch('http://localhost:3000/bookmarks');
    if (response.ok) {
      bookmarks = await response.json();
      if (bookmarks.length > 0) {
        selectedBookmarkId = bookmarks[0].bookmark_id;
      }
    }
  }

  async function archive(id, index) {
    await fetch(`http://localhost:3000/archive?id=${id}`);
    bookmarks = bookmarks.filter(b => b.bookmark_id !== id);
    if (selectedBookmark >= bookmarks.length) {
      selectedBookmark--;
    }
  }

  async function star(id) {
    await fetch(`http://localhost:3000/star?id=${id}`);
    bookmarks = bookmarks.map(b => 
      b.bookmark_id === id ? {...b, starred: "1"} : b
    );
  }

  async function unstar(id) {
    await fetch(`http://localhost:3000/unstar?id=${id}`);
    bookmarks = bookmarks.map(b => 
      b.bookmark_id === id ? {...b, starred: "0"} : b
    );
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

  function handleKeydown(e) {
    if (e.key === 'j') {
      selectedBookmark = (selectedBookmark + 1) % bookmarks.length;
      selectedBookmarkId = bookmarks[selectedBookmark].bookmark_id;
    } else if (e.key === 'k') {
      selectedBookmark = selectedBookmark - 1 < 0 ? bookmarks.length - 1 : selectedBookmark - 1;
      selectedBookmarkId = bookmarks[selectedBookmark].bookmark_id;
    } else if (e.key === 'l') {
      const bookmark = bookmarks[selectedBookmark];
      if (bookmark.starred === "0") {
        star(selectedBookmarkId);
      } else {
        unstar(selectedBookmarkId);
      }
    } else if (e.key === 'Enter') {
      getText(selectedBookmarkId);
    } else if (e.key === 'Backspace') {
      archive(selectedBookmarkId, selectedBookmark);
    } else if (e.key === '0') {
      selectedBookmark = 0;
      selectedBookmarkId = bookmarks[0].bookmark_id;
    } else if (e.key === 'r') {
      selectedBookmark = Math.floor(Math.random() * bookmarks.length);
      selectedBookmarkId = bookmarks[selectedBookmark].bookmark_id;
      getText(selectedBookmarkId);
    }
  }

  onMount(() => {
    fetchBookmarks();
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  $: currentDate = undefined;
</script>

<svelte:head>
  <title>Instapaper quick view</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</svelte:head>

<div class="flex h-screen">
  <div class="flex-1 w-full sticky top-0">
    <table id="table" class="text-lg text-left table table-fixed w-full">
      <tbody id="tbody" class="bg-stone-800 block h-screen overflow-auto">
        {#each bookmarks as bookmark, i}
          {@const dateAdded = new Date(bookmark.time)}
          {@const formattedDate = `${dateAdded.getFullYear()}-${dateAdded.getMonth() + 1}-${dateAdded.getDate()}`}
          {#if currentDate !== formattedDate}
            {@const temp = currentDate = formattedDate}
            <tr class="text-stone-100">
              <td>{formattedDate}</td>
            </tr>
          {/if}
          <tr
            id="row-{i}"
            class="cursor-pointer border-b text-stone-400 {selectedBookmark === i ? 'bg-stone-600' : ''}"
            on:click={() => {
              selectedBookmark = i;
              selectedBookmarkId = bookmark.bookmark_id;
              getText(bookmark.bookmark_id);
            }}
          >
            <td>
              <button
                on:click|stopPropagation={() => {
                  if (bookmark.starred === "1") {
                    unstar(bookmark.bookmark_id);
                  } else {
                    star(bookmark.bookmark_id);
                  }
                }}
              >
                {bookmark.starred === "1" ? "♥" : "♡"}
              </button>
            </td>
            <td>
              <div>
                <a href={bookmark.url} target="_blank">
                  {bookmark.title || bookmark.url}
                </a>
              </div>
              <div class="text-xs">
                {#if bookmark.progress_timestamp !== 0}
                  <span>
                    Last read {new Date(bookmark.progress_timestamp).getFullYear()}-
                    {new Date(bookmark.progress_timestamp).getMonth() + 1}-
                    {new Date(bookmark.progress_timestamp).getDate()} |
                  </span>
                {/if}
                <span class="text-xs">{bookmark.url.substring(0, 120)}</span>
              </div>
            </td>
            <td>{Math.round(bookmark.progress * 100)}%</td>
            <td>
              <button
                on:click|stopPropagation={() => archive(bookmark.bookmark_id, i)}
              >
                Archive
              </button>
            </td>
            <td>
              <button
                on:click|stopPropagation={() => getText(bookmark.bookmark_id)}
              >
                ▶
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div id="text-view-container" class="flex-1 w-full sticky top-0">
    <div
      id="text-view"
      class="bg-stone-800 text-stone-400 w-full h-screen text-lg overflow-scroll"
    >
      {@html textViewContent}
    </div>
  </div>
</div>
