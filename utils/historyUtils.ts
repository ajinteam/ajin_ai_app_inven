import { Transaction } from '../types';

/**
 * transaction의 remarks와 historyRemarks를 종합 분석하여,
 * 1) 순수 사용자 참고사항(userRemarks)
 * 2) 반품/원복/재판매/폐기 등 상태 변경 이력(historyRemarks 및 historyList)
 * 을 깔끔하게 분리하여 반환합니다.
 */
export function extractRemarksAndHistory(transaction: Partial<Transaction> | undefined | null): {
  userRemarks: string;
  historyRemarks: string;
  historyList: string[];
} {
  if (!transaction) {
    return { userRemarks: '', historyRemarks: '', historyList: [] };
  }

  const rawRemarks = (transaction.remarks || '').trim();
  const rawHistory = (transaction.historyRemarks || '').trim();

  // 기존 remarks 문자열이 슬래시(/)나 줄바꿈으로 분리되어 있을 수 있음
  const tokens = rawRemarks
    .split(/\s*\/\s*|\n+/)
    .map(s => s.trim())
    .filter(Boolean);

  const historyKeywords = ['반품:', '반품 사유:', '복원:', '원복:', '재판매:', '폐기:', '폐기('];
  const extractedHistories: string[] = [];
  const userTokens: string[] = [];

  for (const token of tokens) {
    const isHistory = historyKeywords.some(kw => token.startsWith(kw) || token.includes('폐기('));
    if (isHistory) {
      extractedHistories.push(token);
    } else {
      userTokens.push(token);
    }
  }

  const existingHistoryTokens = rawHistory
    ? rawHistory.split(/\s*\/\s*|\n+/).map(s => s.trim()).filter(Boolean)
    : [];

  // 중복 없이 historyList 생성
  const combinedHistoryTokens = Array.from(new Set([...existingHistoryTokens, ...extractedHistories]));

  return {
    userRemarks: userTokens.join(' / ').trim(),
    historyRemarks: combinedHistoryTokens.join(' / ').trim(),
    historyList: combinedHistoryTokens
  };
}

/**
 * 기존 히스토리에 새로운 상태 이력 항목을 추가합니다.
 */
export function appendHistory(existingHistory: string | undefined | null, newEntry: string): string {
  const cleanEntry = newEntry.trim();
  if (!cleanEntry) return existingHistory || '';
  if (!existingHistory || !existingHistory.trim()) return cleanEntry;
  return `${existingHistory.trim()} / ${cleanEntry}`;
}
