/**
 * 人物の詳細に並べる「供述の変遷」
 *
 * その人物が相手の聴取（Interview。証言を得た機会）を日時の早い順に並べ、各聴取の下に、その聴取で得た証言を並べます。
 * 初回の供述と後の供述の食い違いを、聴取ごとに見比べられるようにするためです（導出は src/domain/interviews.ts）。
 * 聴取の登録・編集・削除もこの節で行います（InterviewForm）。聴取の相手は、開いている人物に固定します。
 *
 * 各聴取の「この聴取の証言を書き足す」は、聴取と、聴取の相手を発言者に選んだ状態の証言の入力欄（ClaimForm の compact）を開きます。
 * 同じ聴取の証言を続けて書くときに、聴取と発言者を選び直す手間を省くためです。
 *
 * 本文（記事の本文・動画の文字起こし）を持つ聴取は、「本文を開く」で本文を表示し、範囲を選んで証言を書き起こせます（InterviewTranscript）。
 * 書き起こしの入力欄は、「この聴取の証言を書き足す」と同じ入力欄に、選んだ範囲を引用として渡して開きます。
 * URLを持つ聴取には、資料を新しいタブで開くリンクを置きます。
 *
 * 注意: 証言がひもづいている聴取は削除できません（参照の整合性の検証で拒否され、理由を表示します）。
 * 入力欄は同時に1つだけ開きます。編集対象を切り替えるたびにフォームを作り直せるよう、フォームには対象のIDを key に渡します。
 */
'use client';

