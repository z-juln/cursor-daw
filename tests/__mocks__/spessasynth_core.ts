export class BasicMIDI {
  static fromArrayBuffer() { return { duration: 0, tracks: [] }; }
}
export class SoundBankLoader {
  static fromArrayBuffer() { return {}; }
}
export class SpessaSynthProcessor {
  soundBankManager = { addSoundBank() {} };
  processorInitialized = Promise.resolve();
  setSystemParameter() {}
  process() {}
}
export class SpessaSynthSequencer {
  loadNewSongList() {}
  play() {}
  processTick() {}
}
export function audioToWav() { return new ArrayBuffer(0); }
