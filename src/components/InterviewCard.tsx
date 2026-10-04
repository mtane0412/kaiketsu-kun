/**
 * 資料（聴取。Interview）1件のカード
 *
 * 人物の詳細の「供述の変遷」（InterviewSection）と、資料の詳細（InterviewDetail）で、同じ資料を同じ形で表示するための部品です。
 * 日時の見出し・聴取者などの説明・URL・本文・ひもづく証言を並べ、資料に対する次の操作をこのカードの中で行います。
 * - 「この資料の証言を書き足す」: 資料を選んだ状態の証言の入力欄（ClaimForm の compact）を開きます。
 *   同じ資料の証言を続けて書くときに、資料と発言者を選び直す手間を省くためです。
 *   speakerPersonId を渡した場合（人物の詳細から開いた場合）は、その人物を発言者に選んでおきます。
 *   渡さない場合は、発言者を選ばずにおきます（資料には何人もの発言が載る場合があるためです）。
 * - 本文を持つ資料は、「本文を開く」で本文を表示し、範囲を選んで証言を書き起こせます（InterviewTranscript）。
 *   資料の詳細では、読みながら証言を拾えるよう、本文を最初から開いておきます（opensTranscript）。
 *   本文の無い資料では、資料の詳細に、本文を貼り付けると証言を書き起こせることを示します。
 *   書き起こしの入力欄は、「この資料の証言を書き足す」と同じ入力欄に、選んだ範囲を引用として渡して開きます。
 *   本文から LLM で証言の候補を抽出する画面（ClaimExtraction）も、本文の下に開きます（InterviewTranscript の「証言の候補を抽出」）。
 * - 編集（InterviewForm）と削除。
 * URLを持つ資料には、URLを新しいタブで開くリンクを置きます。
 * YouTube の動画の資料では、embedsVideo を渡すと、動画を埋め込みプレーヤーで表示します（資料の詳細で指定します）。
 * 人物の詳細の「供述の変遷」では、資料が並ぶたびにプレーヤーを読み込むと重くなるため、埋め込みません。
 * 動画を埋め込んでいる場合は、ひもづく証言の引用の時刻と、本文の時刻の行を押すと、プレーヤーをその位置から再生します。
 * 再生の位置は埋め込みプレーヤーのURL（start）で指定し、押すたびにプレーヤーを読み込み直します。
 * 人物の詳細の「供述の変遷」では、資料の詳細へのリンクを資料の名前（タイトルかURL）で置き、発言者が複数の資料には発言者の全員を示します
 * （資料の詳細では、見出しと「発言者」の欄で示すため、showsSource に false を渡して省きます）。
 *
 * 注意: 証言がひもづいている資料は削除できません（参照の整合性の検証で拒否され、理由を表示します）。
 * 入力欄（編集・書き足し）は、カードの中で同時に1つだけ開きます。
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UNKNOWN_INTERVIEW_TIME_LABEL, UNTITLED_INTERVIEW_LABEL, type InterviewView } from '@/domain/interviews';
import { formatTimeRef } from '@/domain/time-ref';
import { formatQuoteSeconds, youtubeEmbedUrl } from '@/domain/transcript';
import type { ClaimQuote, Id } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { ClaimForm } from './forms/ClaimForm';
import { FormError } from './forms/fields';
import { InterviewForm } from './forms/InterviewForm';
import { InterviewTranscript, seekLabelOf } from './InterviewTranscript';
import { interviewHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** 入力欄の状態です。本文から書き起こす場合は、選んだ引用も持ちます。 */
type FormState = { kind: 'closed' } | { kind: 'edit' } | { kind: 'compose'; quote?: ClaimQuote };

const CLOSED: FormState = { kind: 'closed' };

/** 埋め込みプレーヤーで再生を始める位置です。同じ位置を押し直しても読み込み直すよう、押した回数も持ちます。 */
type Playback = { seconds: number; count: number };

/** 資料の見出し（日時）を返します。日時の分からない資料は「日時不明」です。 */
function timeLabelOf(view: InterviewView): string {
  return view.interview.at === undefined ? UNKNOWN_INTERVIEW_TIME_LABEL : formatTimeRef(view.interview.at);
}

/** 聴取者・場所・立場・資料番号のうち、入力済みのものを「 / 」でつないだ説明を返します。1つも無い場合は空文字列です。 */
function describeInterview(view: InterviewView): string {
  return [
    view.interviewer && `聴取者: ${view.interviewer.name}`,
    view.place && `場所: ${view.place.name}`,
    view.interview.subjectRole && `立場: ${view.interview.subjectRole}`,
    view.interview.documentRef && `資料番号: ${view.interview.documentRef}`,
  ]
    .filter(Boolean)
    .join(' / ');
}

type InterviewCardProps = {
  view: InterviewView;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
  /** 「この資料の証言を書き足す」で、発言者に選んでおく人物です。人物の詳細から開いた場合の、開いている人物です。 */
  speakerPersonId?: Id;
  /** 資料の詳細へのリンクと、発言者が複数の資料の発言者の全員を示すかどうかです。省略すると示します。 */
  showsSource?: boolean;
  /** 本文を最初から開いておくかどうかです。資料の詳細で指定します。 */
  opensTranscript?: boolean;
  /** YouTube の動画の資料で、動画を埋め込みプレーヤーで表示するかどうかです。資料の詳細で指定します。 */
  embedsVideo?: boolean;
  /** 資料を削除できたときに呼び出します。 */
  onDeleted?: () => void;
};

