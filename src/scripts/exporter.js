import * as Tone from 'tone'
import { EXPORT_BIT_DEPTH, EXPORT_CHUNK_SECONDS } from './constants'

const WAV_HEADER_BYTES = 44
const MAX_WAV_BYTES = 0xffffffff

/**
 * Restricts a floating-point audio sample to the valid PCM range.
 *
 * @param {number} value - Sample value to constrain.
 * @returns {number} The sample clamped to [-1, 1].
 */
function clampSample(value) {
  return Math.min(1, Math.max(-1, value))
}

/**
 * Creates the output file name used for rendered WAV downloads.
 *
 * @param {string} fileName - Original media file name.
 * @returns {string} Rendered WAV file name.
 */
function getRenderedName(fileName) {
  const baseName = fileName.replace(/\.[^/.]+$/, '')

  return `${baseName || 'rendered-audio'}-rendered.wav`
}

/**
 * Writes an ASCII chunk identifier into a binary DataView.
 *
 * @param {DataView} dataView - Binary view to mutate.
 * @param {number} offset - Byte offset where writing starts.
 * @param {string} value - ASCII text to write.
 * @returns {void}
 */
function writeAscii(dataView, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    dataView.setUint8(offset + index, value.charCodeAt(index))
  }
}

/**
 * Builds a standard PCM WAV header for the rendered audio.
 *
 * @param {object} options - Header metadata.
 * @param {number} options.bitDepth - PCM bit depth.
 * @param {number} options.channels - Number of output channels.
 * @param {number} options.sampleRate - Output sample rate in hertz.
 * @param {number} options.totalFrames - Total PCM frames in the final file.
 * @returns {ArrayBuffer} WAV header bytes.
 */
function createWavHeader({ bitDepth, channels, sampleRate, totalFrames }) {
  const bytesPerSample = bitDepth / 8
  const blockAlign = channels * bytesPerSample
  const dataBytes = totalFrames * blockAlign
  const fileBytes = WAV_HEADER_BYTES + dataBytes

  if (fileBytes > MAX_WAV_BYTES) {
    throw new Error('This export is too large for a standard WAV file.')
  }

  const header = new ArrayBuffer(WAV_HEADER_BYTES)
  const dataView = new DataView(header)

  writeAscii(dataView, 0, 'RIFF')
  dataView.setUint32(4, fileBytes - 8, true)
  writeAscii(dataView, 8, 'WAVE')
  writeAscii(dataView, 12, 'fmt ')
  dataView.setUint32(16, 16, true)
  dataView.setUint16(20, 1, true)
  dataView.setUint16(22, channels, true)
  dataView.setUint32(24, sampleRate, true)
  dataView.setUint32(28, sampleRate * blockAlign, true)
  dataView.setUint16(32, blockAlign, true)
  dataView.setUint16(34, bitDepth, true)
  writeAscii(dataView, 36, 'data')
  dataView.setUint32(40, dataBytes, true)

  return header
}

/**
 * Reads channel data, duplicating the last available channel when needed.
 *
 * @param {AudioBuffer} audioBuffer - Source buffer.
 * @param {number} channelIndex - Requested output channel index.
 * @returns {Float32Array} Audio samples for the selected channel.
 */
function getChannelData(audioBuffer, channelIndex) {
  return audioBuffer.getChannelData(
    Math.min(channelIndex, audioBuffer.numberOfChannels - 1),
  )
}

/**
 * Copies the reverb tail at the end of a rendered chunk.
 *
 * @param {AudioBuffer} audioBuffer - Rendered chunk buffer.
 * @param {number} startFrame - First frame of the tail region.
 * @param {number} frameCount - Number of tail frames to copy.
 * @param {number} channels - Number of output channels.
 * @returns {Float32Array[]} Tail samples by channel.
 */
function copyTail(audioBuffer, startFrame, frameCount, channels) {
  const tails = []

  // Preserve per-channel tails so reverb can continue across chunk boundaries.
  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const source = getChannelData(audioBuffer, channelIndex)
    const tail = new Float32Array(frameCount)

    tail.set(source.subarray(startFrame, startFrame + frameCount))
    tails.push(tail)
  }

  return tails
}

/**
 * Encodes rendered floating-point samples as an interleaved 16-bit PCM chunk.
 *
 * @param {object} options - Encoding options.
 * @param {AudioBuffer} options.audioBuffer - Rendered audio to encode.
 * @param {number} options.channels - Number of output channels.
 * @param {number} options.frameCount - Number of frames to write.
 * @param {Float32Array[] | null} options.previousTail - Reverb tail from the previous chunk.
 * @returns {ArrayBuffer} Encoded PCM bytes.
 */
function encodePcm16Chunk({ audioBuffer, channels, frameCount, previousTail }) {
  const output = new ArrayBuffer(frameCount * channels * 2)
  const dataView = new DataView(output)
  let writeOffset = 0

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const channel = getChannelData(audioBuffer, channelIndex)
      const tail = previousTail?.[channelIndex]
      const mixedSample =
        // Blend the previous chunk's reverb tail into the start of this chunk.
        channel[frameIndex] + (tail && frameIndex < tail.length ? tail[frameIndex] : 0)
      const sample = clampSample(mixedSample)

      dataView.setInt16(
        writeOffset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true,
      )
      writeOffset += 2
    }
  }

  return output
}

