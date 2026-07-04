<script setup>
import { usePlayer } from '../scripts/player'


defineProps({
  file: {
    type: Object,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  mediaKind: {
    type: String,
    required: true,
    /**
     * Checks whether a selected file maps to a native preview element.
     *
     * @param {string} value - Media kind supplied by Main.vue.
     * @returns {boolean} True when the player can render that media kind.
     */
    validator(value) {
      return ['audio', 'video'].includes(value)
    },
  },
  src: {
    type: String,
    required: true,
  },
})

const {
  exportCurrentAudio,
  exportError,
  exportProgress,
  exportStatus,
  isExporting,
  highPassEnabled,
  highPassFrequencyLabel,
  highPassFrequencyLog,
  highPassFrequencyLogStep,
  maxHighPassFrequencyLog,
  maxPlaybackRate,
  maxReverbDuration,
  maxSemitones,
  maxVolumeBoost,
  maxWetMix,
  mediaElement,
  minHighPassFrequencyLog,
  minPlaybackRate,
  minReverbDuration,
  minSemitones,
  minVolumeBoost,
  minWetMix,
  pitchPreservationEnabled,
  playbackRate,
  playbackRateLabel,
  playbackRateStep,
  prepareMediaElement,
  resumeAudioContext,
  reverbDuration,
  reverbDurationLabel,
  reverbDurationStep,
  reverbEnabled,
  semitones,
  semitoneStep,
  volumeBoost,
  volumeBoostLabel,
  volumeBoostStep,
  wetMix,
  wetMixLabel,
  wetMixStep,
} = usePlayer()
</script>

<template>
  <div class="flex w-full flex-col items-center gap-4">
    <p class="m-0 max-w-full text-sm text-zinc-400 [overflow-wrap:anywhere]">
      {{ fileName }}
    </p>

    <div
      class="grid w-full max-w-xl gap-4 border-t border-zinc-800 pt-4"
      aria-label="Playback speed controls"
    >
      <label
        class="grid w-full grid-cols-1 items-center gap-2 text-center text-zinc-400 sm:grid-cols-[6rem_1fr_5rem] sm:gap-3 sm:text-left"
      >
        <span class="text-sm font-extrabold text-zinc-100">Speed</span>
        <input
          v-model.number="playbackRate"
          class="w-full accent-rose-500"
          type="range"
          :min="minPlaybackRate"
          :max="maxPlaybackRate"
          :step="playbackRateStep"
        >
        <strong class="font-semibold tabular-nums text-zinc-100 sm:text-right">
          {{ playbackRateLabel }}x
        </strong>
      </label>

      <label
        class="grid w-full grid-cols-1 items-center justify-center gap-2 text-center text-zinc-400 sm:grid-cols-[6rem_8rem] sm:gap-3"
      >
        <span class="text-sm font-extrabold text-zinc-100">Semitones</span>
        <input
          v-model.number="semitones"
          class="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-400/30"
          type="number"
          :min="minSemitones"
          :max="maxSemitones"
          :step="semitoneStep"
        >
      </label>

    </div>

    <div
      class="grid w-full max-w-xl gap-4 border-t border-zinc-800 pt-4"
      aria-label="Effect and output controls"
    >
      <label
        class="grid w-full grid-cols-1 items-center gap-2 text-center text-zinc-400 sm:grid-cols-[6rem_1fr_5rem] sm:gap-3 sm:text-left"
      >
        <span class="inline-flex items-center justify-center gap-2 text-sm font-extrabold text-zinc-100 sm:justify-start">
          <input
            v-model="reverbEnabled"
            class="size-4 accent-rose-500"
            type="checkbox"
          >
          Reverb
        </span>
        <input
          v-model.number="reverbDuration"
          class="w-full accent-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          type="range"
          :disabled="!reverbEnabled"
          :min="minReverbDuration"
          :max="maxReverbDuration"
          :step="reverbDurationStep"
        >
        <strong class="font-semibold tabular-nums text-zinc-100 sm:text-right">
          {{ reverbDurationLabel }}
        </strong>
      </label>

      <label
        class="grid w-full grid-cols-1 items-center gap-2 text-center text-zinc-400 sm:grid-cols-[6rem_1fr_5rem] sm:gap-3 sm:text-left"
      >
        <span class="text-sm font-extrabold text-zinc-100">Dry/Wet</span>
        <input
          v-model.number="wetMix"
          class="w-full accent-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
          type="range"
          :disabled="!reverbEnabled"
          :min="minWetMix"
          :max="maxWetMix"
          :step="wetMixStep"
        >
        <strong class="font-semibold tabular-nums text-zinc-100 sm:text-right">
          {{ wetMixLabel }}
        </strong>
      </label>

      <label
        class="grid w-full grid-cols-1 items-center gap-2 text-center text-zinc-400 sm:grid-cols-[6rem_1fr_5rem] sm:gap-3 sm:text-left"
      >
        <span class="inline-flex items-center justify-center gap-2 text-sm font-extrabold text-zinc-100 sm:justify-start">
          <input
            v-model="highPassEnabled"
            class="size-4 accent-emerald-400"
            type="checkbox"
          >
          High-pass
        </span>
        <input
          v-model.number="highPassFrequencyLog"
          class="w-full accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          type="range"
          :disabled="!highPassEnabled"
          :min="minHighPassFrequencyLog"
          :max="maxHighPassFrequencyLog"
          :step="highPassFrequencyLogStep"
        >
        <strong class="font-semibold tabular-nums text-zinc-100 sm:text-right">
          {{ highPassFrequencyLabel }}
        </strong>
      </label>

      <label
        class="grid w-full grid-cols-1 items-center gap-2 text-center text-zinc-400 sm:grid-cols-[6rem_1fr_5rem] sm:gap-3 sm:text-left"
      >
        <span class="text-sm font-extrabold text-zinc-100">Volume</span>
        <input
          v-model.number="volumeBoost"
          class="w-full accent-emerald-400"
          type="range"
          :min="minVolumeBoost"
          :max="maxVolumeBoost"
          :step="volumeBoostStep"
        >
        <strong class="font-semibold tabular-nums text-zinc-100 sm:text-right">
          {{ volumeBoostLabel }}
        </strong>
      </label>
    </div>

    <div class="grid w-full max-w-xl gap-3 border-t border-zinc-800 pt-4">
      <button
        class="min-h-11 rounded-lg border border-emerald-300 bg-emerald-400 px-4 font-extrabold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        type="button"
        :disabled="isExporting"
        @click="exportCurrentAudio(file)"
      >
        {{ isExporting ? 'Exporting WAV...' : 'Export WAV' }}
      </button>

      <div
        v-if="isExporting || exportStatus"
        class="h-2 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        :aria-valuenow="Math.round(exportProgress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full rounded-full bg-emerald-400 transition-[width]"
          :style="{ width: `${Math.round(exportProgress * 100)}%` }"
        />
      </div>

      <p
        v-if="isExporting || exportStatus"
        class="m-0 text-sm text-zinc-400"
      >
        {{ exportStatus }}
      </p>

      <p
        v-if="exportError"
        class="m-0 text-sm font-semibold text-rose-300"
      >
        {{ exportError }}
      </p>
    </div>

    <video
      v-if="mediaKind === 'video'"
      ref="mediaElement"
      :src="src"
      class="max-h-[420px] w-full rounded-lg bg-black"
      controls
      playsinline
      @loadedmetadata="prepareMediaElement($event.currentTarget)"
      @play="resumeAudioContext"
    />

    <audio
      v-else
      ref="mediaElement"
      :src="src"
      class="w-full max-w-xl"
      controls
      @loadedmetadata="prepareMediaElement($event.currentTarget)"
      @play="resumeAudioContext"
    />

    <label
      class="inline-flex items-center justify-center gap-2 text-sm font-extrabold text-zinc-100"
    >
      <input
        v-model="pitchPreservationEnabled"
        class="size-4 accent-rose-500"
        type="checkbox"
      >
      Preserve pitch (no export)
    </label>
  </div>
</template>