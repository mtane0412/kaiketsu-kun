/**
 * 証言（人物や媒体の発言・ユーザーの推測）の入力フォーム
 *
 * 入力の中心は本文の1欄です。本文に「@」で人物・場所を書くと、
 * 場所・言及している人物を本文から導出します（規則は src/domain/mention.ts を参照）。
 * 未登録の名前は候補の一覧から新規作成でき、新しいエンティティは証言と同時に保存します。
 * 本文が長い証言には、本文を要約する見出しを任意で付けられます。見出しはメンションに対応せず、参照の導出には使いません。
 * 誰の発言か、誰を経由して伝わったかは本文には書かず、投稿ボタンの横の「発言者」で選びます（SpeakerPicker）。
 * 新規登録でも編集でも選べます。発言者を選ばない証言は、ユーザーの推測です。
 * 日時も本文に書きます。「@」に続けて日時を書くと候補を示し、選ぶと日時のメンションになります
 * （受け付ける表記は src/domain/date-input.ts を参照してください）。
 * 資料内の位置（Claim.locator）は入力欄を廃止しましたが、編集時は入力済みの値を保持します。
 * 証言を得た聴取（Claim.interviewId）は、「聴取（任意）」の欄で選びます。聴取の相手は、発言者か経由のいずれかに
 * 含まれている必要があります（src/domain/case-schema.ts）。発言者も経由も選んでいない状態で聴取を選んだ場合は、
 * 聴取の相手を発言者にします。聴取の相手が自分の供述を述べる場合が最も多く、選び直す手間を省くためです。
 *
 * compact を指定すると、ボード上の入力欄として見出しと本文の欄・「発言者」・投稿ボタンだけを表示します（SNSに投稿する感覚で
 * 書けるようにするためです）。本文から読み取った参照の一覧と、書き方の案内を表示しません。
 * 新規登録時は、ボード上の書いた位置（defaults）に従って、時系列の並び順の中での位置を決めます。
 * compact では、聴取を指定して開いた場合（人物の詳細の「この聴取の証言を書き足す」）だけ、聴取の欄を表示します。
 *
 * speakerRequiredMessage を渡すと、発言者を必須にし、発言者を選ばずに保存しようとしたときにその文を表示します
 * （別の人物の反応を記録する場合など、ユーザーの推測にしてはならない場合に使います）。
 *
 * withEntries を渡すと、保存する証言のIDを使った要素（書き足した証言をひもづけた未了事項など）を、証言と同じ1回の保存で書き込みます。
 * どちらかが保存できない場合は、証言も含めて何も保存しません（ひもづけ先の無い証言だけが残らないようにするためです）。
 *
 * initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { DATE_MENTION_LABEL, MENTION_KIND_LABELS } from '@/domain/labels';
import {
  claimToDraft,
  deriveClaimLinks,
  draftToContent,
  parseContent,
  type ClaimDraft,
  type DraftMention,
  type MentionKind,
} from '@/domain/mention';
import { timelineKeyOf } from '@/domain/timeline-order';
import { formatTimeRef } from '@/domain/time-ref';
import { formatInterviewLabel } from '@/domain/interviews';
import { DEFAULT_PERSON_KIND } from '@/domain/person-kind';
import type { Claim, Id, PersonKind } from '@/domain/types';
import { useCaseStore, useCurrentCase, type UpsertEntry } from '@/stores/useCaseStore';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';
import { caseToCandidates, createEntry } from './mention-entries';
import { MentionTextarea } from './MentionTextarea';
import { SpeakerPicker, speakerToDraft, toSpeaker, type SpeakerDraft, type SpeakerPersonOption } from './SpeakerPicker';

/**
 * ボード上の書いた位置から決まる初期値です。新規登録でのみ使用します。
 */
export type ClaimDefaults = {
  /** 項目と項目の間で書いた場合の、時系列の並び順の中での位置（0始まり）です。保存した証言を、この位置に並べます。 */
  insertIndex?: number;
  /**
   * 証言を得た聴取のIDです。指定すると、聴取と、聴取の相手を発言者に選んだ状態で始めます。
   * 同じ聴取の証言を続けて書き足すときに、聴取を引き継ぐために使います。
   */
  interviewId?: Id;
};

/** 聴取を選ばない場合の、選択肢の値です。 */
const NO_INTERVIEW = '';

