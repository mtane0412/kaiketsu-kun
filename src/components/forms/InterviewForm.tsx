/**
 * 資料（聴取。証言を得た機会）の入力フォーム
 *
 * 1件の資料（Interview）を登録・編集します。人物の詳細の「供述の変遷」（InterviewSection）・資料のカード（InterviewCard）・
 * 資料の登録ページ（InterviewDetail の NewInterviewDetail）から開きます。
 * 入力するのは、相手・日時・聴取者または媒体・場所・相手の立場・資料番号・URL・本文の8つです。
 * - 相手は1人以上が必須で、複数を選べます（記者会見や記事のように、何人もの発言が載る資料のためです）。選んだ順に保存します。
 *   人物の詳細から開いた場合は、開いている人物を選んだ状態で始めます（defaultSubjectPersonIds）。
 * - 聴取者または媒体に、相手と同じ人物は選べません（自分自身が聴き取ることは無いためです）。
 * - 相手以外は任意です。
 * 本文には、記事の本文や動画の文字起こしを貼り付けます。証言は、本文の範囲を選んで書き起こせます（InterviewTranscript）。
 * Web の記事は、URLを入れて「本文を取得」を押すと、本文の取得 API（src/app/api/fetch-article/route.ts）で本文を取り出して本文の欄に入れます。
 * 取得した本文は保存せず、欄に入れるだけです。ユーザーが確認・修正してから「資料を保存」で保存します。
 * - 本文の欄に入力がある場合は、黙って上書きせず、置き換えてよいかを確認します。
 * - 記事の公開日時が分かり、日時の欄が空の場合は、公開日時を日時の欄に入れます。入力済みの日時は上書きしません。
 * - YouTube のURLでは取得せず、文字起こしを貼り付けるよう案内します（字幕は公式APIでは動画の所有者しか取得できないためです）。
 * - 取得に失敗した場合は理由を示し、本文の欄を変えません。
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
import { describeArticleUrlProblem, requestArticleFetch, type FetchedArticle } from '@/lib/article-fetch-api';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';

/** 選択肢で「選ばない」を表す値です。 */
const UNSELECTED = '';

