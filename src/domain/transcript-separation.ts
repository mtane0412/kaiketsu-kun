/**
 * 資料の本文（Interview.transcript）を、ケースから取り除くロジック
 *
 * 資料の本文は、ケースの中で最も大きく、また有料の記事データベースから写したものなど、共有してはいけない場合があるデータです。
 * 次の2か所で、本文を除いたケースを作ります。
 * - ブラウザへの保存: 本文をケースの本体とは別のストアに保存するため（src/lib/case-storage.ts）
 * - JSONの書き出し: 共有用のJSONに本文を含めないことを選べるようにするため（src/components/CaseSettingsMenu.tsx）
 */
import type { Case } from './types';

/** 資料の本文を取り除いたケースを返します。資料のほかの項目（タイトル・URLなど）と、証言の引用は残します。 */
export function withoutTranscripts(target: Case): Case {
  return {
    ...target,
    interviews: target.interviews.map(({ transcript: _transcript, ...interview }) => interview),
  };
}