type ClaimFormProps = {
  initial?: Claim;
  defaults?: ClaimDefaults;
  /** 保存できたときに、保存した証言のIDで呼び出します。 */
  onDone: (claimId: Id) => void;
  /** 内容欄に初期フォーカスを置くかどうかです。ボード上で開いた入力欄にすぐ書き始められるようにします。 */
  autoFocus?: boolean;
  /** 見出しと本文の欄・「発言者」・投稿ボタンだけを表示するかどうかです。 */
  compact?: boolean;
  /** ボタンの行の左端に置く要素です（「やめる」「この証言を削除」など）。「発言者」と投稿ボタンは右端にまとめます。 */
  actions?: ReactNode;
  /**
   * 保存する証言のIDを受け取り、証言とあわせて保存する要素を返します。
   * 例外を投げると、その理由を表示して、証言も保存しません。
   */
  withEntries?: (claimId: Id) => UpsertEntry[];
  /** 指定すると発言者を必須にし、発言者を選ばずに保存しようとしたときに、この文を表示します。 */
  speakerRequiredMessage?: string;
};

export function ClaimForm({
  initial,
  defaults,
  onDone,
  autoFocus,
  compact,
  actions,
  withEntries,
  speakerRequiredMessage,
}: ClaimFormProps) {
  const currentCase = useCurrentCase();
  const upsertMany = useCaseStore((state) => state.upsertMany);

  const [draft, setDraft] = useState<ClaimDraft>(() =>
    initial ? claimToDraft(initial, currentCase) : { text: '', mentions: [] }
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [interviewId, setInterviewId] = useState<Id>(() => initial?.interviewId ?? defaults?.interviewId ?? NO_INTERVIEW);
  const [speaker, setSpeaker] = useState<SpeakerDraft>(() => {
    const presetInterview = currentCase.interviews.find((interview) => interview.id === defaults?.interviewId);
    if (initial === undefined && presetInterview !== undefined) {
      return { personIds: [presetInterview.subjectPersonId], viaPersonIds: [] };
    }
    return speakerToDraft(initial);
  });
  const interviewFieldId = useId();
  /** このフォームで新規作成した、まだ保存していないエンティティです。 */
  const [pending, setPending] = useState<{ mention: DraftMention; entry: UpsertEntry }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const candidates = [...caseToCandidates(currentCase), ...pending.map((item) => item.mention)];

  const content = draftToContent({ ...draft, text: draft.text.trim() });
  const links = deriveClaimLinks(content);
  const labelOf = (kind: MentionKind, id: string | undefined) =>
    candidates.find((candidate) => candidate.kind === kind && candidate.id === id)?.label;
  /** 本文から読み取れた参照です。読み取れなかった項目は含めません。 */
  const summaryItems = [
    { term: DATE_MENTION_LABEL, description: links.when && formatTimeRef(links.when) },
    { term: MENTION_KIND_LABELS.place, description: labelOf('place', links.placeId) },
    { term: '言及', description: links.mentionedPersonIds.map((id) => labelOf('person', id)).join('、') },
  ].filter((item) => item.description);

  const interviewOf = (id: Id) => currentCase.interviews.find((interview) => interview.id === id);

  const handleInterviewChange = (nextInterviewId: Id) => {
    setInterviewId(nextInterviewId);
    const interview = interviewOf(nextInterviewId);
    if (interview && speaker.personIds.length === 0 && speaker.viaPersonIds.length === 0) {
      setSpeaker({ personIds: [interview.subjectPersonId], viaPersonIds: [] });
    }
  };

  const handleCreate = (kind: MentionKind, name: string): DraftMention => {
    const mention = { kind, id: nanoid(), label: name };
    setPending((current) => [...current, { mention, entry: createEntry(kind, mention.id, name) }]);
    return mention;
  };

  /** 登録済みの人物と、このフォームで新規作成した人物の種別です。発言者の選択肢に種別を添えるために使います。 */
  const personKindById = new Map<Id, PersonKind>([
    ...currentCase.persons.map((person): [Id, PersonKind] => [person.id, person.kind]),
    ...pending.flatMap((item): [Id, PersonKind][] => (item.entry.key === 'persons' ? [[item.entry.entity.id, item.entry.entity.kind]] : [])),
  ]);
  const speakerOptions: SpeakerPersonOption[] = candidates
    .filter((candidate) => candidate.kind === 'person')
    .map((candidate) => {
      const personKind = personKindById.get(candidate.id);
      if (personKind === undefined) throw new Error(`発言者の候補の人物が見つかりません: ${candidate.id}`);
      return { id: candidate.id, label: candidate.label, personKind };
    });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (speakerRequiredMessage !== undefined && speaker.personIds.length === 0) {
      setError(speakerRequiredMessage);
      return;
    }
    if (speaker.personIds.length === 0 && speaker.viaPersonIds.length > 0) {
      setError('発言者を選んでください。経由だけを指定することはできません（新聞の地の文は、新聞を発言者に選びます）');
      return;
    }
    const interview = interviewOf(interviewId);
    if (interview && ![...speaker.personIds, ...speaker.viaPersonIds].includes(interview.subjectPersonId)) {
      const subjectName = labelOf('person', interview.subjectPersonId);
      setError(`聴取の相手（${subjectName}）を、発言者か経由に選んでください`);
      return;
    }
    // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const claim: Claim = {
      id: initial?.id ?? nanoid(),
      speaker: toSpeaker(speaker),
      viaPersonIds: speaker.viaPersonIds,
      content,
      ...links,
    };
    if (title.trim()) claim.title = title.trim();
    if (initial?.locator) claim.locator = initial.locator;
    if (interview) claim.interviewId = interview.id;

    // 新規作成した後に、本文からも発言者・経由からも外されたエンティティは保存しない
    const usedIds = new Set([
      ...parseContent(content).flatMap((segment) => (segment.type === 'mention' ? [segment.id] : [])),
      ...speaker.personIds,
      ...speaker.viaPersonIds,
    ]);
    const newEntries = pending.filter((item) => usedIds.has(item.mention.id)).map((item) => item.entry);

    // 書いた位置に並べるのは新規登録のときだけ（編集では、ボード上の位置を変えない）
    const boardKey = timelineKeyOf(claim.id);
    const insertIndex = initial ? undefined : defaults?.insertIndex;

    try {
      // 保存と並び順の移動を1回で反映する（移動だけが失敗して、再送信で証言が重複しないようにするため）
      upsertMany(
        [...newEntries, { key: 'claims', entity: claim }, ...(withEntries?.(claim.id) ?? [])],
        insertIndex === undefined ? undefined : { key: boardKey, toIndex: insertIndex }
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDone(claim.id);
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        // 内容欄がメンションの候補の確定などで処理済みのキー操作では、保存しない
        if (event.defaultPrevented) return;
        // Ctrl/Command+Enter はIMEの変換確定と競合しないため、isComposing の確認は不要
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
      className="space-y-3"
    >
      <TextField
        label="見出し（任意）"
        value={title}
        onChange={setTitle}
        placeholder="本文が長いときの要約（例: Zによる恐喝事件があった）"
      />
      <MentionTextarea
        label="内容"
        value={draft}
        onChange={setDraft}
        candidates={candidates}
        onCreate={handleCreate}
        required
        autoFocus={autoFocus}
        hideLabel={compact}
        withDate
        placeholder={
          compact
            ? '分かったことを書く（「@」で人物・場所・日時。誰の発言かは下の「発言者」で選ぶ）'
            : '例: @1998-08-12T21:00 ごろ、@湖畔の別荘 の庭に @別荘の持ち主 の姿が見えた。'
        }
      />
      {(!compact || interviewId !== NO_INTERVIEW) && (
        <div>
          <label htmlFor={interviewFieldId} className={LABEL_CLASS}>
            聴取（任意）
          </label>
          <select
            id={interviewFieldId}
            value={interviewId}
            onChange={(event) => handleInterviewChange(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value={NO_INTERVIEW}>聴取なし</option>
            {currentCase.interviews.map((interview) => (
              <option key={interview.id} value={interview.id}>
                {formatInterviewLabel(currentCase, interview)}
              </option>
            ))}
          </select>
        </div>
      )}
      {!compact && (
        <>
        <p className="text-xs text-muted-foreground">
          「@」で人物・場所・日時を書きます。未登録の名前はその場で作成でき、日時は「@1998-08-12」「@1998年8月12日19時」のように書くと候補に出ます。誰の発言か、誰を経由して伝わったか（新聞・書籍・警察の発表など）は、保存ボタンの横の「発言者」で選びます。発言者を選ばない証言は、ユーザーの推測です。
        </p>
        {summaryItems.length > 0 && (
          <dl
            aria-label="本文から読み取った参照"
            className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"
          >
            {summaryItems.map((item) => (
              <div key={item.term} className="contents">
                <dt className="font-medium">{item.term}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        )}
        </>
      )}
      <FormError message={error} />
      <div className="flex items-center justify-end gap-3">
        {actions}
        <SpeakerPicker
          value={speaker}
          onChange={setSpeaker}
          persons={speakerOptions}
          onCreatePerson={(name) => {
            // 名前だけで新規作成する人物の種別は、既定値（人物）になる（createEntry）
            const { id, label } = handleCreate('person', name);
            return { id, label, personKind: DEFAULT_PERSON_KIND };
          }}
        />
        <SubmitButton label={compact && !initial ? '書き足す' : '証言を保存'} />
      </div>
    </form>
  );
}