import { useState } from 'react';
import { buildPersonInterviews, UNKNOWN_INTERVIEW_TIME_LABEL, type PersonInterviewView } from '@/domain/interviews';
import { formatTimeRef } from '@/domain/time-ref';
import type { ClaimQuote, Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { ClaimForm } from './forms/ClaimForm';
import { InterviewForm } from './forms/InterviewForm';
import { InterviewTranscript } from './InterviewTranscript';
import { FormError } from './forms/fields';
import type { TabKey } from './routes';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '供述の変遷';

/** 入力欄の状態です。編集・書き足しの場合は対象の聴取のIDを、本文から書き起こす場合は選んだ引用も持ちます。 */
type FormState =
  | { kind: 'closed' }
  | { kind: 'new' }
  | { kind: 'edit'; interviewId: Id }
  | { kind: 'compose'; interviewId: Id; quote?: ClaimQuote };

const CLOSED: FormState = { kind: 'closed' };

/** 聴取の見出し（日時）を返します。日時の分からない聴取は「日時不明」です。 */
function timeLabelOf(view: PersonInterviewView): string {
  return view.interview.at === undefined ? UNKNOWN_INTERVIEW_TIME_LABEL : formatTimeRef(view.interview.at);
}

/** 聴取者・場所・立場・資料番号のうち、入力済みのものを「 / 」でつないだ説明を返します。1つも無い場合は空文字列です。 */
function describeInterview(view: PersonInterviewView): string {
  return [
    view.interviewer && `聴取者: ${view.interviewer.name}`,
    view.place && `場所: ${view.place.name}`,
    view.interview.subjectRole && `立場: ${view.interview.subjectRole}`,
    view.interview.documentRef && `資料: ${view.interview.documentRef}`,
  ]
    .filter(Boolean)
    .join(' / ');
}

type InterviewSectionProps = {
  personId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function InterviewSection({ personId, tab }: InterviewSectionProps) {
  const currentCase = useCurrentCase();
  const remove = useCaseStore((state) => state.remove);
  const [form, setForm] = useState<FormState>(CLOSED);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** 本文を開いている聴取のIDです。 */
  const [openTranscriptIds, setOpenTranscriptIds] = useState<ReadonlySet<Id>>(new Set());

  const interviews = buildPersonInterviews(currentCase, personId);
  const close = () => setForm(CLOSED);
  const toggleTranscript = (interviewId: Id) =>
    setOpenTranscriptIds((current) => {
      const next = new Set(current);
      if (!next.delete(interviewId)) next.add(interviewId);
      return next;
    });

  const handleDelete = (interviewId: Id) => {
    setDeleteError(null);
    try {
      remove('interviews', interviewId);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">聴取{interviews.length}件</span>
      </h3>

      {interviews.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          「聴取を追加」から、この人物の供述を得た機会（いつ・誰が・どの場で聴き取ったか）を登録できます。
        </p>
      ) : (
        <ol className="space-y-2">
          {interviews.map((view) => {
            const timeLabel = timeLabelOf(view);
            const description = describeInterview(view);
            const isTarget = (kind: FormState['kind']) =>
              form.kind === kind && 'interviewId' in form && form.interviewId === view.interview.id;

            return (
              <li key={view.interview.id} className="space-y-2 rounded-lg border bg-card p-3">
                <h4 className="text-sm font-medium">{timeLabel}</h4>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
                {view.interview.url && (
                  <a
                    href={view.interview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${timeLabel}の聴取の資料を開く`}
                    className="block truncate text-xs underline underline-offset-2 hover:no-underline"
                  >
                    {view.interview.url}
                  </a>
                )}
                {view.interview.transcript !== undefined && openTranscriptIds.has(view.interview.id) && (
                  <InterviewTranscript
                    transcript={view.interview.transcript}
                    claims={view.claims}
                    label={`${timeLabel}の聴取の本文`}
                    tab={tab}
                    onQuote={(quote) => setForm({ kind: 'compose', interviewId: view.interview.id, quote })}
                  />
                )}

                {view.claims.length === 0 ? (
                  <p className="text-xs text-muted-foreground">この聴取にひもづく証言は、まだありません。</p>
                ) : (
                  <ul className="space-y-1">
                    {view.claims.map((claimView) => (
                      <li key={claimView.claim.id}>
                        <ClaimLink view={claimView} tab={tab} />
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {view.interview.transcript !== undefined && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`${timeLabel}の聴取の本文を${openTranscriptIds.has(view.interview.id) ? '閉じる' : '開く'}`}
                      aria-expanded={openTranscriptIds.has(view.interview.id)}
                      onClick={() => toggleTranscript(view.interview.id)}
                    >
                      {openTranscriptIds.has(view.interview.id) ? '本文を閉じる' : '本文を開く'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${timeLabel}の聴取の証言を書き足す`}
                    onClick={() => setForm({ kind: 'compose', interviewId: view.interview.id })}
                  >
                    この聴取の証言を書き足す
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${timeLabel}の聴取を編集`}
                    onClick={() => setForm({ kind: 'edit', interviewId: view.interview.id })}
                  >
                    編集
                  </Button>
                  <DeleteConfirmButton
                    iconOnly
                    label={`${timeLabel}の聴取を削除`}
                    title={`${timeLabel}の聴取を削除しますか？`}
                    description="この聴取をケースから削除します。この操作は取り消せません。証言がひもづいている聴取は削除できません。"
                    onConfirm={() => handleDelete(view.interview.id)}
                  />
                </div>

                {isTarget('edit') && (
                  <section aria-label="聴取の編集" className="border-t pt-3">
                    <InterviewForm
                      key={view.interview.id}
                      subjectPersonId={personId}
                      initial={view.interview}
                      onDone={close}
                      onCancel={close}
                    />
                  </section>
                )}
                {isTarget('compose') && (
                  <section aria-label="聴取の証言の書き足し" className="border-t pt-3">
                    <ClaimForm
                      // 別の範囲を選び直したときに、本文と引用の初期値を作り直すため、引用も key に含める
                      key={`${view.interview.id}:${form.kind === 'compose' ? (form.quote?.text ?? '') : ''}`}
                      defaults={{ interviewId: view.interview.id, ...(form.kind === 'compose' && form.quote && { quote: form.quote }) }}
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
              </li>
            );
          })}
        </ol>
      )}

      <FormError message={deleteError} />

      {form.kind === 'new' ? (
        <section aria-label="聴取の登録" className="rounded-lg border bg-card p-3">
          <InterviewForm subjectPersonId={personId} onDone={close} onCancel={close} />
        </section>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setForm({ kind: 'new' })}>
          聴取を追加
        </Button>
      )}
    </section>
  );
}