type InterviewFormProps = {
  /** 新規登録で、最初から相手に選んでおく人物のIDです（人物の詳細から開いた場合の、開いている人物など）。編集では使いません。 */
  defaultSubjectPersonIds?: Id[];
  /** 編集する聴取です。省略すると新規登録になります。 */
  initial?: Interview;
  /** 保存できたときに、保存した聴取を渡して呼び出します。 */
  onDone: (interview: Interview) => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

export function InterviewForm({ defaultSubjectPersonIds = [], initial, onDone, onCancel }: InterviewFormProps) {
  const currentCase = useCurrentCase();
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  /** 相手の人物のIDです。選んだ順に並びます（先頭の相手は、証言の候補の抽出で発言者の分からない候補の発言者になるためです）。 */
  const [subjectPersonIds, setSubjectPersonIds] = useState<Id[]>(initial?.subjectPersonIds ?? defaultSubjectPersonIds);
  const [at, setAt] = useState(initial?.at ?? '');
  const [interviewerPersonId, setInterviewerPersonId] = useState<Id>(initial?.interviewerPersonId ?? UNSELECTED);
  const [placeId, setPlaceId] = useState<Id>(initial?.placeId ?? UNSELECTED);
  const [subjectRole, setSubjectRole] = useState(initial?.subjectRole ?? '');
  const [documentRef, setDocumentRef] = useState(initial?.documentRef ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [transcript, setTranscript] = useState(initial?.transcript ?? '');
  const [error, setError] = useState<string | null>(null);
  /** 本文を取得している最中かどうかです。取得中は「本文を取得」を押せなくします。 */
  const [isFetchingArticle, setIsFetchingArticle] = useState(false);
  /** 本文の欄に入力があるため、置き換えてよいかの確認を待っている、取得した記事です。 */
  const [pendingArticle, setPendingArticle] = useState<FetchedArticle | null>(null);
  /** 取得した本文を欄に入れたことの知らせです。 */
  const [notice, setNotice] = useState<string | null>(null);

  /** 人物 personId を相手に加えるか、相手から外します。加えた人物は末尾に並べます。 */
  const toggleSubject = (personId: Id, checked: boolean) =>
    setSubjectPersonIds((current) => (checked ? [...current, personId] : current.filter((id) => id !== personId)));

  /** 取得した記事の本文を本文の欄に入れ、日時の欄が空なら公開日時も入れます。保存はしません。 */
  const applyArticle = (article: FetchedArticle) => {
    setTranscript(article.text);
    const publishedAt = article.publishedAt;
    const fillsAt = publishedAt !== undefined && !at.trim() && parseDateInput(publishedAt) !== null;
    if (fillsAt) setAt(publishedAt);
    setNotice(
      `${article.title ? `「${article.title}」の` : '記事の'}本文（${article.text.length.toLocaleString()}文字）を本文の欄に入れました。` +
        (fillsAt ? `公開日時（${publishedAt}）を日時の欄に入れました。` : '') +
        '確認してから「資料を保存」で保存してください。'
    );
  };

  const handleFetchArticle = async () => {
    setError(null);
    setNotice(null);
    const problem = describeArticleUrlProblem(url);
    if (problem !== null) {
      setError(problem);
      return;
    }

    setIsFetchingArticle(true);
    try {
      const article = await requestArticleFetch(url.trim());
      if (transcript.trim()) {
        setPendingArticle(article);
      } else {
        applyArticle(article);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsFetchingArticle(false);
    }
  };

  const handleConfirmReplace = () => {
    if (pendingArticle !== null) applyArticle(pendingArticle);
    setPendingArticle(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (subjectPersonIds.length === 0) {
      setError('相手を1人以上選んでください');
      return;
    }
    // 自分自身が聴き取ることは無いため、聴取者と相手が重なる入力は誤りとして扱う
    if (interviewerPersonId !== UNSELECTED && subjectPersonIds.includes(interviewerPersonId)) {
      const interviewerName = currentCase.persons.find((person) => person.id === interviewerPersonId)?.name;
      setError(`聴取者または媒体に、相手と同じ人物（${interviewerName}）は選べません`);
      return;
    }
    // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const interview: Interview = { id: initial?.id ?? nanoid(), subjectPersonIds };
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
    onDone(interview);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <fieldset>
        <legend className={LABEL_CLASS}>相手</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {currentCase.persons.map((person) => (
            <label key={person.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={subjectPersonIds.includes(person.id)}
                onChange={(event) => toggleSubject(person.id, event.target.checked)}
              />
              {person.name}
            </label>
          ))}
        </div>
      </fieldset>

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
          {currentCase.persons.map((person) => (
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
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="URL（任意）" value={url} onChange={setUrl} placeholder="記事・動画のURL（https://...）" />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleFetchArticle} disabled={isFetchingArticle} aria-busy={isFetchingArticle}>
          {isFetchingArticle ? '取得しています…' : '本文を取得'}
        </Button>
      </div>
      <TextField
        label="本文・文字起こし（任意）"
        value={transcript}
        onChange={setTranscript}
        multiline
        placeholder="記事の本文や、YouTube の「文字起こしを表示」の内容を貼り付けると、範囲を選んで証言を書き起こせます"
      />

      {notice && (
        <p role="status" className="rounded-md bg-muted px-2 py-1.5 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          やめる
        </Button>
        <SubmitButton label="資料を保存" />
      </div>

      <AlertDialog open={pendingArticle !== null} onOpenChange={(open) => !open && setPendingArticle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本文を置き換えますか？</AlertDialogTitle>
            <AlertDialogDescription>
              本文の欄に入力済みの内容を、取得した記事の本文（{pendingArticle?.text.length.toLocaleString()}文字）で置き換えます。
              置き換えても、「資料を保存」を押すまでは保存しません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>やめる</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReplace}>置き換える</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
