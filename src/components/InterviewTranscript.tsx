/**
 * 聴取の本文（記事の本文・動画の文字起こし）の表示と、本文の範囲からの証言の書き起こし
 *
 * 資料のカード（InterviewCard）で、本文を持つ聴取の下に表示します。
 * - collapsesLongText を渡すと（人物の詳細の「供述の変遷」）、長い本文（isLongTranscript）の見た目を省略し、
 *   「全文を表示」で展開、「折りたたむ」で省略に戻します。展開した本文は、高さを制限せずに全文を並べます。
 *   渡さない場合（資料の詳細）は、本文を省略せず、高さを制限した枠の中でスクロールして読みます
 *   （埋め込みプレーヤーを画面に残したまま、本文の時刻の行を押せるようにするためです）。
 * - 本文のうち、証言として書き起こした範囲（証言の引用）を、その証言へのリンクとして示します。
 *   重なり合う引用は、重なった範囲から最初の証言へ移ります（区切り方は src/domain/transcript.ts の buildTranscriptSegments）。
 * - 本文の範囲を選んで「選んだ範囲を証言にする」を押すと、選んだ範囲を引用として onQuote に渡します。
 *   動画の文字起こしでは、選んだ範囲の直前にある時刻を、動画の位置として補います（quoteSecondsAt）。
 * - onSeek を渡すと（資料の詳細で YouTube の動画を埋め込んでいる場合）、本文の時刻だけの行を、動画をその位置から再生するボタンにします。
 *   書き起こした範囲（証言へのリンク）の中の時刻の行は、リンクの中にボタンを置けないため、ボタンにしません。
 * - 「証言の候補を抽出」を押すと、選んだ範囲（選んでいなければ本文の全文）から LLM で証言の候補を抽出する画面（ClaimExtraction）を開きます。
 *
 * 注意: 選択の範囲は document の selectionchange で追い、本文の中だけを選んでいるときに限ってボタンを押せるようにします。
 * ボタンを押したときに選択が外れないよう、ボタンの mousedown の既定の動作を止めます。
 * 本文の中の位置は、本文を描いた要素の先頭から選択の始まりまでの文字数で求めるため、本文の要素には本文以外の文字を描かないでください
 * （時刻の行のボタンも、時刻の行の文字だけを描き、読み上げの名前は aria-label で付けます）。
 */
