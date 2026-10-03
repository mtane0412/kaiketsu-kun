/**
 * 証言の詳細に並べる「引用」
 *
 * 聴取の本文（記事の本文・動画の文字起こし）から書き起こした証言の、引用の原文を示し、元の資料に戻れるようにします。
 * - 動画の位置を持つ引用で、聴取のURLが YouTube の動画であれば、その時点から再生するリンクを置きます。
 * - それ以外で聴取がURLを持つ場合は、資料を開くリンクを置きます。
 * - 引用の原文は、時刻だけの行を除いて示します（動画の位置は、リンクの文言で示すためです）。
 * - 引用の原文が聴取の本文に見つからない場合（本文をあとから書き換えた場合など）は、黙って無視せず、見つからないことを示します。
 * 照らし合わせは src/domain/transcript.ts の checkClaimQuote が行います。
 *
 * 注意: 引用を持たない証言では、何も表示しません。
 */
'use client';

import { checkClaimQuote, formatQuoteSeconds, stripTimestampLines, youtubeUrlAt } from '@/domain/transcript';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';

/** この欄の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '引用';

/** 外部の資料を開くリンクに付ける属性です。開いた先のページから、このアプリのページを操作されないようにします。 */
const EXTERNAL_LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' } as const;

const LINK_CLASS = 'text-xs underline underline-offset-2 hover:no-underline';

export function QuoteSection({ claimId }: { claimId: Id }) {
  const currentCase = useCurrentCase();
  const claim = currentCase.claims.find((candidate) => candidate.id === claimId);
  if (claim?.quote === undefined) return null;

  const { quote } = claim;
  const interview = currentCase.interviews.find((candidate) => candidate.id === claim.interviewId);
  const check = checkClaimQuote(currentCase, claim);
  const videoUrl = interview?.url !== undefined && quote.seconds !== undefined ? youtubeUrlAt(interview.url, quote.seconds) : undefined;

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">{SECTION_LABEL}</h3>
      <blockquote className="whitespace-pre-line border-l-2 pl-3 text-sm text-muted-foreground">
        {/* 時刻だけの行は、動画の位置のリンクと重なるため除いて示す（保存する原文は、本文と照らし合わせるためそのまま持つ） */}
        {stripTimestampLines(quote.text)}
      </blockquote>
      {videoUrl !== undefined && quote.seconds !== undefined ? (
        <a href={videoUrl} {...EXTERNAL_LINK_PROPS} className={LINK_CLASS}>
          {formatQuoteSeconds(quote.seconds)} から動画を開く
        </a>
      ) : (
        interview?.url !== undefined && (
          <a href={interview.url} {...EXTERNAL_LINK_PROPS} className={LINK_CLASS}>
            資料を開く
          </a>
        )
      )}
      {check === 'notFound' && (
        <p className="text-xs text-destructive">
          この引用は、資料の本文に見つかりません。本文を書き換えた場合は、引用を外すか、本文から選び直してください。
        </p>
      )}
      {check === 'noTranscript' && (
        <p className="text-xs text-muted-foreground">資料の本文が無いため、引用を本文と照らし合わせられません。</p>
      )}
    </section>
  );
}
