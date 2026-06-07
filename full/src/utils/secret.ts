import secrets from "secrets.js-grempe";

export function splitMessage(message: string, numShares: number, threshold: number): string[] {
  const hexMessage = secrets.str2hex(message);
  return secrets.share(hexMessage, numShares, threshold);
}

export function combineMessage(shares: string[]): string {
  try {
    const combinedHex = secrets.combine(shares);
    return secrets.hex2str(combinedHex);
  } catch (error) {
    console.error("메시지 복원 실패:", error);
    return "메시지 복원 실패";
  }
}
