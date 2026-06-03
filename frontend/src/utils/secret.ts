import secrets from 'secrets.js-grempe';

/**
 * 메시지를 분할하여 N개의 조각(Share)으로 만듭니다.
 * @param message 원본 문자열 메시지
 * @param numShares 나눌 조각의 총 개수 (예: 3)
 * @param threshold 복원에 필요한 최소 조각 개수 (예: 2)
 * @returns 16진수 문자열로 이루어진 조각 배열
 */
export function splitMessage(message: string, numShares: number, threshold: number): string[] {
  // 한글 등 멀티바이트 문자를 지원하기 위해 UTF-8 문자열을 Hex로 변환
  const hexMessage = secrets.str2hex(message);
  return secrets.share(hexMessage, numShares, threshold);
}

/**
 * 여러 조각(Share)을 모아 원본 메시지로 복원합니다.
 * @param shares 16진수 문자열 조각들의 배열
 * @returns 복원된 원본 문자열 (실패 시 에러 발생)
 */
export function combineMessage(shares: string[]): string {
  try {
    const combinedHex = secrets.combine(shares);
    return secrets.hex2str(combinedHex);
  } catch (error) {
    console.error("복원 실패:", error);
    return "메시지 복원 실패 (조각 부족 또는 변조됨)";
  }
}
