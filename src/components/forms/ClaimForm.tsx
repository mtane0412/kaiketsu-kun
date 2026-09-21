/**
 * 主張（人物や媒体の発言・ユーザーの推測）の入力フォーム
 *
 * 入力の中心は本文の1欄です。本文に「@」で人物・場所・出来事を書くと、
 * 対象の出来事・場所・言及している人物を本文から導出します（規則は src/domain/mention.ts を参照）。
 * 未登録の名前は候補の一覧から新規作成でき、新しいエンティティは主張と同時に保存します。
 * 本文が長い主張には、本文を要約する見出しを任意で付けられます。見出しはメンションに対応せず、参照の導出には使いません。
 * 誰の発言か、誰を経由して伝わったかは本文には書かず、投稿ボタンの横の「発言者」で選びます（SpeakerPicker）。
 * 新規登録でも編集でも選べます。発言者を選ばない主張は、ユーザーの推測です。
 * 本文から導出できない項目（日時）は「詳細」にまとめています。
 * 資料内の位置（Claim.locator）は入力欄を廃止しましたが、編集時は入力済みの値を保持します。
 *
 * compact を指定すると、ボード上の入力欄として見出しと本文の欄・「発言者」・投稿ボタンだけを表示します（SNSに投稿する感覚で
 * 書けるようにするためです）。「詳細」の項目は入力欄を表示しないだけで、編集時は入力済みの値を保持します。
 * 新規登録時は、ボード上の書いた位置（defaults）に従って、束ねる出来事と時系列の並び順の中での位置を決めます。
 *
 * initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState, type FormEvent, type ReactNode } from 'react';
import { MENTION_KIND_LABELS } from '@/domain/labels';
import {
  claimToDraft,
  deriveClaimLinks,
  draftToContent,
  formatMention,
  parseContent,
  type ClaimDraft,
  type DraftMention,
  type MentionKind,
} from '@/domain/mention';
import { draftToTimeRef, timeRefToDraft } from '@/domain/time-ref-draft';
import { resolveTimelineOrder, timelineKeyOf } from '@/domain/timeline-order';
import type { Case, Claim, Id } from '@/domain/types';
import { useCaseStore, type UpsertEntry } from '@/stores/useCaseStore';
import { FormError, SubmitButton, TextField, TimeRefInput } from './fields';
import { MentionTextarea, type MentionCandidate } from './MentionTextarea';
import { SpeakerPicker, speakerToDraft, toSpeaker, type SpeakerDraft } from './SpeakerPicker';

/** 案件に登録済みのエンティティを、メンションの候補に変換します。 */
function caseToCandidates(target: Case): MentionCandidate[] {
  return [
    ...target.persons.map((person) => ({
      kind: 'person' as const,
      id: person.id,
      label: person.name,
      keywords: person.aliases,
    })),
    ...target.places.map((place) => ({ kind: 'place' as const, id: place.id, label: place.name })),
    ...target.events.map((event) => ({ kind: 'event' as const, id: event.id, label: event.title })),
  ];
}

/** 名前だけを持つ新しいエンティティを、保存用の形で作成します。詳細は各エンティティの編集画面で後から入力します。 */
function createEntry(kind: MentionKind, id: string, name: string): UpsertEntry {
  switch (kind) {
    case 'person':
      return { key: 'persons', entity: { id, name } };
    case 'place':
      return { key: 'places', entity: { id, name } };
    case 'event':
      return { key: 'events', entity: { id, title: name } };
  }
}

/**
 * ボード上の書いた位置から決まる初期値です。新規登録でのみ使用します。
 */
export type ClaimDefaults = {
  /** 出来事の束の中で書いた場合の出来事です。本文に出来事のメンションが無いときに採用します。 */
  eventId?: Id;
  /**
   * 項目と項目の間で書いた場合の、時系列の並び順の中での位置（0始まり）です。
   * 保存した主張（新しい出来事に束ねた場合はその出来事の束）を、この位置に並べます。
   * 本文のメンションで既存の出来事に束ねた場合は、その束の位置に従うため使用しません。
   */
  insertIndex?: number;
};

type ClaimFormProps = {
  initial?: Claim;
  defaults?: ClaimDefaults;
  onDone: () => void;
  /** 内容欄に初期フォーカスを置くかどうかです。ボード上で開いた入力欄にすぐ書き始められるようにします。 */
  autoFocus?: boolean;
  /** 見出しと本文の欄・「発言者」・投稿ボタンだけを表示するかどうかです。 */
  compact?: boolean;
  /** 投稿ボタンの左に並べる要素です（「やめる」など）。 */
  actions?: ReactNode;
};

