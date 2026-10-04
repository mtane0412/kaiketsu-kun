/**
 * 聴取の入力フォームのテスト（URL・タイトル・本文だけでの登録、詳しい情報の入力と、記事のURLから本文を取得して本文の欄に入れる操作）
 *
 * 本文の取得 API（/api/fetch-article）の呼び出しは、fetch を置き換えて確かめます。
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Interview } from '@/domain/types';
import { openedCase, openTestCase } from '@/test/open-case';
import { InterviewForm } from './InterviewForm';

/** 記事のURLです。 */
const articleUrl = 'https://news.example.com/kohan-1998';

/** 本文の取得 API が返す、湖畔新聞の記事です。 */
const fetchedArticle = {
  text: '13日午前2時ごろ、湖畔の別荘から火が出た。\n別荘の管理人は「12日の夜は別荘が真っ暗でした」と話している。',
  title: '湖畔の別荘で火事',
  publishedAt: '1998-08-13T06:30',
};

/** 本文を貼り付け済みの、湖畔新聞による管理人への取材です。 */
const pastedInterview: Interview = {
  id: 'interview-newspaper',
  title: '管理人の話',
  at: '1998-08-14',
  transcript: '手で貼り付けた本文',
};

beforeEach(() => {
  openTestCase(sampleFictionalCase);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 本文の取得 API を、指定した状態コードと JSON を返すように置き換えます。 */
function mockFetchArticleApi(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(body, { status }));
}

/** 聴取のフォームを描画します。initial を省くと新規登録になります。 */
function renderForm(initial?: Interview) {
  const onDone = vi.fn();
  render(<InterviewForm initial={initial} onDone={onDone} onCancel={vi.fn()} />);
  return { onDone };
}

/** 本文の欄に、取得した記事の本文が入るまで待ちます（本文は改行を含むため、欄の値で比べます）。 */
async function waitForFetchedText() {
  await waitFor(() => expect(screen.getByLabelText('本文・文字起こし（任意）')).toHaveValue(fetchedArticle.text));
}

/** URLの欄に記事のURLを入れ、「本文を取得」を押します。 */
async function fetchArticle(user: ReturnType<typeof userEvent.setup>, url = articleUrl) {
  await user.clear(screen.getByLabelText('URL（任意）'));
  await user.type(screen.getByLabelText('URL（任意）'), url);
  await user.click(screen.getByRole('button', { name: '本文を取得' }));
}

describe('InterviewForm の入力', () => {
  it('URLだけを入れて保存すると、URLだけを持つ資料として保存する（人物を先に登録しなくても資料を登録できるようにするため）', async () => {
    const user = userEvent.setup();
    const { onDone } = renderForm();

    await user.type(screen.getByLabelText('URL（任意）'), articleUrl);
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    const saved = openedCase().interviews[0];
    expect(saved).toEqual({ id: expect.any(String), url: articleUrl });
    expect(onDone).toHaveBeenCalledWith(saved);
  });

  it('タイトルは前後の空白を除いて保存する', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('タイトル（任意）'), '  管理人への取材メモ  ');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(openedCase().interviews[0]).toEqual({ id: expect.any(String), title: '管理人への取材メモ' });
  });

  it('タイトル・URL・本文のいずれも無い場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(screen.getByText('タイトル・URL・本文のいずれかを入力してください')).toBeInTheDocument();
    expect(openedCase().interviews).toEqual([]);
  });

  it('日時・媒体などの詳しい情報は、最初は閉じておき、開くと入力して保存できる', async () => {
    const user = userEvent.setup();
    renderForm();

    expect(screen.queryByLabelText('日時（任意）')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('タイトル（任意）'), '管理人の供述調書');
    await user.click(screen.getByRole('button', { name: '日時・媒体などを入力する' }));
    await user.type(screen.getByLabelText('日時（任意）'), '1998-08-13');
    await user.selectOptions(screen.getByLabelText('聴取者または媒体（任意）'), '県警');
    await user.selectOptions(screen.getByLabelText('場所（任意）'), '湖畔の別荘');
    await user.type(screen.getByLabelText('発言者の立場（任意）'), '参考人');
    await user.type(screen.getByLabelText('資料番号（任意）'), '供述調書 第1号');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(openedCase().interviews[0]).toEqual({
      id: expect.any(String),
      title: '管理人の供述調書',
      at: '1998-08-13',
      interviewerPersonId: 'person-police',
      placeId: 'place-villa',
      subjectRole: '参考人',
      documentRef: '供述調書 第1号',
    });
  });

  it('http か https でないURLでは、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('URL（任意）'), '動画のページ');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(screen.getByText(/URLは http か https/)).toBeInTheDocument();
    expect(openedCase().interviews).toEqual([]);
  });

  it('日時として解釈できない表記では、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('タイトル（任意）'), '管理人の供述調書');
    await user.click(screen.getByRole('button', { name: '日時・媒体などを入力する' }));
    await user.type(screen.getByLabelText('日時（任意）'), '事件の翌週');
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(screen.getByText(/日時を解釈できません/)).toBeInTheDocument();
    expect(openedCase().interviews).toEqual([]);
  });

  it('編集では、詳しい情報が入力済みなら開いた状態で始まる', () => {
    renderForm(pastedInterview);

    expect(screen.getByLabelText('日時（任意）')).toHaveValue('1998-08-14');
  });
});

