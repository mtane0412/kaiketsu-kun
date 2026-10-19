/**
 * 人物・場所の入力フォーム
 *
 * 人物には、種別（人物・組織・記録・媒体・物。新規登録の既定値は人物）を選べます。
 * 人物には、電話番号・車両ナンバーなどの識別子を複数登録できます（IdentifierField）。
 * 人物には、画像が無い場合にアイコンへ表示する1文字を指定できます（省略した場合は名前の先頭の文字。src/domain/person-icon.ts を参照）。
 * アイコンの文字がケースの他の人物と重なる場合は、重なる人物と、名前から選んだ重ならない文字の候補を示して、指定を促します。
 * メモには「@」で他の人物・場所を書けます（メンション。形式は src/domain/mention.ts を参照）。
 * メモのメンションは、エンティティ同士の関連の元になります。未登録の名前は候補の一覧から新規作成でき、
 * 新しいエンティティは編集中のエンティティと同時に保存します。
 *
 * どのフォームも、initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  contentToDraft,
  draftToContent,
  parseContent,
  type ClaimDraft,
  type DraftMention,
  type MentionKind,
} from '@/domain/mention';
import { PERSON_KIND_LABELS } from '@/domain/labels';
import { findIconTextCollisions, firstCharacter, personIconText, suggestIconTexts } from '@/domain/person-icon';
import { DEFAULT_PERSON_KIND, PERSON_KINDS } from '@/domain/person-kind';
import type { Coordinates, Id, Person, PersonKind, Place } from '@/domain/types';
import { useCaseStore, useCurrentCase, type UpsertEntry } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';
import { CoordinateField } from './CoordinateField';
import { IdentifierField, identifiersToRows, rowsToIdentifiers } from './IdentifierField';
import { ImageField } from './ImageField';
import { caseToCandidates, createEntry } from './mention-entries';
import { MentionTextarea } from './MentionTextarea';

type FormProps<T> = {
  initial?: T;
  /**
   * 保存できたときに呼び出します。引数は、保存したエンティティのIDです。
   * 新規登録では、保存した直後にそのエンティティの詳細へ移るために使います。
   */
  onDone: (id: Id) => void;
  /**
   * 保存ボタンの左に並べる操作です（詳細の「削除」など）。
   * 証言のフォーム（ClaimForm）とそろえ、保存は右端、取り消せない操作は左端に置きます。
   */
  actions?: ReactNode;
};

/** 例外をフォームに表示するエラー文に変換します。 */
function toMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/**
 * メンションを書けるメモ欄の状態を持ちます。
 *
 * @param kind 編集中のエンティティの種類
 * @param initial 編集中のエンティティ（新規登録の場合は undefined）
 * @returns field はメモの入力欄、note は保存するメモ（トークンを含む文章）、
 *   newEntries はメモで新規作成し、保存時にもメモに残っているエンティティです。
 *
 * 注意: 編集中のエンティティ自身は、候補に出しません（自分自身とは関連付けないためです）。
 */
function useNoteField(
  kind: MentionKind,
  initial: Person | Place | undefined
): { field: ReactNode; note: string; newEntries: UpsertEntry[] } {
  const currentCase = useCurrentCase();
  const [draft, setDraft] = useState<ClaimDraft>(() => contentToDraft(initial?.note ?? '', currentCase));
  /** このフォームで新規作成した、まだ保存していないエンティティです。 */
  const [pending, setPending] = useState<{ mention: DraftMention; entry: UpsertEntry }[]>([]);

  const candidates = [
    ...caseToCandidates(currentCase).filter((candidate) => !(candidate.kind === kind && candidate.id === initial?.id)),
    ...pending.map((item) => item.mention),
  ];
  const handleCreate = (createdKind: MentionKind, name: string): DraftMention => {
    const mention = { kind: createdKind, id: nanoid(), label: name };
    setPending((current) => [...current, { mention, entry: createEntry(createdKind, mention.id, name) }]);
    return mention;
  };

  const note = draftToContent({ ...draft, text: draft.text.trim() });
  // 新規作成した後にメモから消されたエンティティは保存しない
  const usedIds = new Set(parseContent(note).flatMap((segment) => (segment.type === 'mention' ? [segment.id] : [])));
  const newEntries = pending.filter((item) => usedIds.has(item.mention.id)).map((item) => item.entry);

  const field = (
    <MentionTextarea
      label="メモ"
      value={draft}
      onChange={setDraft}
      candidates={candidates}
      onCreate={handleCreate}
      placeholder="「@」で関連する人物・場所を書けます"
    />
  );
  return { field, note, newEntries };
}

