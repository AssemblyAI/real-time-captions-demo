class PcmEncoder extends AudioWorkletProcessor {
  constructor() {
    super();
    // 100 ms of 16-bit mono PCM, with no WAV header.
    this.chunk = new DataView(new ArrayBuffer(sampleRate / 10 * 2));
    this.offset = 0;
  }

  process(inputs) {
    const samples = inputs[0][0];
    if (!samples) return true;

    for (const sample of samples) {
      const value = Math.max(-1, Math.min(1, sample));
      this.chunk.setInt16(this.offset, value * (value < 0 ? 32768 : 32767), true);
      this.offset += 2;
      if (this.offset === this.chunk.byteLength) {
        const buffer = this.chunk.buffer;
        this.chunk = new DataView(new ArrayBuffer(this.chunk.byteLength));
        this.offset = 0;
        this.port.postMessage(buffer, [buffer]);
      }
    }
    return true;
  }
}

registerProcessor('pcm-encoder', PcmEncoder);
