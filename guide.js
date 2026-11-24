globalThis.GuideImport = (() => {
  const format = /^(?<header>\s*(?<count>[0-9]+)\|(?<checksum>[0-9]+):)(?<payload>[A-Za-z0-9+/=]+)(?<footer>%\|[0-9]+\s*)$/;

  function battleTag(value) {
    const tag = value.trim();
    if (!/^[^#\s]+#[0-9]+$/.test(tag)) {
      throw new Error("Enter a BattleTag in Name#1234 format.");
    }
    return tag;
  }

  function accountKey(tag) {
    const tagBytes = new TextEncoder().encode(tag).slice(-16);
    const key = new Uint8Array(16);
    const offset = key.length - tagBytes.length;
    for (let i = 0; i < tagBytes.length; i++) {
      const byte = tagBytes[i];
      key[offset + i] = byte >= 65 && byte <= 90 ? byte + 32 : byte;
    }
    for (let i = 0; i < 16; i++) {
      const position = -i & 15;
      key[position] = key[(position - 1) & 15] ^ key[(position - 3) & 15] ^
        key[(position - 4) & 15] ^ key[(position - 6) & 15];
    }
    return key;
  }

  function transform(bytes, tag) {
    const key = accountKey(tag);
    const state = Uint8Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + state[i] + key[i & 15]) & 255;
      const previous = state[i];
      state[i] = state[j];
      state[j] = previous;
    }

    const result = new Uint8Array(bytes.length);
    let i = 0;
    j = 0;
    for (let offset = 0; offset < bytes.length; offset++) {
      i = (i + 1) & 255;
      j = (j + state[i]) & 255;
      const previous = state[i];
      state[i] = state[j];
      state[j] = previous;
      result[offset] = bytes[offset] ^ state[(state[i] + state[j]) & 255];
    }
    return result;
  }

  function inspect(bytes) {
    let count = 0;
    let inGuide = false;
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
      if (byte !== 0 && !inGuide) count++;
      inGuide = byte !== 0;
      a = (a + byte) % 65521;
      b = (b + a) % 65521;
    }
    return { count, checksum: b * 65536 + a };
  }

  async function open(file, originalTag) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
        .decode(await file.arrayBuffer());
    } catch {
      throw new Error("Choose a readable RestedXP import text file.");
    }
    const match = format.exec(text);
    if (!match) throw new Error("Choose a RestedXP import text file with one encrypted guide bundle.");
    const { header, count, checksum, payload, footer } = match.groups;
    const expectedChecksum = Number(BigInt.asUintN(32, BigInt(checksum)));

    let encrypted;
    try {
      encrypted = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    } catch {
      throw new Error("The original file contains a damaged guide payload.");
    }
    const compressed = transform(encrypted, originalTag);
    const trailer = new DataView(compressed.buffer);
    if (compressed.length < 8 || trailer.getUint32(compressed.length - 4) !== expectedChecksum) {
      throw new Error("The original BattleTag didn’t unlock this file. Check the name and number.");
    }
    if (!globalThis.DecompressionStream) {
      throw new Error("This browser can’t unpack the guide. Try a current version of Chrome, Edge, Firefox, or Safari.");
    }

    let plain;
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
      plain = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new Error("The guide bundle could not be unpacked. Choose a fresh copy of the original file.");
    }
    const verified = inspect(plain);
    if (verified.checksum !== expectedChecksum || verified.count !== Number(count)) {
      throw new Error("The guide bundle failed verification. Choose a fresh copy of the original file.");
    }
    return { header, footer, compressed, count: verified.count };
  }

  function rebuild(bundle, targetTag) {
    const encrypted = transform(bundle.compressed, targetTag);
    const blockSize = 16384;
    let binary = "";
    for (let offset = 0; offset < encrypted.length; offset += blockSize) {
      binary += String.fromCharCode(...encrypted.subarray(offset, offset + blockSize));
    }
    return bundle.header + btoa(binary) + bundle.footer;
  }

  function fileName(targetTag) {
    const label = targetTag.replace(/[^\p{L}\p{N}_-]/gu, "");
    return `RestedXP-Guide-${label}.txt`;
  }

  return { battleTag, open, rebuild, fileName };
})();