/** 種別の選択欄の値を、人物の種別に変換します。選択肢は PERSON_KINDS だけのため、それ以外の値は実装の誤りとして例外を投げます。 */
function toPersonKind(value: string): PersonKind {
  const kind = PERSON_KINDS.find((candidate) => candidate === value);
  if (kind === undefined) throw new Error(`未知の人物の種別です: ${value}`);
  return kind;
}

export function PersonForm({ initial, onDone, actions }: FormProps<Person>) {
  const upsertMany = useCaseStore((state) => state.upsertMany);
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<PersonKind>(initial?.kind ?? DEFAULT_PERSON_KIND);
  const kindFieldId = useId();
  const [aliases, setAliases] = useState(initial?.aliases?.join('、') ?? '');
  const [identifierRows, setIdentifierRows] = useState(() => identifiersToRows(initial?.identifiers));
  const [imageDataUrl, setImageDataUrl] = useState(initial?.imageDataUrl);
  const [iconText, setIconText] = useState(initial?.iconText ?? '');
  const { field: noteField, note, newEntries } = useNoteField('person', initial);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const aliasList = aliases
      .split(/[、,]/)
      .map((alias) => alias.trim())
      .filter(Boolean);

    const person: Person = { id: initial?.id ?? nanoid(), name: name.trim(), kind };
    if (aliasList.length > 0) person.aliases = aliasList;
    const identifiers = rowsToIdentifiers(identifierRows);
    if (identifiers.length > 0) person.identifiers = identifiers;
    if (imageDataUrl) person.imageDataUrl = imageDataUrl;
    // アイコンに入るのは1文字のため、先頭の1文字だけを保存する
    const iconCharacter = firstCharacter(iconText);
    if (iconCharacter) person.iconText = iconCharacter;
    if (note) person.note = note;

    try {
      upsertMany([...newEntries, { key: 'persons', entity: person }]);
    } catch (caught) {
      setError(toMessage(caught));
      return;
    }
    onDone(person.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="名前" value={name} onChange={setName} required />
      <div>
        <label htmlFor={kindFieldId} className={LABEL_CLASS}>
          種別
        </label>
        <select
          id={kindFieldId}
          value={kind}
          onChange={(event) => setKind(toPersonKind(event.target.value))}
          className={INPUT_CLASS}
        >
          {PERSON_KINDS.map((option) => (
            <option key={option} value={option}>
              {PERSON_KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      <TextField label="別名（読点区切り）" value={aliases} onChange={setAliases} placeholder="旧姓、偽名など" />
      <IdentifierField rows={identifierRows} onChange={setIdentifierRows} />
      <ImageField label="画像" shape="round" value={imageDataUrl} onChange={setImageDataUrl} />
      <IconTextField
        personId={initial?.id}
        pendingPersons={newEntries.flatMap((entry) => (entry.key === 'persons' ? [entry.entity] : []))}
        name={name}
        imageDataUrl={imageDataUrl}
        value={iconText}
        onChange={setIconText}
      />
      {noteField}
      <FormError message={error} />
      <div className="flex items-center justify-end gap-3">
        {actions}
        <SubmitButton label="人物を保存" />
      </div>
    </form>
  );
}

type IconTextFieldProps = {
  /** 編集中の人物のIDです。新規登録では省略します。重なりの相手から自分自身を除くために使います。 */
  personId: Id | undefined;
  /** メモのメンションから新しく作り、この人物と同時に保存する人物です。まだケースに無いため、別に渡します。 */
  pendingPersons: Person[];
  /** 入力中の名前です。 */
  name: string;
  /** 入力中の画像です。画像があるとアイコンに文字を表示しないため、重なりを案内しません。 */
  imageDataUrl: string | undefined;
  value: string;
  onChange: (value: string) => void;
};

/**
 * 人物のアイコンの文字の入力欄です。
 * 入力中の名前・アイコンの文字から決まるアイコンの文字が、ケースの他の人物（同時に保存する人物を含む）と重なる場合は、
 * 重なる人物の名前と、重ならない文字の候補（押すとその文字を入れるボタン）を、欄の説明として示します。
 * 案内は、入力中に現れたことが読み上げで伝わるよう、ライブリージョンの中に表示します。
 * 重なっていても保存はできます（見分けにくいだけで、データとしては誤りではないため）。
 */
function IconTextField({ personId, pendingPersons, name, imageDataUrl, value, onChange }: IconTextFieldProps) {
  const savedPersons = useCurrentCase().persons;
  const noticeId = useId();
  const otherPersons = [...savedPersons, ...pendingPersons].filter((person) => person.id !== personId);
  const typedIconText = firstCharacter(value);
  const target = { name, imageDataUrl, ...(typedIconText ? { iconText: typedIconText } : {}) };
  const collisions = findIconTextCollisions(otherPersons, target);
  const suggestions = collisions.length > 0 ? suggestIconTexts(name, otherPersons) : [];

  return (
    <div className="grid gap-1.5">
      <TextField
        label="アイコンの文字（1文字。画像が無い場合に表示）"
        value={value}
        onChange={onChange}
        placeholder="未入力の場合は名前の先頭の文字"
        describedBy={collisions.length > 0 ? noticeId : undefined}
      />
      <div aria-live="polite" className="grid gap-1.5 empty:hidden">
        {collisions.length > 0 && (
          <>
            <p id={noticeId} className="text-xs text-muted-foreground">
              アイコンの文字「{personIconText(target)}」が、
              {collisions.map((person) => `「${person.name}」`).join('、')}
              と同じです。見分けられるよう、別の1文字を指定してください。
            </p>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">候補:</span>
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`アイコンの文字を「${suggestion}」にする`}
                    onClick={() => onChange(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function PlaceForm({ initial, onDone, actions }: FormProps<Place>) {
  const upsertMany = useCaseStore((state) => state.upsertMany);
  const [name, setName] = useState(initial?.name ?? '');
  const [imageDataUrl, setImageDataUrl] = useState(initial?.imageDataUrl);
  const [coordinates, setCoordinates] = useState<Coordinates | undefined>(
    initial?.latitude !== undefined && initial.longitude !== undefined
      ? { latitude: initial.latitude, longitude: initial.longitude }
      : undefined,
  );
  const { field: noteField, note, newEntries } = useNoteField('place', initial);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const place: Place = { id: initial?.id ?? nanoid(), name: name.trim() };
    if (coordinates) {
      place.latitude = coordinates.latitude;
      place.longitude = coordinates.longitude;
    }
    if (imageDataUrl) place.imageDataUrl = imageDataUrl;
    if (note) place.note = note;

    try {
      upsertMany([...newEntries, { key: 'places', entity: place }]);
    } catch (caught) {
      setError(toMessage(caught));
      return;
    }
    onDone(place.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="名前" value={name} onChange={setName} required />
      <ImageField label="画像" shape="rect" value={imageDataUrl} onChange={setImageDataUrl} />
      <CoordinateField label="座標" value={coordinates} onChange={setCoordinates} />
      {noteField}
      <FormError message={error} />
      <div className="flex items-center justify-end gap-3">
        {actions}
        <SubmitButton label="場所を保存" />
      </div>
    </form>
  );
}
