<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import Player from './Player.vue'

const file = ref(null)
const fileInput = ref(null)
const mediaUrl = ref('')

/**
 * Determines which native media element should preview the selected file.
 *
 * @returns {'audio' | 'video' | ''} The selected media kind, or empty when no file exists.
 */
const mediaKind = computed(() => {
  if (!file.value) {
    return ''
  }

  return file.value.type.startsWith('video/') ? 'video' : 'audio'
})

/**
 * Clears the selected media file and releases any active object URL.
 *
 * @returns {void}
 */
function resetMedia() {
  if (mediaUrl.value) {
    URL.revokeObjectURL(mediaUrl.value)
  }

  file.value = null
  mediaUrl.value = ''

  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

/**
 * Handles file-picker changes and creates a browser-local preview URL.
 *
 * @param {Event} event - Change event from the file input.
 * @returns {void}
 */
function handleFileChange(event) {
  const [selectedFile] = event.target.files

  resetMedia()

  file.value = selectedFile || null
  mediaUrl.value = selectedFile ? URL.createObjectURL(selectedFile) : ''
}

/**
 * Releases object URLs when Vue removes this screen.
 *
 * @returns {void}
 */
function handleBeforeUnmount() {
  resetMedia()
}

onBeforeUnmount(handleBeforeUnmount)
</script>

<template>
  <main
    class="grid min-h-svh place-items-center bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6"
  >
    <section
      class="flex w-full max-w-3xl flex-col items-center gap-5 rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-center shadow-2xl sm:gap-6 sm:p-8 md:p-10"
      aria-labelledby="app-title"
    >
      <p class="m-0 text-xs font-extrabold uppercase text-emerald-300">
        Browser-local audio lab
      </p>
      <h1
        id="app-title"
        class="m-0 max-w-[12ch] text-4xl font-black leading-none tracking-normal text-zinc-50 sm:max-w-[13ch] sm:text-5xl"
      >
        Power Audio
      </h1>
      <p class="m-0 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
        Add an audio or video file to show the audio processing tools.
      </p>

      <label
        class="relative inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-rose-400 bg-rose-500 px-5 font-extrabold text-white transition hover:bg-rose-600 focus-within:bg-rose-600 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-300"
      >
        <span>Choose audio or video</span>
        <input
          ref="fileInput"
          class="absolute inset-0 cursor-pointer opacity-0"
          type="file"
          accept="audio/*,video/*"
          @change="handleFileChange"
        >
      </label>

      <button
        v-if="mediaUrl"
        class="min-h-10 rounded-lg border border-zinc-700 px-4 font-extrabold text-zinc-200 transition hover:border-rose-400 hover:bg-rose-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
        type="button"
        @click="resetMedia"
      >
        Reset
      </button>

      <Player
        v-if="mediaUrl"
        :file="file"
        :src="mediaUrl"
        :file-name="file.name"
        :media-kind="mediaKind"
      />
    </section>
  </main>
</template>
