import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as Tone from 'tone'
import { exportAudioFile } from './exporter'
import {
  DEFAULT_HIGH_PASS_ENABLED,
  DEFAULT_HIGH_PASS_FREQUENCY,
  DEFAULT_PITCH_PRESERVATION_ENABLED,
  DEFAULT_REVERB_DURATION,
  DEFAULT_REVERB_ENABLED,
  DEFAULT_VOLUME_BOOST,
  DEFAULT_WET_MIX,
  HIGH_PASS_FREQUENCY_LOG_STEP,
  MAX_HIGH_PASS_FREQUENCY,
  MAX_PLAYBACK_RATE,
  MAX_REVERB_DURATION,
  MAX_SEMITONES,
  MAX_VOLUME_BOOST,
  MAX_WET_MIX,
  MIN_HIGH_PASS_FREQUENCY,
  MIN_PLAYBACK_RATE,
  MIN_REVERB_DURATION,
  MIN_SEMITONES,
  MIN_VOLUME_BOOST,
  MIN_WET_MIX,
  PLAYBACK_RATE_STEP,
  REVERB_DURATION_STEP,
  SEMITONE_STEP,
  VOLUME_BOOST_STEP,
  WET_MIX_STEP,
} from './constants'

/**
 * Converts pitch-shift semitones into a media playback-rate multiplier.
 *
 * @param {number} value - Semitone offset from the original pitch.
 * @returns {number} Playback-rate multiplier for that pitch offset.
 */
function semitonesToRate(value) {
  return 2 ** (value / 12)
}

/**
 * Converts a media playback-rate multiplier into semitones.
 *
 * @param {number} value - Playback-rate multiplier.
 * @returns {number} Semitone offset from the original pitch.
 */
function rateToSemitones(value) {
  return 12 * Math.log2(value)
}

/**
 * Keeps a numeric value inside an inclusive range.
 *
 * @param {number} value - Value to constrain.
 * @param {number} min - Inclusive lower bound.
 * @param {number} max - Inclusive upper bound.
 * @returns {number} The clamped value.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Formats compact decimal values for control labels.
 *
 * @param {number} value - Number to display.
 * @param {number} [maximumFractionDigits=3] - Maximum decimal places to show.
 * @returns {string} Localized display text.
 */
function formatDecimal(value, maximumFractionDigits = 3) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(value)
}

/**
 * Converts a frequency in hertz to the logarithmic slider position.
 *
 * @param {number} value - Frequency in hertz.
 * @returns {number} Base-10 logarithmic slider value.
 */
function frequencyToLogValue(value) {
  return Math.log10(value)
}

/**
 * Converts the logarithmic slider position back into hertz.
 *
 * @param {number} value - Base-10 logarithmic slider value.
 * @returns {number} Frequency in hertz.
 */
function logValueToFrequency(value) {
  return 10 ** value
}

const minHighPassFrequencyLog = frequencyToLogValue(MIN_HIGH_PASS_FREQUENCY)
const maxHighPassFrequencyLog = frequencyToLogValue(MAX_HIGH_PASS_FREQUENCY)

/**
 * Provides playback, effects, and export state for the media player UI.
 *
 * @returns {object} Reactive controls and handlers consumed by Player.vue.
 */