/**
 * Decodes a browser File into an AudioBuffer.
 *
 * @param {File} file - Source audio or video file.
 * @returns {Promise<AudioBuffer>} Decoded audio data.
 */
async function decodeFile(file) {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  const audioContext = new AudioContext()

  try {
    return await audioContext.decodeAudioData(await file.arrayBuffer())
  } finally {
    await audioContext.close()
  }
}

/**
 * Renders one offline audio chunk with playback speed, reverb, high-pass, gain, and limiting.
 *
 * @param {object} options - Render settings.
 * @param {AudioBuffer} options.audioBuffer - Source audio buffer.
 * @param {number} options.channels - Number of output channels.
 * @param {number} options.inputDuration - Source duration to render in seconds.
 * @param {boolean} options.highPassEnabled - Whether to apply the high-pass filter.
 * @param {number} options.highPassFrequency - High-pass cutoff frequency in hertz.
 * @param {number} options.outputFrames - Number of output frames to render.
 * @param {number} options.playbackRate - Playback-rate multiplier.
 * @param {number} options.reverbDuration - Reverb decay in seconds.
 * @param {boolean} options.reverbEnabled - Whether to apply reverb.
 * @param {number} options.sampleRate - Output sample rate in hertz.
 * @param {number} options.sourceOffset - Source start offset in seconds.
 * @param {number} options.volumeBoost - Gain multiplier.
 * @param {number} options.wetMix - Reverb wet mix from 0 to 1.
 * @returns {Promise<AudioBuffer>} Rendered audio chunk.
 */
async function renderChunk({
  audioBuffer,
  channels,
  inputDuration,
  highPassEnabled,
  highPassFrequency,
  outputFrames,
  playbackRate,
  reverbDuration,
  reverbEnabled,
  sampleRate,
  sourceOffset,
  volumeBoost,
  wetMix,
}) {
  const duration = outputFrames / sampleRate

  /**
   * Builds and starts the offline render graph for this chunk.
   *
   * @param {Tone.OfflineContext} context - Tone offline context for this chunk.
   * @returns {Promise<void>} Resolves after the chunk source has been scheduled.
   */
  async function renderOfflineGraph(context) {
    // Tone.Offline provides an isolated context for deterministic chunk rendering.
    const source = context.rawContext.createBufferSource()
    const filter = context.rawContext.createBiquadFilter()
    const boost = context.rawContext.createGain()
    const limiter = new Tone.Limiter(0)
    const reverb = new Tone.Reverb({
      decay: reverbDuration,
      preDelay: 0.01,
      wet: reverbEnabled ? wetMix : 0,
    })

    filter.type = 'highpass'
    filter.Q.value = Math.SQRT1_2
    // A 0 Hz cutoff makes the high-pass effectively transparent when disabled.
    filter.frequency.value = highPassEnabled
      ? highPassFrequency
      : 0
    boost.gain.value = volumeBoost
    source.buffer = audioBuffer
    source.playbackRate.value = playbackRate

    // Offline graph order matches preview: source -> reverb -> high-pass -> gain -> limiter.
    source.connect(reverb.input.input)
    reverb.connect(filter)
    filter.connect(boost)
    Tone.connect(boost, limiter)
    limiter.connect(context.rawContext.destination)

    await reverb.ready
    source.start(0, sourceOffset, inputDuration)
  }

  const renderedBuffer = await Tone.Offline(
    renderOfflineGraph,
    duration,
    channels,
    sampleRate,
  )

  return renderedBuffer.get()
}

/**
 * Opens a writable export target, using the File System Access API when available.
 *
 * @param {string} fileName - Original media file name used to suggest the export name.
 * @returns {Promise<object>} Target with write, finalize, and abort methods.
 */
async function createWritableTarget(fileName) {
  const suggestedName = getRenderedName(fileName)

  if (!window.showSaveFilePicker) {
    // Fall back to a Blob download for browsers without the save-file picker.
    return {
      chunks: [],
      /**
       * Buffers rendered bytes until a final Blob download can be created.
       *
       * @param {BlobPart} chunk - Rendered bytes to buffer.
       * @returns {Promise<void>} Resolves after the chunk is stored in memory.
       */
      async write(chunk) {
        this.chunks.push(chunk)
      },
      /**
       * Creates a downloadable WAV Blob with the finalized header.
       *
       * @param {ArrayBuffer} header - Final WAV header to place before buffered audio.
       * @returns {Promise<void>} Resolves after the browser download is triggered.
       */
      async finalize(header) {
        this.chunks[0] = header
        const blob = new Blob(this.chunks, { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')

        link.href = url
        link.download = suggestedName
        link.click()
        URL.revokeObjectURL(url)
      },
      /**
       * Matches the file-system writer API when no cleanup is needed.
       *
       * @returns {Promise<void>} Resolves immediately.
       */
      async abort() {},
    }
  }

  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'WAV audio',
        accept: { 'audio/wav': ['.wav'] },
      },
    ],
  })
  const writable = await handle.createWritable()

  return {
    /**
     * Writes rendered bytes directly to the selected file handle.
     *
     * @param {ArrayBuffer | Uint8Array} chunk - Rendered bytes to write.
     * @returns {Promise<void>} Resolves after the bytes are written.
     */
    async write(chunk) {
      await writable.write(chunk)
    },
    /**
     * Replaces the placeholder header and closes the selected output file.
     *
     * @param {ArrayBuffer} header - Final WAV header to overwrite the placeholder.
     * @returns {Promise<void>} Resolves after the file is complete.
     */
    async finalize(header) {
      await writable.seek(0)
      await writable.write(header)
      await writable.close()
    },
    /**
     * Cancels the file-system write if export fails or is interrupted.
     *
     * @returns {Promise<void>} Resolves after the writable stream aborts.
     */
    async abort() {
      await writable.abort()
    },
  }
}

