/**
 * Extrait « libre de droits » : synthétisé par le test lui-même (aucune œuvre, aucun
 * enregistrement, donc aucun droit à gérer). WAV PCM 16 bits mono.
 *
 * - de 0 à `silentMs` : silence (vérifie que le lecteur respecte le point de départ) ;
 * - ensuite : un accord d'orgue continu jusqu'à la fin, pour que toute coupure soit mesurable.
 */
export const FREE_EXTRACT_SAMPLE_RATE = 22_050

export function createFreeExtractWav(options: { durationMs: number; silentMs: number }): Buffer {
  const sampleRate = FREE_EXTRACT_SAMPLE_RATE
  const samples = Math.round((options.durationMs / 1000) * sampleRate)
  const silentSamples = Math.round((options.silentMs / 1000) * sampleRate)
  const dataBytes = samples * 2
  const wav = Buffer.alloc(44 + dataBytes)

  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + dataBytes, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(dataBytes, 40)

  // La majeur (La 220 Hz, Do# 277 Hz, Mi 330 Hz), avec un léger trémolo.
  const chord = [220, 277.18, 329.63]
  for (let index = 0; index < samples; index += 1) {
    let value = 0
    if (index >= silentSamples) {
      const time = index / sampleRate
      const tremolo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 5 * time)
      for (const frequency of chord) {
        value += Math.sin(2 * Math.PI * frequency * time)
      }
      value = (value / chord.length) * 0.6 * tremolo
    }
    wav.writeInt16LE(Math.round(value * 32_767), 44 + index * 2)
  }

  return wav
}
