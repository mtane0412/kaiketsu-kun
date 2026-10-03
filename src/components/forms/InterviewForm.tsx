/**
 * 聴取（証言を得た機会）の入力フォーム
 *
 * 人物の詳細の「供述の変遷」（InterviewSection）から開き、その人物を相手とする1件の聴取（Interview）を登録・編集します。
 * 相手は開いている人物に固定し、入力するのは、日時・聴取者または媒体・場所・相手の立場・資料番号・URL・本文の7つです。すべて任意です。
 * 本文には、記事の本文や動画の文字起こしを貼り付けます。証言は、本文の範囲を選んで書き起こせます（InterviewTranscript）。
 * URLはリンクとして表示するため、http か https のURLだけを受け付けます（src/domain/transcript.ts の isHttpUrl）。
 *
 * 日時は、証言の本文の日時のメンションと同じ表記を受け付けます（1998 / 1998-08 / 1998-08-12 / 1998-08-12T19:00、
 * スラッシュ区切り、日本語の表記。src/domain/date-input.ts）。解釈できない表記は、保存せずにエラーを示します。
 *
 * 注意: フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent } from 'react';
import { parseDateInput } from '@/domain/date-input';
import { isHttpUrl } from '@/domain/transcript';
import type { Id, Interview } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';

/** 選択肢で「選ばない」を表す値です。 */
const UNSELECTED = '';

type InterviewFormProps = {
  /** 聴取の相手（開いている人物）のIDです。 */
  subjectPersonId: Id;
  /** 編集する聴取です。省略すると新規登録になります。 */
  initial?: Interview;
  /** 保存できたときに呼び出します。 */
  onDone: () => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

export function InterviewForm({ subjectPersonId, initial, onDone, onCancel }: InterviewFormProps) {
  const currentCase = useCurrentCase();
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  const [at, setAt] = useState(initial?.at ?? '');
  const [interviewerPersonId, setInterviewerPersonId] = useState<Id>(initial?.interviewerPersonId ?? UNSELECTED);
  const [placeId, setPlaceId] = useState<Id>(initial?.placeId ?? UNSELECTED);
  const [subjectRole, setSubjectRole] = useState(initial?.subjectRole ?? '');
  const [documentRef, setDocumentRef] = useState(initial?.documentRef ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [transcript, setTranscript] = useState(initial?.transcript ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const interview: Interview = { id: initial?.id ?? nanoid(), subjectPersonId };
    if (at.trim()) {
      const parsedAt = parseDateInput(at);
      if (parsedAt === null) {
        setError(`日時を解釈できません: ${at.trim()}（例: 1998-08-12、1998年8月12日19時）`);
        return;
      }
      interview.at = parsedAt;
    }
    if (interviewerPersonId !== UNSELECTED) interview.interviewerPersonId = interviewerPersonId;
    if (placeId !== UNSELECTED) interview.placeId = placeId;
    if (subjectRole.trim()) interview.subjectRole = subjectRole.trim();
    if (documentRef.trim()) interview.documentRef = documentRef.trim();
    if (url.trim()) {
      if (!isHttpUrl(url.trim())) {
        setError(`URLは http か https のURLで指定してください: ${url.trim()}`);
        return;
      }
      interview.url = url.trim();
    }
    // 本文は引用の原文と一字一句照らし合わせるため、前後の空白を除くだけにとどめ、行の中身には手を加えない
    if (transcript.trim()) interview.transcript = transcript.trim();

    try {
      upsert('interviews', interview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField label="日時（任意）" value={at} onChange={setAt} placeholder="1998-08-13、1998年8月13日10時 など" />

      <div>
        <label htmlFor={`${formId}-interviewer`} className={LABEL_CLASS}>
          聴取者または媒体（任意）
        </label>
        <select
          id={`${formId}-interviewer`}
          value={interviewerPersonId}
          onChange={(event) => setInterviewerPersonId(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value={UNSELECTED}>選ばない</option>
          {/* 自分自身が聴き取ることは無いため、選択肢から相手を外す */}
          {currentCase.persons
            .filter((person) => person.id !== subjectPersonId)
            .map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${formId}-place`} className={LABEL_CLASS}>
          場所（任意）
        </label>
        <select
          id={`${formId}-place`}
          value={placeId}
          onChange={(event) => setPlaceId(event.target.value)}
          className={INPUT_CLASS}
        >
          <option value={UNSELECTED}>選ばない</option>
          {currentCase.places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </div>

      <TextField label="相手の立場（任意）" value={subjectRole} onChange={setSubjectRole} placeholder="参考人、被疑者、目撃者 など" />
      <TextField label="資料番号（任意）" value={documentRef} onChange={setDocumentRef} placeholder="調書番号 など" />
      <TextField label="URL（任意）" value={url} onChange={setUrl} placeholder="記事・動画のURL（https://...）" />
      <TextField
        label="本文・文字起こし（任意）"
        value={transcript}
        onChange={setTranscript}
        multiline
        placeholder="記事の本文や、YouTube の「文字起こしを表示」の内容を貼り付けると、範囲を選んで証言を書き起こせます"
      />

      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          やめる
        </Button>
        <SubmitButton label="聴取を保存" />
      </div>
    </form>
  );
}
