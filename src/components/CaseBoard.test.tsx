/**
 * ボード全体（サイドバー・表示の切り替え・証言の詳細ページへの導線）のテスト
 *
 * ケースを開く処理は CaseGate が担うため、実際の画面と同じく CaseGate の中に描画します。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { saveCase } from '@/lib/case-storage';
import { resetMockNavigation } from '@/test/mock-navigation';
import { CaseBoard } from './CaseBoard';
import { CaseGate } from './CaseGate';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** サンプルのケースを保存済みの状態にして、ボードを描画します。detail は、ボードの横に並べる証言の詳細です。 */
function renderBoard(detail?: ReactNode) {
  saveCase(sampleFictionalCase);
  render(
    <CaseGate caseId={sampleFictionalCase.id}>
      <CaseBoard>{detail}</CaseBoard>
    </CaseGate>
  );
}

/** サイドバーの「表示の切り替え」から、指定した表示へのリンクを押します。 */
async function 表示を切り替える(user: ReturnType<typeof userEvent.setup>, name: string) {
  const 表示 = await screen.findByRole('list', { name: '表示の切り替え' });
  await user.click(within(表示).getByRole('link', { name }));
}

beforeEach(() => {
  localStorage.clear();
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

describe('CaseBoard', () => {
  it('保存済みのケースを復元して時系列のボードを最初に表示し、証言者別に切り替えられる', async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByRole('list', { name: '時系列' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: '時系列' })).getByText(/明かりがついていて/)).toBeInTheDocument();

    await 表示を切り替える(user, '証言者別');
    expect(screen.getByRole('region', { name: '隣家の住人' })).toBeInTheDocument();
  });

  it('ケースの名前と、いま開いている表示を、ボードの見出しに表示する', async () => {
    renderBoard();

    expect(await screen.findByRole('heading', { name: '湖畔の別荘失踪事件（架空）' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '時系列' })).toBeInTheDocument();
  });

  it('URLに tab=map を指定して開くと、地図の表示を最初に表示する', async () => {
    resetMockNavigation('/cases/case-lakeside?tab=map');
    renderBoard();

    expect(await screen.findByRole('region', { name: '地図に表示できない証言' })).toBeInTheDocument();
  });

  it('「地図」に切り替えると地図ビューを表示し、証言のメンションが場所の詳細ページへのリンクになる', async () => {
    const user = userEvent.setup();
    renderBoard();

    await 表示を切り替える(user, '地図');

    // 前提: サンプルのケースの場所には座標が無いため、湖畔の別荘に言及する証言（2件）は「地図に表示できない証言」に並ぶ
    const 一覧 = screen.getByRole('region', { name: '地図に表示できない証言' });
    expect(within(一覧).getAllByRole('link', { name: '@湖畔の別荘' })[0]!).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa?tab=map'
    );
  });

  it('ボード上のメンションは、その人物・場所の詳細ページへのリンクになる（オーバーレイでは開かない）', async () => {
    renderBoard();

    const 隣家の証言 = (await screen.findByText(/明かりがついていて/)).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: '@湖畔の別荘' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa'
    );
    // 検証: 登録済みの一覧はサイドバーに常設したため、ボードを覆うオーバーレイは持たない
    expect(screen.queryByRole('complementary', { name: '登録済みの一覧' })).not.toBeInTheDocument();
  });

  it('証言のカードは、その証言の詳細ページへのリンクになる（編集の導線は詳細ページに一本化している）', async () => {
    renderBoard();

    const 隣家の証言 = (await screen.findByText(/明かりがついていて/)).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: /を開く$/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-neighbor'
    );
    expect(within(隣家の証言).queryByRole('button', { name: 'この証言を編集' })).not.toBeInTheDocument();
  });

  it('地図の表示の証言のカードは、戻り先の表示を引き継いだURLへのリンクになる', async () => {
    resetMockNavigation('/cases/case-lakeside?tab=map');
    renderBoard();

    const 一覧 = await screen.findByRole('region', { name: '地図に表示できない証言' });
    const 隣家の証言 = within(一覧).getByText(/明かりがついていて/).closest('li')!;
    expect(within(隣家の証言).getByRole('link', { name: /を開く$/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-neighbor?tab=map'
    );
  });

  describe('証言の詳細を横に並べる表示（2ペイン）', () => {
    it('証言の詳細ページのURLでは、ボードの横に証言の詳細を並べ、開いている証言のカードを示す', async () => {
      resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
      renderBoard(<p>隣家の住人の証言の詳細</p>);

      // 検証: ボードを覆わずに横へ並べるため、時系列は表示したままになる
      const 詳細 = await screen.findByRole('complementary', { name: '証言の詳細' });
      expect(within(詳細).getByText('隣家の住人の証言の詳細')).toBeInTheDocument();

      const 時系列 = screen.getByRole('list', { name: '時系列' });
      const 隣家の証言 = within(時系列).getByText(/明かりがついていて/).closest('li')!;
      const 管理人の証言 = within(時系列).getByText(/見回りをしたとき/).closest('li')!;
      expect(within(隣家の証言).getByRole('link', { name: /を開く$/ })).toHaveAttribute('aria-current', 'true');
      expect(within(管理人の証言).getByRole('link', { name: /を開く$/ })).not.toHaveAttribute('aria-current');
    });

    it('証言を開いていないURLでは、証言の詳細の枠を表示しない', async () => {
      renderBoard();

      await screen.findByRole('list', { name: '時系列' });
      expect(screen.queryByRole('complementary', { name: '証言の詳細' })).not.toBeInTheDocument();
    });

    it('証言を開いたまま表示を切り替えると、証言を開いたままのURLに切り替える', async () => {
      const user = userEvent.setup();
      resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
      renderBoard(<p>隣家の住人の証言の詳細</p>);

      const 表示 = await screen.findByRole('list', { name: '表示の切り替え' });
      expect(within(表示).getByRole('link', { name: '証言者別' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/claims/claim-neighbor?tab=speaker'
      );

      await 表示を切り替える(user, '証言者別');
      expect(screen.getByRole('complementary', { name: '証言の詳細' })).toBeInTheDocument();
    });
  });

  describe('人物・場所の詳細を横に並べる表示（2ペイン）', () => {
    it('人物の詳細ページのURLでは、ボードの横に人物の詳細を並べ、時系列は表示したままにする', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      renderBoard(<p>隣家の住人の詳細</p>);

      const 詳細 = await screen.findByRole('complementary', { name: '人物の詳細' });
      expect(within(詳細).getByText('隣家の住人の詳細')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: '時系列' })).toBeInTheDocument();
    });

    it('場所の詳細ページのURLでは、ボードの横に場所の詳細を並べる', async () => {
      resetMockNavigation('/cases/case-lakeside/places/place-villa');
      renderBoard(<p>湖畔の別荘の詳細</p>);

      const 詳細 = await screen.findByRole('complementary', { name: '場所の詳細' });
      expect(within(詳細).getByText('湖畔の別荘の詳細')).toBeInTheDocument();
    });

    it('人物を新しく登録するURLでも、ボードの横に登録の枠を並べる', async () => {
      resetMockNavigation('/cases/case-lakeside/new/person');
      renderBoard(<p>人物の登録フォーム</p>);

      const 登録 = await screen.findByRole('complementary', { name: '人物の登録' });
      expect(within(登録).getByText('人物の登録フォーム')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: '時系列' })).toBeInTheDocument();
    });

    it('場所を新しく登録するURLでも、ボードの横に登録の枠を並べる', async () => {
      resetMockNavigation('/cases/case-lakeside/new/place');
      renderBoard(<p>場所の登録フォーム</p>);

      expect(await screen.findByRole('complementary', { name: '場所の登録' })).toBeInTheDocument();
    });

    it('人物の詳細を開いている間は、証言のカードを開いている扱いにしない', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      renderBoard(<p>隣家の住人の詳細</p>);

      const 時系列 = await screen.findByRole('list', { name: '時系列' });
      const 隣家の証言 = within(時系列).getByText(/明かりがついていて/).closest('li')!;
      expect(within(隣家の証言).getByRole('link', { name: /を開く$/ })).not.toHaveAttribute('aria-current');
    });
  });
});