export function InterviewCard({ view, tab, speakerPersonId, showsSource = true, opensTranscript = false, embedsVideo = false, onDeleted }: InterviewCardProps) {
  const caseId = useCaseId();
  const remove = useCaseStore((state) => state.remove);
  const [form, setForm] = useState<FormState>(CLOSED);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(opensTranscript);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);

  const { interview } = view;
  const timeLabel = timeLabelOf(view);
  const description = describeInterview(view);
  const embedUrl = embedsVideo && interview.url !== undefined ? youtubeEmbedUrl(interview.url, playback?.seconds) : undefined;
  /** 埋め込みプレーヤーを seconds 秒目から再生します。動画を埋め込んでいない場合は undefined です。 */
  const seekTo =
    embedUrl === undefined
      ? undefined
      : (seconds: number) => setPlayback((current) => ({ seconds, count: (current?.count ?? 0) + 1 }));
  const close = () => setForm(CLOSED);

  const handleDelete = () => {
    setDeleteError(null);
    try {
      remove('interviews', interview.id);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDeleted?.();
  };

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <h4 className="text-sm font-medium">{timeLabel}</h4>
      {showsSource && (
        <Link href={interviewHref(caseId, interview.id, tab)} className="block truncate text-xs underline underline-offset-2 hover:no-underline">
          資料: {interview.title ?? interview.url ?? UNTITLED_INTERVIEW_LABEL}
        </Link>
      )}
      {showsSource && view.speakers.length > 1 && (
        <p className="text-xs text-muted-foreground">発言者: {view.speakers.map((person) => person.name).join('、')}</p>
      )}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {interview.url && (
        <a
          href={interview.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${timeLabel}の資料のURLを開く`}
          className="block truncate text-xs underline underline-offset-2 hover:no-underline"
        >
          {interview.url}
        </a>
      )}
      {embedUrl !== undefined && (
        <iframe
          // 同じ位置を押し直した場合も再生し直すよう、押した回数で作り直す
          key={playback?.count ?? 0}
          src={embedUrl}
          title={`${timeLabel}の資料の動画`}
          className="aspect-video w-full rounded-md border"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      )}
      {interview.transcript === undefined && opensTranscript && (
        <p className="text-xs text-muted-foreground">
          「編集」から記事の本文や動画の文字起こしを貼り付けると、範囲を選んで証言を書き起こせます。
        </p>
      )}
      {interview.transcript !== undefined && isTranscriptOpen && (
        <InterviewTranscript
          interviewId={interview.id}
          transcript={interview.transcript}
          claims={view.claims}
          label={`${timeLabel}の資料の本文`}
          tab={tab}
          onQuote={(quote) => setForm({ kind: 'compose', quote })}
          onSeek={seekTo}
        />
      )}

      {view.claims.length === 0 ? (
        <p className="text-xs text-muted-foreground">この資料にひもづく証言は、まだありません。</p>
      ) : (
        <ul className="space-y-1">
          {view.claims.map((claimView) => {
            const quoteSeconds = claimView.claim.quote?.seconds;
            return (
              <li key={claimView.claim.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ClaimLink view={claimView} tab={tab} />
                </div>
                {seekTo !== undefined && quoteSeconds !== undefined && (
                  <Button type="button" variant="outline" size="sm" aria-label={seekLabelOf(quoteSeconds)} onClick={() => seekTo(quoteSeconds)}>
                    {formatQuoteSeconds(quoteSeconds)}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {interview.transcript !== undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${timeLabel}の資料の本文を${isTranscriptOpen ? '閉じる' : '開く'}`}
            aria-expanded={isTranscriptOpen}
            onClick={() => setIsTranscriptOpen((current) => !current)}
          >
            {isTranscriptOpen ? '本文を閉じる' : '本文を開く'}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${timeLabel}の資料の証言を書き足す`}
          onClick={() => setForm({ kind: 'compose' })}
        >
          この資料の証言を書き足す
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${timeLabel}の資料を編集`}
          onClick={() => setForm({ kind: 'edit' })}
        >
          編集
        </Button>
        <DeleteConfirmButton
          iconOnly
          label={`${timeLabel}の資料を削除`}
          title={`${timeLabel}の資料を削除しますか？`}
          description="この資料をケースから削除します。この操作は取り消せません。証言がひもづいている資料は削除できません。"
          onConfirm={handleDelete}
        />
      </div>

      <FormError message={deleteError} />

      {form.kind === 'edit' && (
        <section aria-label="資料の編集" className="border-t pt-3">
          <InterviewForm initial={interview} onDone={close} onCancel={close} />
        </section>
      )}
      {form.kind === 'compose' && (
        <section aria-label="資料の証言の書き足し" className="border-t pt-3">
          <ClaimForm
            // 別の範囲を選び直したときに、本文と引用の初期値を作り直すため、引用の原文と動画の位置を key に含める
            // （同じ文字列でも、別の時刻の箇所を選び直した場合は、動画の位置が変わるため）
            key={`${form.quote?.text ?? ''}:${form.quote?.seconds ?? ''}`}
            defaults={{
              interviewId: interview.id,
              ...(form.quote && { quote: form.quote }),
              ...(speakerPersonId !== undefined && { speaker: { personIds: [speakerPersonId], viaPersonIds: [] } }),
            }}
            onDone={close}
            autoFocus
            compact
            actions={
              <button type="button" onClick={close} className="text-xs text-muted-foreground hover:underline">
                やめる
              </button>
            }
          />
        </section>
      )}
    </div>
  );
}