export function usePlayer() {
  const mediaElement = ref(null)
  const playbackRate = ref(1)
  const pitchPreservationEnabled = ref(DEFAULT_PITCH_PRESERVATION_ENABLED)
  const reverbEnabled = ref(DEFAULT_REVERB_ENABLED)
  const reverbDuration = ref(DEFAULT_REVERB_DURATION)
  const volumeBoost = ref(DEFAULT_VOLUME_BOOST)
  const wetMix = ref(DEFAULT_WET_MIX)
  const highPassEnabled = ref(DEFAULT_HIGH_PASS_ENABLED)
  const highPassFrequency = ref(DEFAULT_HIGH_PASS_FREQUENCY)
  const exportError = ref('')
  const exportProgress = ref(0)
  const exportStatus = ref('')
  const isExporting = ref(false)
  const audioGraph = {
    boost: null,
    filter: null,
    limiter: null,
    reverb: null,
    source: null,
    sourceElement: null,
  }

  // Human-readable labels keep template formatting out of Player.vue.
  /**
   * Formats the current playback speed for the speed slider label.
   *
   * @returns {string} Playback speed display text.
   */
  const playbackRateLabel = computed(() => formatDecimal(playbackRate.value))

  /**
   * Formats the current reverb decay length.
   *
   * @returns {string} Reverb duration display text.
   */
  const reverbDurationLabel = computed(
    () => `${reverbDuration.value.toFixed(1)}s`,
  )

  /**
   * Formats the current wet mix as a percentage.
   *
   * @returns {string} Wet mix display text.
   */
  const wetMixLabel = computed(() => `${Math.round(wetMix.value * 100)}% wet`)

  /**
   * Formats the current output gain multiplier.
   *
   * @returns {string} Volume boost display text.
   */
  const volumeBoostLabel = computed(() => `${volumeBoost.value.toFixed(2)}x`)

  /**
   * Formats the current high-pass cutoff frequency.
   *
   * @returns {string} High-pass cutoff display text.
   */
  const highPassFrequencyLabel = computed(
    () => `${formatDecimal(highPassFrequency.value, 0)} Hz`,
  )

  const semitones = computed({
    /**
     * Reads the current playback speed as a rounded semitone offset.
     *
     * @returns {number} Semitone offset for the current playback rate.
     */
    get() {
      return Number(rateToSemitones(playbackRate.value).toFixed(3))
    },
    /**
     * Updates playback speed from a semitone input value.
     *
     * @param {number | string} value - User-entered semitone offset.
     * @returns {void}
     */
    set(value) {
      const numericValue = Number(value)

      if (Number.isNaN(numericValue)) {
        return
      }

      playbackRate.value = clamp(
        semitonesToRate(numericValue),
        MIN_PLAYBACK_RATE,
        MAX_PLAYBACK_RATE,
      )
    },
  })

  const highPassFrequencyLog = computed({
    /**
     * Reads the cutoff frequency as a logarithmic slider position.
     *
     * @returns {number} Logarithmic cutoff slider value.
     */
    get() {
      return frequencyToLogValue(highPassFrequency.value)
    },
    /**
     * Updates the cutoff frequency from a logarithmic slider position.
     *
     * @param {number | string} value - Logarithmic cutoff slider value.
     * @returns {void}
     */
    set(value) {
      const numericValue = Number(value)

      if (Number.isNaN(numericValue)) {
        return
      }

      highPassFrequency.value = clamp(
        logValueToFrequency(numericValue),
        MIN_HIGH_PASS_FREQUENCY,
        MAX_HIGH_PASS_FREQUENCY,
      )
    },
  })

  /**
   * Gets the low cutoff used to make the high-pass filter effectively transparent.
   *
   * @returns {number} Bypass cutoff frequency in hertz.
   */
  function getBypassFilterFrequency() {
    return 0
  }

  /**
   * Applies playback speed and pitch-following behavior to a media element.
   *
   * @param {HTMLMediaElement | null} [element=mediaElement.value] - Element to update.
   * @returns {void}
   */
  function applyPlaybackSettings(element = mediaElement.value) {
    if (!element) {
      return
    }

    // Browser-specific pitch preservation defaults off for slowed/nightcore audio.
    if ('preservesPitch' in element) {
      element.preservesPitch = pitchPreservationEnabled.value
    }

    if ('mozPreservesPitch' in element) {
      element.mozPreservesPitch = pitchPreservationEnabled.value
    }

    if ('webkitPreservesPitch' in element) {
      element.webkitPreservesPitch = pitchPreservationEnabled.value
    }

    element.playbackRate = playbackRate.value
    element.defaultPlaybackRate = playbackRate.value
  }

  /**
   * Pushes reverb duration and wet mix changes into the live Tone graph.
   *
   * @returns {void}
   */
  function applyReverbSettings() {
    if (!audioGraph.reverb) {
      return
    }

    audioGraph.reverb.decay = reverbDuration.value
    audioGraph.reverb.wet.value = reverbEnabled.value ? wetMix.value : 0
  }

  /**
   * Pushes high-pass filter changes into the live Web Audio graph.
   *
   * @returns {void}
   */
  function applyHighPassSettings() {
    if (!audioGraph.filter) {
      return
    }

    audioGraph.filter.frequency.value = highPassEnabled.value
      ? highPassFrequency.value
      : getBypassFilterFrequency()
  }

  /**
   * Pushes gain changes into the live Tone graph.
   *
   * @returns {void}
   */
  function applyVolumeBoostSettings() {
    if (!audioGraph.boost) {
      return
    }

    audioGraph.boost.gain.value = volumeBoost.value
  }

  /**
   * Creates the live playback graph for a media element.
   *
   * @param {HTMLMediaElement | null} [element=mediaElement.value] - Element to route through effects.
   * @returns {void}
   */
  function setupAudioGraph(element = mediaElement.value) {
    if (!element || audioGraph.sourceElement === element) {
      return
    }

    if (audioGraph.source) {
      audioGraph.source.disconnect()
    }

    if (audioGraph.reverb) {
      audioGraph.reverb.dispose()
    }

    if (audioGraph.filter) {
      audioGraph.filter.disconnect()
    }

    if (audioGraph.boost) {
      audioGraph.boost.disconnect()
    }

    if (audioGraph.limiter) {
      audioGraph.limiter.dispose()
    }

    audioGraph.source = Tone.getContext().createMediaElementSource(element)
    audioGraph.sourceElement = element
    audioGraph.reverb = new Tone.Reverb({
      decay: reverbDuration.value,
      preDelay: 0.01,
      wet: reverbEnabled.value ? wetMix.value : 0,
    })
    audioGraph.filter = Tone.getContext().rawContext.createBiquadFilter()
    audioGraph.filter.type = 'highpass'
    audioGraph.filter.Q.value = Math.SQRT1_2
    audioGraph.boost = Tone.getContext().createGain()
    audioGraph.boost.gain.value = volumeBoost.value
    audioGraph.limiter = new Tone.Limiter(0)

    applyHighPassSettings()

    // Graph order: media -> reverb -> high-pass -> gain -> limiter -> speakers.
    audioGraph.source.connect(audioGraph.reverb.input.input)
    audioGraph.reverb.connect(audioGraph.filter)
    audioGraph.filter.connect(audioGraph.boost)
    Tone.connect(audioGraph.boost, audioGraph.limiter)
    audioGraph.limiter.connect(Tone.getContext().rawContext.destination)
  }

  /**
   * Applies media settings and initializes effects after metadata loads.
   *
   * @param {HTMLMediaElement | null} [element=mediaElement.value] - Loaded media element.
   * @returns {void}
   */
  function prepareMediaElement(element = mediaElement.value) {
    applyPlaybackSettings(element)
    setupAudioGraph(element)
  }

  /**
   * Resumes Tone's audio context in response to a user gesture.
   *
   * @returns {Promise<void>} Resolves when browser audio playback is unlocked.
   */
  async function resumeAudioContext() {
    await Tone.start()
  }

  /**
   * Renders the currently selected file with the active playback and effect settings.
   *
   * @param {File | null} file - Source media file to export.
   * @returns {Promise<void>} Resolves after the WAV export is finished or skipped.
   */
  async function exportCurrentAudio(file) {
    if (!file || isExporting.value) {
      return
    }

    exportError.value = ''
    exportProgress.value = 0
    exportStatus.value = 'Preparing export...'
    isExporting.value = true

    try {
      await exportAudioFile(
        file,
        {
          highPassEnabled: highPassEnabled.value,
          highPassFrequency: highPassFrequency.value,
          playbackRate: playbackRate.value,
          reverbDuration: reverbDuration.value,
          reverbEnabled: reverbEnabled.value,
          volumeBoost: volumeBoost.value,
          wetMix: wetMix.value,
        },
        updateExportProgress,
      )
    } catch (error) {
      if (error?.name !== 'AbortError') {
        exportError.value = error?.message || 'Export failed.'
      }
    } finally {
      isExporting.value = false
    }
  }


  /**
   * Mirrors exporter progress updates into reactive UI state.
   *
   * @param {object} update - Export progress update.
   * @param {number} update.progress - Normalized export progress from 0 to 1.
   * @param {string} update.status - Human-readable export status.
   * @returns {void}
   */
  function updateExportProgress({ progress, status }) {
    exportProgress.value = progress
    exportStatus.value = status
  }

  /**
   * Reapplies media playback settings after speed or pitch mode changes.
   *
   * @returns {void}
   */
  function handlePlaybackSettingChange() {
    applyPlaybackSettings()
  }

  /**
   * Reapplies the reverb state after any reverb control changes.
   *
   * @returns {void}
   */
  function handleReverbSettingChange() {
    applyReverbSettings()
  }

  /**
   * Reapplies output gain after the volume control changes.
   *
   * @returns {void}
   */
  function handleVolumeBoostChange() {
    applyVolumeBoostSettings()
  }

  /**
   * Reapplies the high-pass filter after enablement or cutoff changes.
   *
   * @returns {void}
   */
  function handleHighPassSettingChange() {
    applyHighPassSettings()
  }

  /**
   * Releases live audio nodes before Vue removes the player.
   *
   * @returns {void}
   */
  function disposeAudioGraph() {
    if (audioGraph.source) {
      audioGraph.source.disconnect()
    }

    audioGraph.boost?.disconnect()
    audioGraph.filter?.disconnect()
    audioGraph.limiter?.dispose()
    audioGraph.reverb?.dispose()
  }

  // Keep the live audio graph synchronized with reactive control changes.
  watch(playbackRate, handlePlaybackSettingChange)
  watch(pitchPreservationEnabled, handlePlaybackSettingChange)
  watch(reverbEnabled, handleReverbSettingChange)
  watch(reverbDuration, handleReverbSettingChange)
  watch(volumeBoost, handleVolumeBoostChange)
  watch(wetMix, handleReverbSettingChange)
  watch(highPassEnabled, handleHighPassSettingChange)
  watch(highPassFrequency, handleHighPassSettingChange)

  onBeforeUnmount(disposeAudioGraph)

  return {
    exportCurrentAudio,
    exportError,
    exportProgress,
    exportStatus,
    isExporting,
    highPassEnabled,
    highPassFrequency,
    highPassFrequencyLabel,
    highPassFrequencyLog,
    highPassFrequencyLogStep: HIGH_PASS_FREQUENCY_LOG_STEP,
    maxHighPassFrequencyLog,
    maxReverbDuration: MAX_REVERB_DURATION,
    maxPlaybackRate: MAX_PLAYBACK_RATE,
    maxSemitones: MAX_SEMITONES,
    maxVolumeBoost: MAX_VOLUME_BOOST,
    maxWetMix: MAX_WET_MIX,
    mediaElement,
    minHighPassFrequencyLog,
    minReverbDuration: MIN_REVERB_DURATION,
    minPlaybackRate: MIN_PLAYBACK_RATE,
    minSemitones: MIN_SEMITONES,
    minVolumeBoost: MIN_VOLUME_BOOST,
    minWetMix: MIN_WET_MIX,
    pitchPreservationEnabled,
    playbackRate,
    playbackRateLabel,
    playbackRateStep: PLAYBACK_RATE_STEP,
    prepareMediaElement,
    resumeAudioContext,
    reverbDuration,
    reverbDurationLabel,
    reverbDurationStep: REVERB_DURATION_STEP,
    reverbEnabled,
    semitones,
    semitoneStep: SEMITONE_STEP,
    volumeBoost,
    volumeBoostLabel,
    volumeBoostStep: VOLUME_BOOST_STEP,
    wetMix,
    wetMixLabel,
    wetMixStep: WET_MIX_STEP,
  }
}
