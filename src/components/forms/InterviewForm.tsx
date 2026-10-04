/**
 * 資料（聴取。証言を得た機会）の入力フォーム
 *
 * 1件の資料（Interview）を登録・編集します。資料のカード（InterviewCard）と、資料の登録ページ（InterviewDetail の NewInterviewDetail）から開きます。
 * 入力するのは、URL・タイトル・本文と、詳しい情報（日時・聴取者または媒体・場所・発言者の立場・資料番号）です。
 * - どれも任意ですが、資料を見分けられるよう、タイトル・URL・本文のいずれかは必須です。
 *   資料を見つけた時点では、URLだけを登録し、ほかは後から補えるようにするためです。
 * - 詳しい情報は、最初は閉じておきます（URLと本文から始める流れで、入力欄の多さに迷わないようにするためです）。
 *   編集で詳しい情報が入力済みの場合と、記事の公開日時を日時の欄に入れた場合は、開いた状態にします。
 * - 資料に載っている人物は入力しません。資料にひもづく証言の発言者から導きます（src/domain/interviews.ts）。
 * 本文には、記事の本文や動画の文字起こしを貼り付けます。証言は、本文の範囲を選んで書き起こせます（InterviewTranscript）。
 * Web の記事は、URLを入れて「本文を取得」を押すと、本文の取得 API（src/app/api/fetch-article/route.ts）で本文を取り出して本文の欄に入れます。
 * 取得した本文は保存せず、欄に入れるだけです。ユーザーが確認・修正してから「資料を保存」で保存します。
 * - 本文の欄に入力がある場合は、黙って上書きせず、置き換えてよいかを確認します。
 * - 記事のタイトルが分かり、タイトルの欄が空の場合は、記事のタイトルをタイトルの欄に入れます。入力済みのタイトルは上書きしません。
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
  /** 編集する聴取です。省略すると新規登録になります。 */
  initial?: Interview;
  /** 保存できたときに、保存した聴取を渡して呼び出します。 */
  onDone: (interview: Interview) => void;
  /** 入力をやめたときに呼び出します。 */
  onCancel: () => void;
};

/** 詳しい情報（日時・聴取者または媒体・場所・発言者の立場・資料番号）のいずれかを持つかどうかを返します。 */
function hasDetails(interview: Interview | undefined): boolean {
  if (interview === undefined) return false;
  const { at, interviewerPersonId, placeId, subjectRole, documentRef } = interview;
  return [at, interviewerPersonId, placeId, subjectRole, documentRef].some((value) => value !== undefined);
}

export function InterviewForm({ initial, onDone, onCancel }: InterviewFormProps) {
  const currentCase = useCurrentCase();
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  const [title, setTitle] = useState(initial?.title ?? '');
  /** 詳しい情報の入力欄を開いているかどうかです。 */
  const [showsDetails, setShowsDetails] = useState(() => hasDetails(initial));
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

  /** 取得した記事の本文を本文の欄に入れ、タイトル・日時の欄が空なら記事のタイトル・公開日時も入れます。保存はしません。 */
  const applyArticle = (article: FetchedArticle) => {
    setTranscript(article.text);
    if (article.title && !title.trim()) setTitle(article.title);
    const publishedAt = article.publishedAt;
    const fillsAt = publishedAt !== undefined && !at.trim() && parseDateInput(publishedAt) !== null;
    if (fillsAt) {
      setAt(publishedAt);
      // 入れた日時を確かめられるよう、詳しい情報を開く
      setShowsDetails(true);
    }
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

    // 資料を見分けられないと、一覧や証言のフォームで選べないため、見分ける手がかりを1つは求める
    if (!title.trim() && !url.trim() && !transcript.trim()) {
      setError('タイトル・URL・本文のいずれかを入力してください');
      return;
    }
    // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const interview: Interview = { id: initial?.id ?? nanoid() };
    if (title.trim()) interview.title = title.trim();
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
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="URL（任意）" value={url} onChange={setUrl} placeholder="記事・動画のURL（https://...）" />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleFetchArticle} disabled={isFetchingArticle} aria-busy={isFetchingArticle}>
          {isFetchingArticle ? '取得しています…' : '本文を取得'}
        </Button>
      </div>
      <TextField label="タイトル（任意）" value={title} onChange={setTitle} placeholder="記事の見出し、動画の題名、調書の名前 など" />
      <TextField
        label="本文・文字起こし（任意）"
        value={transcript}
        onChange={setTranscript}
        multiline
        placeholder="記事の本文や、YouTube の「文字起こしを表示」の内容を貼り付けると、範囲を選んで証言を書き起こせます"
      />

      {showsDetails ? (
        <fieldset className="space-y-3 rounded-md border p-3">
          <legend className="px-1 text-xs text-muted-foreground">詳しい情報</legend>
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

          <TextField label="発言者の立場（任意）" value={subjectRole} onChange={setSubjectRole} placeholder="参考人、被疑者、目撃者 など" />
          <TextField label="資料番号（任意）" value={documentRef} onChange={setDocumentRef} placeholder="調書番号 など" />
        </fieldset>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowsDetails(true)}>
          日時・媒体などを入力する
        </Button>
      )}

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
