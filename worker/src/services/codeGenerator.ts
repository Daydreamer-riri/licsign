const FRIENDLY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateActivationCode(prefix?: string | null): string {
  const groups: string[] = [];
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  for (let groupIndex = 0; groupIndex < 4; groupIndex += 1) {
    let group = "";
    for (let charIndex = 0; charIndex < 4; charIndex += 1) {
      const byte = bytes[groupIndex * 4 + charIndex]!;
      group += FRIENDLY_ALPHABET[byte % FRIENDLY_ALPHABET.length];
    }
    groups.push(group);
  }

  return prefix ? `${prefix}-${groups.join("-")}` : groups.join("-");
}
