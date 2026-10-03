/**
 * 聴取の本文（記事の本文・動画の文字起こし）の表示と、本文の範囲からの証言の書き起こし
 *
 * 人物の詳細の「供述の変遷」（InterviewSection）で、本文を持つ聴取の下に開きます。
 * - 本文のうち、証言として書き起こした範囲（証言の引用）を、その証言へのリンクとして示します。
 *   重なり合う引用は、重なった範囲から最初の証言へ移ります（区切り方は src/domain/transcript.ts の buildTranscriptSegments）。
 * - 本文の範囲を選んで「選んだ範囲を証言にする」を押すと、選んだ範囲を引用として onQuote に渡します。
 *   動画の文字起こしでは、選んだ範囲の直前にある時刻を、動画の位置として補います（quoteSecondsAt）。
 *
 * 注意: 選択の範囲は document の selectionchange で追い、本文の中だけを選んでいるときに限ってボタンを押せるようにします。
 * ボタンを押したときに選択が外れないよう、ボタンの mousedown の既定の動作を止めます。
 * 本文の中の位置は、本文を描いた要素の先頭から選択の始まりまでの文字数で求めるため、本文の要素には本文以外の文字を描かないでください。
 */
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { claimLabelOf, type ClaimView } from '@/domain/case-views';
import { buildTranscriptSegments, quoteSecondsAt } from '@/domain/transcript';
import type { ClaimQuote } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { claimHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

type InterviewTranscriptProps = {
  /** 聴取の本文です。 */
  transcript: string;
  /** この聴取で得た証言です。引用を持つ証言の引用を、本文の中に示します。 */
  claims: ClaimView[];
  /** 本文の領域の名前です（例「1998年8月13日 10:00の聴取の本文」）。 */
  label: string;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
  /** 「選んだ範囲を証言にする」を押したときに、選んだ範囲を引用として呼び出します。 */
  onQuote: (quote: ClaimQuote) => void;
};

/**
 * 要素の中だけを選んでいる場合に、選択の範囲を本文の中の引用として返します。
 * 何も選んでいない場合、選択が要素の外にかかる場合、空白だけを選んでいる場合は undefined です。
 * 選んだ範囲の前後の空白は、引用に含めません。
 */
function quoteFromSelection(container: HTMLElement, transcript: string): ClaimQuote | undefined {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return undefined;

  // 要素の先頭から選択の始まりまでの文字数が、本文の中での選択の始まりの位置になる
  const beforeSelection = document.createRange();
  beforeSelection.selectNodeContents(container);
  beforeSelection.setEnd(range.startContainer, range.startOffset);
  const selectedText = range.toString();
  const leadingSpaces = selectedText.length - selectedText.trimStart().length;
  const text = selectedText.trim();
  if (text === '') return undefined;

  const start = beforeSelection.toString().length + leadingSpaces;
  const seconds = quoteSecondsAt(transcript, start);
  return { text, ...(seconds !== undefined && { seconds }) };
}

export function InterviewTranscript({ transcript, claims, label, tab, onQuote }: InterviewTranscriptProps) {
  const caseId = useCaseId();
  const textRef = useRef<HTMLDivElement>(null);
  const [selectedQuote, setSelectedQuote] = useState<ClaimQuote | undefined>(undefined);

  useEffect(() => {
    const handleSelectionChange = () => {
      const container = textRef.current;
      setSelectedQuote(container === null ? undefined : quoteFromSelection(container, transcript));
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [transcript]);

  const quotedClaims = claims.flatMap((view) => (view.claim.quote ? [{ view, text: view.claim.quote.text }] : []));
  const segments = buildTranscriptSegments(
    transcript,
    quotedClaims.map(({ view, text }) => ({ claimId: view.claim.id, text }))
  );
  const viewOf = (claimId: string) => quotedClaims.find(({ view }) => view.claim.id === claimId)?.view;

  return (
    <section aria-label={label} className="space-y-2">
      <div
        ref={textRef}
        data-testid="transcript-text"
        className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded border bg-background p-2 text-sm leading-relaxed"
      >
        {segments.map((segment, index) => {
          const [firstClaimId] = segment.claimIds;
          const view = firstClaimId === undefined ? undefined : viewOf(firstClaimId);
          if (view === undefined) return <span key={index}>{segment.text}</span>;
          return (
            <Link
              key={index}
              href={claimHref(caseId, view.claim.id, tab)}
              aria-label={`書き起こした証言: ${claimLabelOf(view)}`}
              className="rounded-sm bg-mention-place/40 underline decoration-dotted underline-offset-2"
            >
              {segment.text}
            </Link>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={selectedQuote === undefined}
          // 押したときに本文の選択が外れないよう、フォーカスの移動と選択の変更を止める
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectedQuote && onQuote(selectedQuote)}
        >
          選んだ範囲を証言にする
        </Button>
      </div>
    </section>
  );
}
