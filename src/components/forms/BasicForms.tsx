/**
 * 人物・場所・出来事の入力フォーム
 *
 * どのフォームも、initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState, type FormEvent } from 'react';
import type { Event, Person, Place } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { FormError, SubmitButton, TextField } from './fields';

type FormProps<T> = {
  initial?: T;
  onDone: () => void;
};

/** 例外をフォームに表示するエラー文に変換します。 */
function toMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

export function PersonForm({ initial, onDone }: FormProps<Person>) {
  const upsert = useCaseStore((state) => state.upsert);
  const [name, setName] = useState(initial?.name ?? '');
  const [aliases, setAliases] = useState(initial?.aliases?.join('、') ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const aliasList = aliases
      .split(/[、,]/)
      .map((alias) => alias.trim())
      .filter(Boolean);

    // 画像は入力欄が無いため、編集時は既存の値を引き継ぐ
    const person: Person = { id: initial?.id ?? nanoid(), name: name.trim() };
    if (aliasList.length > 0) person.aliases = aliasList;
    if (initial?.imageDataUrl) person.imageDataUrl = initial.imageDataUrl;
    if (note.trim()) person.note = note.trim();

    try {
      upsert('persons', person);
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
      <TextField label="メモ" value={note} onChange={setNote} multiline />
      <FormError message={error} />
      <SubmitButton label="人物を保存" />
    </form>
  );
}

export function PlaceForm({ initial, onDone }: FormProps<Place>) {
  const upsert = useCaseStore((state) => state.upsert);
  const [name, setName] = useState(initial?.name ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    // 緯度経度は入力欄が無いため、編集時は既存の値を引き継ぐ
    const place: Place = { id: initial?.id ?? nanoid(), name: name.trim() };
    if (initial?.latitude !== undefined) place.latitude = initial.latitude;
    if (initial?.longitude !== undefined) place.longitude = initial.longitude;
    if (note.trim()) place.note = note.trim();

    try {
      upsert('places', place);
    } catch (caught) {
      setError(toMessage(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="名前" value={name} onChange={setName} required />
      <TextField label="メモ" value={note} onChange={setNote} multiline />
      <FormError message={error} />
      <SubmitButton label="場所を保存" />
    </form>
  );
}

export function EventForm({ initial, onDone }: FormProps<Event>) {
  const upsert = useCaseStore((state) => state.upsert);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const next: Event = { id: initial?.id ?? nanoid(), title: title.trim() };
    if (description.trim()) next.description = description.trim();

    try {
      upsert('events', next);
    } catch (caught) {
      setError(toMessage(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="タイトル" value={title} onChange={setTitle} required />
      <TextField label="メモ" value={description} onChange={setDescription} multiline />
      <p className="text-xs text-slate-500">
        出来事は、同じ事柄についての主張を束ねるラベルです。日時・場所・人物は、束ねた主張から導出して表示します。
      </p>
      <FormError message={error} />
      <SubmitButton label="出来事を保存" />
    </form>
  );
}
