/**
 * 証言の詳細に並べる「出典」
 *
 * 証言がどの資料に載っていて、誰を経由して伝わったかを、出典ごとに示します（src/domain/types.ts の ClaimSource）。
 * 出典ごとに、資料の名前（資料にひもづかない出典は「資料なし」）・経由（伝えた順）・引用を並べます。
 * 聴取の本文（記事の本文・動画の文字起こし）から書き起こした出典では、引用の原文を示し、元の資料に戻れるようにします。
 * - 動画の位置を持つ引用で、聴取のURLが YouTube の動画であれば、その時点から再生するリンクを置きます。
 * - それ以外で聴取がURLを持つ場合は、資料を開くリンクを置きます。
 * - 引用の原文は、時刻だけの行を除いて示します（動画の位置は、リンクの文言で示すためです）。
 * - 引用の原文が聴取の本文に見つからない場合（本文をあとから書き換えた場合など）は、黙って無視せず、見つからないことを示します。
 * 照らし合わせは src/domain/transcript.ts の checkSourceQuote が行います。
 *
 * 注意: 出典を持たない証言では、何も表示しません。
 */
'use client';

import { formatInterviewLabel } from '@/domain/interviews';
import { checkSourceQuote, formatQuoteSeconds, stripTimestampLines, youtubeUrlAt } from '@/domain/transcript';
import type { ClaimQuote, ClaimSource, Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';

/** この欄の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '出典';

/** 外部の資料を開くリンクに付ける属性です。開いた先のページから、このアプリのページを操作されないようにします。 */
const EXTERNAL_LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' } as const;

const LINK_CLASS = 'text-xs underline underline-offset-2 hover:no-underline';

export function SourcesSection({ claimId }: { claimId: Id }) {
  const currentCase = useCurrentCase();
  const claim = currentCase.claims.find((candidate) => candidate.id === claimId);
  const sources = claim?.sources ?? [];
  if (sources.length === 0) return null;

  return (
    <section aria-label={SECTION_LABEL} className="space-y-3">
      <h3 className="text-sm font-semibold">{SECTION_LABEL}</h3>
      {sources.map((source, index) => (
        // 資料を持たない出典は複数ありうるため、資料のIDが無い場合は並びの位置で区別する
        <SourceItem key={source.interviewId ?? `no-interview-${index}`} source={source} />
      ))}
    </section>
  );
}

/** 出典1件です。資料の名前・経由・引用の原文・元の資料へのリンク・本文との照らし合わせの結果を示します。 */
function SourceItem({ source }: { source: ClaimSource }) {
  const currentCase = useCurrentCase();
  const interview = currentCase.interviews.find((candidate) => candidate.id === source.interviewId);
  const interviewLabel = interview === undefined ? '資料なし' : formatInterviewLabel(currentCase, interview);
  const viaNames = source.viaPersonIds.map((id) => {
    const person = currentCase.persons.find((candidate) => candidate.id === id);
    // ケースの検証（src/domain/case-schema.ts）で経由の人物の存在を確かめているため、見つからないのは不整合である
    if (person === undefined) throw new Error(`経由の人物が見つかりません: ${id}`);
    return person.name;
  });

  return (
    <div role="group" aria-label={`${interviewLabel} の出典`} className="space-y-1">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium">{interviewLabel}</span>
        {viaNames.length > 0 && <span className="ml-2">経由: {viaNames.join(' → ')}</span>}
      </p>
      {source.quote !== undefined ? (
        <SourceQuote source={source} quote={source.quote} />
      ) : (
        interview?.url !== undefined && (
          <a href={interview.url} {...EXTERNAL_LINK_PROPS} className={LINK_CLASS}>
            資料を開く
          </a>
        )
      )}
    </div>
  );
}

/** 出典1件の引用です。引用の原文・元の資料へのリンク・本文との照らし合わせの結果を示します。 */
function SourceQuote({ source, quote }: { source: ClaimSource; quote: ClaimQuote }) {
  const currentCase = useCurrentCase();
  const interview = currentCase.interviews.find((candidate) => candidate.id === source.interviewId);
  const check = checkSourceQuote(currentCase, source);
  const videoUrl = interview?.url !== undefined && quote.seconds !== undefined ? youtubeUrlAt(interview.url, quote.seconds) : undefined;

  return (
    <>
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
    </>
  );
}
