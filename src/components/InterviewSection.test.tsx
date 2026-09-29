/**
 * 人物の詳細に並べる「供述の変遷」（その人物が相手の聴取の一覧・登録・編集・削除と、聴取からの証言の書き足し）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Interview } from '@/domain/types';
import { openedCase, openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { InterviewSection } from './InterviewSection';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 管理人への県警の初回の聴取です（事件の翌日。証言はまだひもづけていません）。 */
const 初回の聴取: Interview = {
  id: 'interview-first',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-police',
  at: '1998-08-13T10:00',
  placeId: 'place-villa',
  subjectRole: '参考人',
  documentRef: '供述調書 第1号',
};

/** 20年後の、書籍の著者による取材です（管理人の証言をひもづけています）。 */
const 書籍の取材: Interview = {
  id: 'interview-book',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 登録順を日時の順と逆にし、書籍の取材に管理人の証言をひもづけたケースです。 */
const 聴取を持つケース: Case = {
  ...sampleFictionalCase,
  interviews: [書籍の取材, 初回の聴取],
  claims: sampleFictionalCase.claims.map((claim) =>
    claim.id === 'claim-caretaker' ? { ...claim, interviewId: 書籍の取材.id } : claim
  ),
};

beforeEach(() => {
  localStorage.clear();
  openTestCase(聴取を持つケース);
  resetMockNavigation('/cases/case-lakeside/persons/person-caretaker');
});

/** 管理人の詳細に並ぶ「供述の変遷」を描画します。 */
function 管理人の供述の変遷を描画() {
  render(<InterviewSection personId="person-caretaker" tab="timeline" />);
  return screen.getByRole('region', { name: '供述の変遷' });
}

describe('InterviewSection', () => {
  it('この人物が相手の聴取を、日時の早い順に、聴取者・場所・立場・資料番号とともに並べる', () => {
    const 変遷 = 管理人の供述の変遷を描画();

    const 聴取の見出し = within(変遷).getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent);
    expect(聴取の見出し).toEqual(['1998年8月13日 10:00', '2018年5月']);
    expect(within(変遷).getByText('聴取者: 県警 / 場所: 湖畔の別荘 / 立場: 参考人 / 資料: 供述調書 第1号')).toBeInTheDocument();
  });

  it('各聴取の下に、その聴取で得た証言を、証言の詳細へのリンクで並べる', () => {
    const 変遷 = 管理人の供述の変遷を描画();

    expect(within(変遷).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
    expect(within(変遷).getByText('この聴取にひもづく証言は、まだありません。')).toBeInTheDocument();
  });

  it('聴取が1件も無い人物では、聴取の登録を促す案内を表示する', () => {
    render(<InterviewSection personId="person-neighbor" tab="timeline" />);

    const 変遷 = screen.getByRole('region', { name: '供述の変遷' });
    expect(within(変遷).getByRole('button', { name: '聴取を追加' })).toBeInTheDocument();
    expect(within(変遷).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('日時・聴取者・場所・立場・資料番号を入力して保存すると、この人物を相手とする聴取をケースに追加する', async () => {
    const user = userEvent.setup();
    管理人の供述の変遷を描画();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    const 登録 = screen.getByRole('region', { name: '聴取の登録' });
    await user.type(within(登録).getByLabelText('日時（任意）'), '1998年8月20日14時');
    await user.selectOptions(within(登録).getByLabelText('聴取者または媒体（任意）'), 'person-police');
    await user.selectOptions(within(登録).getByLabelText('場所（任意）'), 'place-villa');
    await user.type(within(登録).getByLabelText('相手の立場（任意）'), '参考人');
    await user.type(within(登録).getByLabelText('資料番号（任意）'), '供述調書 第2号');
    await user.click(within(登録).getByRole('button', { name: '聴取を保存' }));

    expect(openedCase().interviews.at(-1)).toMatchObject({
      subjectPersonId: 'person-caretaker',
      interviewerPersonId: 'person-police',
      at: '1998-08-20T14:00',
      placeId: 'place-villa',
      subjectRole: '参考人',
      documentRef: '供述調書 第2号',
    });
  });

  it('任意の項目を入力しない聴取は、その項目を持たずに保存する', async () => {
    const user = userEvent.setup();
    管理人の供述の変遷を描画();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    await user.click(within(screen.getByRole('region', { name: '聴取の登録' })).getByRole('button', { name: '聴取を保存' }));

    const 追加された聴取 = openedCase().interviews.at(-1);
    expect(追加された聴取).toEqual({ id: expect.any(String), subjectPersonId: 'person-caretaker' });
  });

  it('日時として解釈できない表記では、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    管理人の供述の変遷を描画();

    await user.click(screen.getByRole('button', { name: '聴取を追加' }));
    const 登録 = screen.getByRole('region', { name: '聴取の登録' });
    await user.type(within(登録).getByLabelText('日時（任意）'), '事件の翌週');
    await user.click(within(登録).getByRole('button', { name: '聴取を保存' }));

    expect(within(登録).getByText(/日時を解釈できません/)).toBeInTheDocument();
    expect(openedCase().interviews).toHaveLength(2);
  });

  it('登録済みの聴取を編集して保存すると、同じ聴取を書き換える', async () => {
    const user = userEvent.setup();
    const 変遷 = 管理人の供述の変遷を描画();

    await user.click(within(変遷).getByRole('button', { name: '1998年8月13日 10:00の聴取を編集' }));
    const 編集 = screen.getByRole('region', { name: '聴取の編集' });
    expect(within(編集).getByLabelText('日時（任意）')).toHaveValue('1998-08-13T10:00');
    await user.clear(within(編集).getByLabelText('相手の立場（任意）'));
    await user.type(within(編集).getByLabelText('相手の立場（任意）'), '重要参考人');
    await user.click(within(編集).getByRole('button', { name: '聴取を保存' }));

    expect(openedCase().interviews.find((interview) => interview.id === 初回の聴取.id)).toEqual({
      ...初回の聴取,
      subjectRole: '重要参考人',
    });
  });

  it('証言がひもづいていない聴取を削除すると、ケースから聴取を取り除く', async () => {
    const user = userEvent.setup();
    const 変遷 = 管理人の供述の変遷を描画();

    await user.click(within(変遷).getByRole('button', { name: '1998年8月13日 10:00の聴取を削除' }));
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().interviews.map((interview) => interview.id)).toEqual([書籍の取材.id]);
  });

  it('証言がひもづいている聴取は削除できず、理由を示す', async () => {
    const user = userEvent.setup();
    const 変遷 = 管理人の供述の変遷を描画();

    await user.click(within(変遷).getByRole('button', { name: '2018年5月の聴取を削除' }));
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(within(変遷).getByText(/他のデータから参照されているため削除できません/)).toBeInTheDocument();
    expect(openedCase().interviews).toHaveLength(2);
  });

  it('「この聴取の証言を書き足す」から書いた証言は、その聴取にひもづき、聴取の相手の発言として保存する', async () => {
    const user = userEvent.setup();
    const 変遷 = 管理人の供述の変遷を描画();

    await user.click(within(変遷).getByRole('button', { name: '1998年8月13日 10:00の聴取の証言を書き足す' }));
    const 書き足し = screen.getByRole('region', { name: '聴取の証言の書き足し' });
    await user.type(within(書き足し).getByLabelText('内容'), '見回りは夜10時ごろで、別荘には明かりがついていた。');
    await user.click(within(書き足し).getByRole('button', { name: '書き足す' }));

    expect(openedCase().claims.at(-1)).toMatchObject({
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
      interviewId: 初回の聴取.id,
    });
    expect(screen.queryByRole('region', { name: '聴取の証言の書き足し' })).not.toBeInTheDocument();
  });
});