/**
 * Exports a media file to WAV with the provided playback and effect settings.
 *
 * @param {File} file - Source media file.
 * @param {object} settings - Render settings from the player controls.
 * @param {boolean} settings.highPassEnabled - Whether to apply the high-pass filter.
 * @param {number} settings.highPassFrequency - High-pass cutoff frequency in hertz.
 * @param {number} settings.playbackRate - Playback-rate multiplier.
 * @param {number} settings.reverbDuration - Reverb decay in seconds.
 * @param {boolean} settings.reverbEnabled - Whether to apply reverb.
 * @param {number} settings.volumeBoost - Gain multiplier.
 * @param {number} settings.wetMix - Reverb wet mix from 0 to 1.
 * @param {(update: { progress: number, status: string }) => void} [onProgress] - Progress callback.
 * @returns {Promise<void>} Resolves after the WAV file is written.
 */
export async function exportAudioFile(file, settings, onProgress) {
  const target = await createWritableTarget(file.name)

  try {
    // Reserve space for the WAV header; final sizes are known only after setup.
    await target.write(new Uint8Array(WAV_HEADER_BYTES))
    onProgress?.({ progress: 0.03, status: 'Decoding audio...' })

    const audioBuffer = await decodeFile(file)
    const channels = Math.min(audioBuffer.numberOfChannels, 2)
    const sampleRate = audioBuffer.sampleRate
    const bodyFrames = Math.ceil(
      (audioBuffer.length / settings.playbackRate),
    )
    const tailFrames = settings.reverbEnabled && settings.wetMix > 0
      ? Math.ceil(settings.reverbDuration * sampleRate)
      : 0
    const totalFrames = bodyFrames + tailFrames
    const header = createWavHeader({
      bitDepth: EXPORT_BIT_DEPTH,
      channels,
      sampleRate,
      totalFrames,
    })

    let renderedFrames = 0
    let previousTail = null
    const chunkFrames = Math.max(
      Math.ceil(EXPORT_CHUNK_SECONDS * sampleRate),
      // Keep each chunk large enough to carry a complete reverb tail.
      tailFrames * 2,
      1,
    )

    // Render in chunks so long files do not require one huge OfflineAudioContext.
    while (renderedFrames < bodyFrames) {
      const framesInChunk = Math.min(chunkFrames, bodyFrames - renderedFrames)
      const isLastChunk = renderedFrames + framesInChunk >= bodyFrames
      const framesToRender = framesInChunk + tailFrames
      const outputStartSeconds = renderedFrames / sampleRate
      const inputDuration = framesInChunk / sampleRate * settings.playbackRate
      const renderedChunk = await renderChunk({
        audioBuffer,
        channels,
        inputDuration,
        highPassEnabled: settings.highPassEnabled,
        highPassFrequency: settings.highPassFrequency,
        outputFrames: framesToRender,
        playbackRate: settings.playbackRate,
        reverbDuration: settings.reverbDuration,
        reverbEnabled: settings.reverbEnabled,
        sampleRate,
        sourceOffset: outputStartSeconds * settings.playbackRate,
        volumeBoost: settings.volumeBoost,
        wetMix: settings.wetMix,
      })
      const framesToWrite = isLastChunk ? framesToRender : framesInChunk

      await target.write(encodePcm16Chunk({
        audioBuffer: renderedChunk,
        channels,
        frameCount: framesToWrite,
        previousTail,
      }))

      // Carry reverb decay into the next chunk so boundaries stay seamless.
      previousTail = isLastChunk
        ? null
        : copyTail(renderedChunk, framesInChunk, tailFrames, channels)
      renderedFrames += framesInChunk

      onProgress?.({
        progress: 0.08 + 0.9 * (renderedFrames / bodyFrames),
        status: `Rendering ${Math.round(renderedFrames / bodyFrames * 100)}%...`,
      })
    }

    await target.finalize(header)
    onProgress?.({ progress: 1, status: 'Export complete.' })
  } catch (error) {
    await target.abort()
    throw error
  }
}