describe('InterviewForm の本文の取得', () => {
  it('記事のURLから取得した本文を本文の欄に、公開日時を日時の欄に入れ、保存はしない', async () => {
    const fetchSpy = mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm();

    await fetchArticle(user);

    await waitForFetchedText();
    // 検証: 公開日時を入れた日時の欄が見えるよう、詳しい情報を開く
    expect(screen.getByLabelText('日時（任意）')).toHaveValue('1998-08-13T06:30');
    expect(screen.getByLabelText('タイトル（任意）')).toHaveValue('湖畔の別荘で火事');
    expect(screen.getByRole('status')).toHaveTextContent('「湖畔の別荘で火事」の本文（');
    expect(fetchSpy).toHaveBeenCalledWith('/api/fetch-article', expect.objectContaining({ method: 'POST' }));
    expect(openedCase().interviews).toEqual(sampleFictionalCase.interviews);
  });

  it('取得した本文は「資料を保存」で保存する', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    const { onDone } = renderForm();

    await fetchArticle(user);
    await waitForFetchedText();
    await user.click(screen.getByRole('button', { name: '資料を保存' }));

    expect(onDone).toHaveBeenCalled();
    const saved = openedCase().interviews.find((interview) => interview.url === articleUrl);
    expect(saved).toMatchObject({ title: fetchedArticle.title, transcript: fetchedArticle.text, at: '1998-08-13T06:30' });
  });

  it('タイトルの欄に入力がある場合は、記事のタイトルで上書きしない', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('タイトル（任意）'), '火事の第一報');
    await fetchArticle(user);

    await waitForFetchedText();
    expect(screen.getByLabelText('タイトル（任意）')).toHaveValue('火事の第一報');
  });

  it('日時の欄に入力がある場合は、公開日時で上書きしない', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm({ id: 'interview-newspaper', title: '管理人の話', at: '1998-08-14' });

    await fetchArticle(user);

    await waitForFetchedText();
    expect(screen.getByLabelText('日時（任意）')).toHaveValue('1998-08-14');
  });

  it('本文の欄に入力がある場合は、置き換える前に確認し、やめると本文を変えない', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm(pastedInterview);

    await fetchArticle(user);
    const dialog = await screen.findByRole('alertdialog', { name: '本文を置き換えますか？' });
    await user.click(within(dialog).getByRole('button', { name: 'やめる' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByLabelText('本文・文字起こし（任意）')).toHaveValue('手で貼り付けた本文');
  });

  it('本文の欄に入力がある場合も、確認して承認すると本文を置き換える', async () => {
    mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm(pastedInterview);

    await fetchArticle(user);
    const dialog = await screen.findByRole('alertdialog', { name: '本文を置き換えますか？' });
    await user.click(within(dialog).getByRole('button', { name: '置き換える' }));

    await waitForFetchedText();
  });

  it('取得に失敗した場合は、理由を示し、本文の欄を変えない', async () => {
    mockFetchArticleApi(504, { error: '記事のページが時間内に応答しませんでした。' });
    const user = userEvent.setup();
    renderForm(pastedInterview);

    await fetchArticle(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('記事のページが時間内に応答しませんでした。');
    expect(screen.getByLabelText('本文・文字起こし（任意）')).toHaveValue('手で貼り付けた本文');
  });

  it('YouTube のURLでは取得せず、文字起こしを貼り付けるよう案内する', async () => {
    const fetchSpy = mockFetchArticleApi(200, fetchedArticle);
    const user = userEvent.setup();
    renderForm();

    await fetchArticle(user, 'https://www.youtube.com/watch?v=abc');

    expect(await screen.findByRole('alert')).toHaveTextContent('YouTube の「文字起こしを表示」の内容を、本文の欄に貼り付けてください。');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