'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { claimLabelOf, type ClaimView } from '@/domain/case-views';
import { buildTranscriptSegments, formatQuoteSeconds, isLongTranscript, quoteSecondsAt, splitTimestampLines } from '@/domain/transcript';
import type { ClaimQuote, Id } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { ClaimExtraction, type ExtractionSource } from './ClaimExtraction';
import { claimHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

type InterviewTranscriptProps = {
  /** 本文を持つ聴取のIDです。証言の候補の抽出に使います。 */
  interviewId: Id;
  /** 聴取の本文です。 */
  transcript: string;
  /** この聴取で得た証言です。引用を持つ証言の引用を、本文の中に示します。 */
  claims: ClaimView[];
  /** 本文の領域の名前です（例「1998年8月13日 10:00の資料の本文」）。 */
  label: string;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
  /** 「選んだ範囲を証言にする」を押したときに、選んだ範囲を引用として呼び出します。 */
  onQuote: (quote: ClaimQuote) => void;
  /** 本文の時刻の行を押したときに、その秒数で呼び出します。渡さない場合は、時刻の行をボタンにしません。 */
  onSeek?: (seconds: number) => void;
  /** 長い本文の見た目を省略し、「全文を表示」で展開できるようにするかどうかです。省略すると、省略せずに枠の中でスクロールします。 */
  collapsesLongText?: boolean;
};

/**
 * 本文の枠の高さの指定です。
 * - scroll: 省略しない本文。高さを制限し、枠の中でスクロールします。
 * - collapsed: 省略中の長い本文。先頭の数行だけを見せます。
 * - full: 短い本文と、展開した長い本文。高さを制限しません。
 */
const TEXT_HEIGHT_CLASSES = {
  scroll: 'max-h-80 overflow-y-auto',
  collapsed: 'max-h-40 overflow-hidden',
  full: '',
} as const;

/** 動画を seconds 秒目から再生するボタンの、読み上げのための名前です（例「0:05から動画を再生」）。 */
export function seekLabelOf(seconds: number): string {
  return `${formatQuoteSeconds(seconds)}から動画を再生`;
}

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

export function InterviewTranscript({
  interviewId,
  transcript,
  claims,
  label,
  tab,
  onQuote,
  onSeek,
  collapsesLongText = false,
}: InterviewTranscriptProps) {
  const caseId = useCaseId();
  const textRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  const [isExpanded, setIsExpanded] = useState(false);
  const isCollapsible = collapsesLongText && isLongTranscript(transcript);
  const textHeight = !collapsesLongText ? 'scroll' : isCollapsible && !isExpanded ? 'collapsed' : 'full';
  // 省略中は、見えない行のリンクやボタンに Tab キーで移らないよう、本文の中の操作できる要素をフォーカスの順から外す（展開すると移れる）
  const focusableTabIndex = textHeight === 'collapsed' ? -1 : undefined;
  const [selectedQuote, setSelectedQuote] = useState<ClaimQuote | undefined>(undefined);
  /** 証言の候補の抽出に送る本文です。押すたびに作り直すため、何回目に押したかも持ちます。 */
  const [extraction, setExtraction] = useState<{ source: ExtractionSource; count: number } | null>(null);

  const openExtraction = () =>
    setExtraction((current) => ({
      source: selectedQuote ? { text: selectedQuote.text, scope: 'selection' } : { text: transcript, scope: 'all' },
      count: (current?.count ?? 0) + 1,
    }));

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

  /** 書き起こしていない範囲を描きます。onSeek を渡された場合は、時刻だけの行を、その位置から再生するボタンにします。 */
  const renderPlainText = (text: string, key: number) => {
    if (onSeek === undefined) return <span key={key}>{text}</span>;
    return (
      <span key={key}>
        {splitTimestampLines(text).map(({ text: partText, seconds }, partIndex) =>
          seconds === undefined ? (
            partText
          ) : (
            <button
              key={partIndex}
              type="button"
              aria-label={seekLabelOf(seconds)}
              tabIndex={focusableTabIndex}
              onClick={() => onSeek(seconds)}
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              {partText}
            </button>
          )
        )}
      </span>
    );
  };

  return (
    <section aria-label={label} className="space-y-2">
      <div className="relative">
        <div
          ref={textRef}
          id={textId}
          data-testid="transcript-text"
          className={`${TEXT_HEIGHT_CLASSES[textHeight]} whitespace-pre-wrap rounded border bg-background p-2 text-sm leading-relaxed`}
        >
          {segments.map((segment, index) => {
            const [firstClaimId] = segment.claimIds;
            const view = firstClaimId === undefined ? undefined : viewOf(firstClaimId);
            if (view === undefined) return renderPlainText(segment.text, index);
            return (
              <Link
                key={index}
                href={claimHref(caseId, view.claim.id, tab)}
                aria-label={`書き起こした証言: ${claimLabelOf(view)}`}
                tabIndex={focusableTabIndex}
                className="rounded-sm bg-mention-place/40 underline decoration-dotted underline-offset-2"
              >
                {segment.text}
              </Link>
            );
          })}
        </div>
        {textHeight === 'collapsed' && (
          // 続きがあることを示すため、省略した本文の下端を薄くする（本文の位置の計算に入らないよう、本文の要素の外に置く）
          <div aria-hidden className="pointer-events-none absolute inset-x-px bottom-px h-10 rounded-b bg-linear-to-t from-background" />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {isCollapsible && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={textId}
            onClick={() => setIsExpanded((current) => !current)}
            className="mr-auto"
          >
            {isExpanded ? '折りたたむ' : '全文を表示'}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          // 押したときに本文の選択が外れないよう、フォーカスの移動と選択の変更を止める
          onMouseDown={(event) => event.preventDefault()}
          onClick={openExtraction}
        >
          証言の候補を抽出
        </Button>
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
      {extraction && (
        <ClaimExtraction
          key={extraction.count}
          interviewId={interviewId}
          source={extraction.source}
          onClose={() => setExtraction(null)}
        />
      )}
    </section>
  );
}
