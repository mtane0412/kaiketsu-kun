/**
 * 登録済みの一覧（台帳）
 *
 * 人物・場所・出来事・主張のうち1種類を選び、入力フォームと登録済みの一覧を表示します。
 * 一覧の「編集」を選ぶとフォームが編集に切り替わり、「削除」は他のデータから参照されている場合に
 * 理由を示して中止します。
 *
 * 日常の入力は時系列ボードへの書き足しで行います。このパネルは、ボード上のメンションや出来事の見出しから
 * エンティティの詳細を編集するため、およびボードに現れていないエンティティを編集・削除するための導線です。
 * initial は useState の初期化でのみ使用するため、対象を切り替えるときは呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { useState, type ReactNode } from 'react';
import { contentToPlainText } from '@/domain/mention';
import type { Case, Id } from '@/domain/types';
import { useCaseStore, type CollectionKey } from '@/stores/useCaseStore';
import { EventForm, PersonForm, PlaceForm } from './forms/BasicForms';
import { ClaimForm } from './forms/ClaimForm';

/** このパネルで扱う一覧の名前です。関係（relationships）はグラフ表示を移植する段階で追加します。 */
export type EntryKey = Exclude<CollectionKey, 'relationships'>;

/** 一覧に表示する内容の最大文字数です。 */
const ITEM_LABEL_MAX_LENGTH = 40;

/** 長い文字列を一覧表示用に切り詰めます。 */
function truncate(text: string): string {
  return text.length > ITEM_LABEL_MAX_LENGTH ? `${text.slice(0, ITEM_LABEL_MAX_LENGTH)}…` : text;
}

type Section = {
  key: EntryKey;
  label: string;
  /** 一覧に表示する要素のIDと表示名を返します。 */
  listItems: (target: Case) => { id: Id; label: string }[];
  /** 入力フォームを描画します。editingId が null の場合は新規登録です。 */
  renderForm: (target: Case, editingId: Id | null, onDone: () => void) => ReactNode;
};

const SECTIONS: Section[] = [
  {
    key: 'persons',
    label: '人物',
    listItems: (target) => target.persons.map((person) => ({ id: person.id, label: person.name })),
    renderForm: (target, editingId, onDone) => (
      <PersonForm initial={target.persons.find((person) => person.id === editingId)} onDone={onDone} />
    ),
  },
  {
    key: 'places',
    label: '場所',
    listItems: (target) => target.places.map((place) => ({ id: place.id, label: place.name })),
    renderForm: (target, editingId, onDone) => (
      <PlaceForm initial={target.places.find((place) => place.id === editingId)} onDone={onDone} />
    ),
  },
  {
    key: 'events',
    label: '出来事',
    listItems: (target) => target.events.map((event) => ({ id: event.id, label: event.title })),
    renderForm: (target, editingId, onDone) => (
      <EventForm initial={target.events.find((event) => event.id === editingId)} onDone={onDone} />
    ),
  },
  {
    key: 'claims',
    label: '主張',
    listItems: (target) => target.claims.map((claim) => ({ id: claim.id, label: truncate(contentToPlainText(claim.content, target)) })),
    renderForm: (target, editingId, onDone) => (
      <ClaimForm initial={target.claims.find((claim) => claim.id === editingId)} onDone={onDone} />
    ),
  },
];

type EntryPanelProps = {
  /** 最初に選ぶ種類と、編集から始めるエンティティです。省略すると、人物の新規登録から始めます。 */
  initial?: { key: EntryKey; id: Id };
};

export function EntryPanel({ initial }: EntryPanelProps) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const remove = useCaseStore((state) => state.remove);

  const [activeKey, setActiveKey] = useState<EntryKey>(initial?.key ?? 'persons');
  const [editingId, setEditingId] = useState<Id | null>(initial?.id ?? null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // 保存のたびに値を進め、新規登録フォームを再マウントして入力欄を空に戻す
  const [formVersion, setFormVersion] = useState(0);

  const section = SECTIONS.find((item) => item.key === activeKey);
  if (!section) {
    throw new Error(`入力パネルの種類が不正です: ${activeKey}`);
  }

  const resetForm = () => {
    setEditingId(null);
    setFormVersion((version) => version + 1);
  };

  const handleSelectSection = (key: EntryKey) => {
    setActiveKey(key);
    setDeleteError(null);
    resetForm();
  };

  const handleDelete = (id: Id, label: string) => {
    // 削除は取り消せないため、実行前に確認する
    if (!window.confirm(`「${label}」を削除しますか？`)) return;
    try {
      remove(section.key, id);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    setDeleteError(null);
    if (editingId === id) resetForm();
  };

  return (
    <div>
      <div role="tablist" aria-label="入力する種類" className="mb-4 flex flex-wrap gap-1">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === activeKey}
            onClick={() => handleSelectSection(item.key)}
            className={`rounded px-3 py-1.5 text-sm ${
              item.key === activeKey ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {item.label}
            <span className="ml-1 text-xs opacity-70">{currentCase[item.key].length}</span>
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              {section.label}を{editingId ? '編集' : '登録'}
            </h3>
            {editingId && (
              <button type="button" onClick={resetForm} className="text-xs text-sky-700 hover:underline">
                編集を取り消す
              </button>
            )}
          </div>
          <div key={`${section.key}:${editingId ?? `new-${formVersion}`}`}>
            {section.renderForm(currentCase, editingId, resetForm)}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">登録済みの{section.label}</h3>
          {deleteError && (
            <p role="alert" className="mb-2 whitespace-pre-line rounded bg-red-50 px-2 py-1.5 text-sm text-red-700">
              {deleteError}
            </p>
          )}
          <ul aria-label={`登録済みの${section.label}`} className="space-y-1">
            {section.listItems(currentCase).map((item) => (
              <li
                key={item.id}
                className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm ${
                  item.id === editingId ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
                }`}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="flex shrink-0 gap-2 text-xs">
                  <button
                    type="button"
                    aria-label={`${item.label}を編集`}
                    onClick={() => setEditingId(item.id)}
                    className="text-sky-700 hover:underline"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    aria-label={`${item.label}を削除`}
                    onClick={() => handleDelete(item.id, item.label)}
                    className="text-red-600 hover:underline"
                  >
                    削除
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {section.listItems(currentCase).length === 0 && (
            <p className="text-xs text-slate-400">まだ登録されていません。</p>
          )}
        </section>
      </div>
    </div>
  );
}
