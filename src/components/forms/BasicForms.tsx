/**
 * 人物・場所の入力フォーム
 *
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
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  contentToDraft,
  draftToContent,
  parseContent,
  type ClaimDraft,
  type DraftMention,
  type MentionKind,
} from '@/domain/mention';
import type { Coordinates, Person, Place } from '@/domain/types';
import { useCaseStore, type UpsertEntry } from '@/stores/useCaseStore';
import { FormError, SubmitButton, TextField } from './fields';
import { CoordinateField } from './CoordinateField';
import { ImageField } from './ImageField';
import { caseToCandidates, createEntry } from './mention-entries';
import { MentionTextarea } from './MentionTextarea';

type FormProps<T> = {
  initial?: T;
  onDone: () => void;
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
  const currentCase = useCaseStore((state) => state.currentCase);
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

export function PersonForm({ initial, onDone }: FormProps<Person>) {
  const upsertMany = useCaseStore((state) => state.upsertMany);
  const [name, setName] = useState(initial?.name ?? '');
  const [aliases, setAliases] = useState(initial?.aliases?.join('、') ?? '');
  const [imageDataUrl, setImageDataUrl] = useState(initial?.imageDataUrl);
  const { field: noteField, note, newEntries } = useNoteField('person', initial);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const aliasList = aliases
      .split(/[、,]/)
      .map((alias) => alias.trim())
      .filter(Boolean);

    const person: Person = { id: initial?.id ?? nanoid(), name: name.trim() };
    if (aliasList.length > 0) person.aliases = aliasList;
    if (imageDataUrl) person.imageDataUrl = imageDataUrl;
    if (note) person.note = note;

    try {
      upsertMany([...newEntries, { key: 'persons', entity: person }]);
    } catch (caught) {
      setError(toMessage(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="名前" value={name} onChange={setName} required />
      <TextField label="別名（読点区切り）" value={aliases} onChange={setAliases} placeholder="旧姓、偽名など" />
      <ImageField label="画像" shape="round" value={imageDataUrl} onChange={setImageDataUrl} />
      {noteField}
      <FormError message={error} />
      <SubmitButton label="人物を保存" />
    </form>
  );
}

export function PlaceForm({ initial, onDone }: FormProps<Place>) {
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
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="名前" value={name} onChange={setName} required />
      <ImageField label="画像" shape="rect" value={imageDataUrl} onChange={setImageDataUrl} />
      <CoordinateField label="座標" value={coordinates} onChange={setCoordinates} />
      {noteField}
      <FormError message={error} />
      <SubmitButton label="場所を保存" />
    </form>
  );
}