export function ClaimForm({ initial, defaults, onDone, autoFocus, compact, actions }: ClaimFormProps) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const upsertMany = useCaseStore((state) => state.upsertMany);
  const moveTimelineItem = useCaseStore((state) => state.moveTimelineItem);

  const [draft, setDraft] = useState<ClaimDraft>(() =>
    initial ? claimToDraft(initial, currentCase) : { text: '', mentions: [] }
  );
  const [title, setTitle] = useState(initial?.title ?? '');
  const [speaker, setSpeaker] = useState<SpeakerDraft>(() => speakerToDraft(initial));
  /** このフォームで新規作成した、まだ保存していないエンティティです。 */
  const [pending, setPending] = useState<{ mention: DraftMention; entry: UpsertEntry }[]>([]);
  const [statedAt, setStatedAt] = useState(timeRefToDraft(initial?.statedAt));
  const [when, setWhen] = useState(timeRefToDraft(initial?.when));
  const [error, setError] = useState<string | null>(null);

  const hasDetails = Boolean(initial?.statedAt || initial?.when);
  const candidates = [...caseToCandidates(currentCase), ...pending.map((item) => item.mention)];

  const typedContent = draftToContent({ ...draft, text: draft.text.trim() });
  // 出来事の束の中で書いた主張は、本文に出来事のメンションが無ければ、その出来事のメンションを末尾に補う。
  // 参照を項目に直接設定せず本文に補うのは、「参照は本文から導出する」という規則を保つため
  const defaultEvent =
    deriveClaimLinks(typedContent).eventId === undefined
      ? currentCase.events.find((event) => event.id === defaults?.eventId)
      : undefined;
  const content = defaultEvent
    ? `${typedContent} ${formatMention({ kind: 'event', id: defaultEvent.id, label: defaultEvent.title })}`
    : typedContent;
  const links = deriveClaimLinks(content);
  const labelOf = (kind: MentionKind, id: string | undefined) =>
    candidates.find((candidate) => candidate.kind === kind && candidate.id === id)?.label;
  /** 本文から読み取れた参照です。読み取れなかった項目は含めません。 */
  const summaryItems = [
    { term: MENTION_KIND_LABELS.event, description: labelOf('event', links.eventId) },
    { term: MENTION_KIND_LABELS.place, description: labelOf('place', links.placeId) },
    { term: '言及', description: links.mentionedPersonIds.map((id) => labelOf('person', id)).join('、') },
  ].filter((item) => item.description);

  const handleCreate = (kind: MentionKind, name: string): DraftMention => {
    const mention = { kind, id: nanoid(), label: name };
    setPending((current) => [...current, { mention, entry: createEntry(kind, mention.id, name) }]);
    return mention;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (speaker.personIds.length === 0 && speaker.viaPersonIds.length > 0) {
      setError('発言者を選んでください。経由だけを指定することはできません（新聞の地の文は、新聞を発言者に選びます）');
      return;
    }
    const statedAtResult = draftToTimeRef(statedAt);
    if (!statedAtResult.ok) {
      setError(`述べられた時点: ${statedAtResult.error}`);
      return;
    }
    const whenResult = draftToTimeRef(when);
    if (!whenResult.ok) {
      setError(`証言が述べる日時: ${whenResult.error}`);
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
    if (statedAtResult.value) claim.statedAt = statedAtResult.value;
    if (whenResult.value) claim.when = whenResult.value;

    // 新規作成した後に、本文からも発言者・経由からも外されたエンティティは保存しない
    const usedIds = new Set([
      ...parseContent(content).flatMap((segment) => (segment.type === 'mention' ? [segment.id] : [])),
      ...speaker.personIds,
      ...speaker.viaPersonIds,
    ]);
    const newEntries = pending.filter((item) => usedIds.has(item.mention.id)).map((item) => item.entry);

    // 書いた位置に並べるのは、この保存でボードに新しく現れる項目だけ
    const boardKey =
      claim.eventId === undefined ? timelineKeyOf('claim', claim.id) : timelineKeyOf('event', claim.eventId);
    const insertIndex = resolveTimelineOrder(currentCase).includes(boardKey) ? undefined : defaults?.insertIndex;

    try {
      upsertMany([...newEntries, { key: 'claims', entity: claim }]);
      if (insertIndex !== undefined) moveTimelineItem(boardKey, insertIndex);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDone();
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
        placeholder={
          compact
            ? '分かったことを書く（「@」で人物・場所・出来事。誰の発言かは下の「発言者」で選ぶ）'
            : '例: 夜9時ごろ @湖畔の別荘 の庭に @別荘の持ち主 の姿が見えた。'
        }
      />
      {!compact && (
        <>
        <p className="text-xs text-slate-500">
          「@」で人物・場所・出来事を参照します。未登録の名前はその場で作成できます。誰の発言か、誰を経由して伝わったか（新聞・書籍・警察の発表など）は、保存ボタンの横の「発言者」で選びます。発言者を選ばない主張は、ユーザーの推測です。
        </p>
        {summaryItems.length > 0 && (
          <dl
            aria-label="本文から読み取った参照"
            className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
          >
            {summaryItems.map((item) => (
              <div key={item.term} className="contents">
                <dt className="font-medium">{item.term}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
          </dl>
        )}
        <details open={hasDetails} className="rounded border border-slate-200 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            詳細（日時）
          </summary>
          <div className="mt-2 space-y-3">
            <TimeRefInput legend="証言が述べる日時" value={when} onChange={setWhen} />
            <TimeRefInput legend="述べられた時点" value={statedAt} onChange={setStatedAt} />
          </div>
        </details>
        </>
      )}
      <FormError message={error} />
      <div className="flex items-center justify-end gap-3">
        <SpeakerPicker
          value={speaker}
          onChange={setSpeaker}
          persons={candidates.filter((candidate) => candidate.kind === 'person')}
          onCreatePerson={(name) => handleCreate('person', name)}
        />
        {actions}
        <SubmitButton label={compact && !initial ? '書き足す' : '主張を保存'} />
      </div>
    </form>
  );
}
