// Playback speed limits are intentionally conservative so preview and export stay usable.
export const MIN_PLAYBACK_RATE = 0.5
export const MAX_PLAYBACK_RATE = 2
export const PLAYBACK_RATE_STEP = 0.1
export const DEFAULT_PITCH_PRESERVATION_ENABLED = false

// Semitone controls are converted to playback-rate multipliers in player.js.
export const MIN_SEMITONES = -12
export const MAX_SEMITONES = 12
export const SEMITONE_STEP = 1

// Volume boost feeds a limiter, so 1x remains neutral and higher values stay bounded.
export const MIN_VOLUME_BOOST = 0
export const DEFAULT_VOLUME_BOOST = 1
export const MAX_VOLUME_BOOST = 2
export const VOLUME_BOOST_STEP = 0.01

// Reverb defaults off; duration and wet mix only affect audio once enabled.
export const DEFAULT_REVERB_ENABLED = false
export const MIN_REVERB_DURATION = 0.1
export const MAX_REVERB_DURATION = 10
export const REVERB_DURATION_STEP = 0.1
export const DEFAULT_REVERB_DURATION = 1.8

export const MIN_WET_MIX = 0
export const MAX_WET_MIX = 1
export const WET_MIX_STEP = 0.01
export const DEFAULT_WET_MIX = 0.2

// The high-pass slider stores logarithmic positions but exposes frequencies in hertz.
export const DEFAULT_HIGH_PASS_ENABLED = false
export const MIN_HIGH_PASS_FREQUENCY = 1
export const MAX_HIGH_PASS_FREQUENCY = 500
export const DEFAULT_HIGH_PASS_FREQUENCY = 150
export const HIGH_PASS_FREQUENCY_LOG_STEP = 0.001

// Offline export is chunked to keep memory use reasonable for long media files.
export const EXPORT_CHUNK_SECONDS = 30
export const EXPORT_BIT_DEPTH = 16
