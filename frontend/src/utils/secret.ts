import secrets from "secrets.js-grempe";

/**
 * 메시지를 N개의 조각으로 분할합니다.
 */
export function splitMessage(message: string, numShares: number, threshold: number): string[] {
  const hexMessage = secrets.str2hex(message);
  return secrets.share(hexMessage, numShares, threshold);
}

/**
 * 여러 조각을 결합해 원본 메시지로 복원합니다.
 */
export function combineMessage(shares: string[]): string {
  try {
    const combinedHex = secrets.combine(shares);
    return secrets.hex2str(combinedHex);
  } catch (error) {
    console.error("메시지 복원 실패:", error);
    return "메시지 복원 실패";
  }
}
