/**
 * 主張（証言・ソース自体の記述・ユーザーの推測）の入力フォーム
 *
 * 入力の中心は本文の1欄です。本文に「@」で人物・場所・出来事・ソースを書くと、発言者・ソース・
 * 対象の出来事・場所・言及している人物を本文から導出します（規則は src/domain/mention.ts を参照）。
 * 未登録の名前は候補の一覧から新規作成でき、新しいエンティティは主張と同時に保存します。
 * 本文から導出できない項目（日時・ソース内の位置）は「詳細」にまとめています。
 *
 * compact を指定すると、ボード上の入力欄として本文の1欄と投稿ボタンだけを表示します（SNSに投稿する感覚で
 * 書けるようにするためです）。「詳細」の項目は入力欄を表示しないだけで、編集時は入力済みの値を保持し、
 * 新規登録時は defaults の値を保存します。
 *
 * initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState, type FormEvent, type ReactNode } from 'react';
import { USER_SPEAKER_LABEL } from '@/domain/case-views';
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
import type { Case, Claim, Id, TimeRef } from '@/domain/types';
import { useCaseStore, type UpsertEntry } from '@/stores/useCaseStore';
import { FormError, SubmitButton, TextField, TimeRefInput } from './fields';
import { MentionTextarea, type MentionCandidate } from './MentionTextarea';

const SOURCE_SPEAKER_LABEL = 'ソース自体の記述';

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
    ...target.sources.map((source) => ({ kind: 'source' as const, id: source.id, label: source.title })),
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
    case 'source':
      return { key: 'sources', entity: { id, title: name, kind: 'other' } };
  }
}

/**
 * ボード上の書いた位置から決まる初期値です。新規登録でのみ使用します。
 */
export type ClaimDefaults = {
  /** 出来事の束の中で書いた場合の出来事です。本文に出来事のメンションが無いときに採用します。 */
  eventId?: Id;
  /** 項目と項目の間で書いた場合の、前後から求めた日時です。「証言が述べる日時」の初期値にします。 */
  when?: TimeRef;
};

type ClaimFormProps = {
  initial?: Claim;
  defaults?: ClaimDefaults;
  onDone: () => void;
  /** 内容欄に初期フォーカスを置くかどうかです。ボード上で開いた入力欄にすぐ書き始められるようにします。 */
  autoFocus?: boolean;
  /** 本文の1欄と投稿ボタンだけを表示するかどうかです。 */
  compact?: boolean;
  /** 投稿ボタンの左に並べる要素です（「やめる」など）。 */
  actions?: ReactNode;
};

export function ClaimForm({ initial, defaults, onDone, autoFocus, compact, actions }: ClaimFormProps) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const upsertMany = useCaseStore((state) => state.upsertMany);

  const [draft, setDraft] = useState<ClaimDraft>(() =>
    initial ? claimToDraft(initial, currentCase) : { text: '', mentions: [] }
  );
  /** このフォームで新規作成した、まだ保存していないエンティティです。 */
  const [pending, setPending] = useState<{ mention: DraftMention; entry: UpsertEntry }[]>([]);
  const [locator, setLocator] = useState(initial?.locator ?? '');
  const [statedAt, setStatedAt] = useState(timeRefToDraft(initial?.statedAt));
  const [when, setWhen] = useState(timeRefToDraft(initial?.when ?? defaults?.when));
  const [error, setError] = useState<string | null>(null);

  const hasDetails = Boolean(initial?.locator || initial?.statedAt || initial?.when || defaults?.when);
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
  const speakerLabel =
    links.speaker.kind === 'person'
      ? labelOf('person', links.speaker.personId)
      : links.speaker.kind === 'source'
        ? SOURCE_SPEAKER_LABEL
        : USER_SPEAKER_LABEL;
  const summaryItems: { term: string; description: string | undefined }[] = [
    { term: '発言者', description: speakerLabel },
    { term: MENTION_KIND_LABELS.source, description: labelOf('source', links.sourceId) },
    { term: MENTION_KIND_LABELS.event, description: labelOf('event', links.eventId) },
    { term: MENTION_KIND_LABELS.place, description: labelOf('place', links.placeId) },
    { term: '言及', description: links.mentionedPersonIds.map((id) => labelOf('person', id)).join('、') },
  ];

  const handleCreate = (kind: MentionKind, name: string): DraftMention => {
    const mention = { kind, id: nanoid(), label: name };
    setPending((current) => [...current, { mention, entry: createEntry(kind, mention.id, name) }]);
    return mention;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (links.speaker.kind === 'person' && links.sourceId === undefined) {
      setError('人物の証言にはソースが必要です。本文に「@ソース名」を加えてください');
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
    const claim: Claim = { id: initial?.id ?? nanoid(), content, ...links };
    if (locator.trim()) claim.locator = locator.trim();
    if (statedAtResult.value) claim.statedAt = statedAtResult.value;
    if (whenResult.value) claim.when = whenResult.value;

    // 新規作成した後に本文から消されたエンティティは保存しない
    const mentionedIds = new Set(
      parseContent(content).flatMap((segment) => (segment.type === 'mention' ? [segment.id] : []))
    );
    const newEntries = pending.filter((item) => mentionedIds.has(item.mention.id)).map((item) => item.entry);

    try {
      upsertMany([...newEntries, { key: 'claims', entity: claim }]);
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
            ? '分かったことを書く（「@」で人物・場所・出来事・ソース、先頭を「@人物:」にするとその人物の証言）'
            : '例: @隣家の住人: 夜9時ごろ @湖畔の別荘 の庭に @別荘の持ち主 の姿が見えた。 @架空日報 朝刊'
        }
      />
      {!compact && (
        <>
        <p className="text-xs text-slate-500">
          「@」で人物・場所・出来事・ソースを参照します。未登録の名前はその場で作成できます。先頭を「@人物:」にすると、その人物の証言になります。
        </p>
        <dl
          aria-label="本文から読み取った参照"
          className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
        >
          {summaryItems
            .filter((item) => item.description)
            .map((item) => (
              <div key={item.term} className="contents">
                <dt className="font-medium">{item.term}</dt>
                <dd>{item.description}</dd>
              </div>
            ))}
        </dl>
        <details open={hasDetails} className="rounded border border-slate-200 p-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            詳細（日時・ソース内の位置）
          </summary>
          <div className="mt-2 space-y-3">
            <TimeRefInput legend="証言が述べる日時" value={when} onChange={setWhen} />
            <TimeRefInput legend="述べられた時点" value={statedAt} onChange={setStatedAt} />
            <TextField label="ソース内の位置" value={locator} onChange={setLocator} placeholder="ページ、話数など" />
          </div>
        </details>
        </>
      )}
      <FormError message={error} />
      <div className="flex items-center justify-end gap-3">
        {actions}
        <SubmitButton label={compact && !initial ? '書き足す' : '主張を保存'} />
      </div>
    </form>
  );
}
