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
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
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
async function switchView(user: ReturnType<typeof userEvent.setup>, name: string) {
  const viewSwitch = await screen.findByRole('list', { name: '表示の切り替え' });
  await user.click(within(viewSwitch).getByRole('link', { name }));
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

    await switchView(user, '証言者別');
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

  it('「人物の動き」に切り替えると、人物ごとの列に証言を並べた表を表示する', async () => {
    const user = userEvent.setup();
    renderBoard();

    await switchView(user, '人物の動き');

    expect(await screen.findByRole('table', { name: '人物の動き' })).toBeInTheDocument();
  });

  it('「グラフ」に切り替えるとグラフビューを表示し、ノードが人物の詳細ページへのリンクになる', async () => {
    const user = userEvent.setup();
    renderBoard();

    await switchView(user, 'グラフ');

    const diagram = screen.getByRole('group', { name: '人物と証言のつながり' });
    expect(within(diagram).getByRole('link', { name: '人物: 管理人' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-caretaker?tab=graph'
    );
  });

  it('「地図」に切り替えると地図ビューを表示し、証言のメンションが場所の詳細ページへのリンクになる', async () => {
    const user = userEvent.setup();
    renderBoard();

    await switchView(user, '地図');

    // 前提: サンプルのケースの場所には座標が無いため、湖畔の別荘に言及する証言（2件）は「地図に表示できない証言」に並ぶ
    const list = screen.getByRole('region', { name: '地図に表示できない証言' });
    expect(within(list).getAllByRole('link', { name: '@湖畔の別荘' })[0]!).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa?tab=map'
    );
  });

  it('ボード上のメンションは、その人物・場所の詳細ページへのリンクになる（オーバーレイでは開かない）', async () => {
    renderBoard();

    const neighborClaim = (await screen.findByText(/明かりがついていて/)).closest('li')!;
    expect(within(neighborClaim).getByRole('link', { name: '@湖畔の別荘' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa'
    );
    // 検証: 登録済みの一覧はサイドバーに常設したため、ボードを覆うオーバーレイは持たない
    expect(screen.queryByRole('complementary', { name: '登録済みの一覧' })).not.toBeInTheDocument();
  });

  it('証言のカードは、その証言の詳細ページへのリンクになる（編集の導線は詳細ページに一本化している）', async () => {
    renderBoard();

    const neighborClaim = (await screen.findByText(/明かりがついていて/)).closest('li')!;
    expect(within(neighborClaim).getByRole('link', { name: /を開く$/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-neighbor'
    );
    expect(within(neighborClaim).queryByRole('button', { name: 'この証言を編集' })).not.toBeInTheDocument();
  });

  it('地図の表示の証言のカードは、戻り先の表示を引き継いだURLへのリンクになる', async () => {
    resetMockNavigation('/cases/case-lakeside?tab=map');
    renderBoard();

    const list = await screen.findByRole('region', { name: '地図に表示できない証言' });
    const neighborClaim = within(list).getByText(/明かりがついていて/).closest('li')!;
    expect(within(neighborClaim).getByRole('link', { name: /を開く$/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-neighbor?tab=map'
    );
  });

  it('「未了事項」に切り替えると、未完了の未了事項の一覧を表示する', async () => {
    const user = userEvent.setup();
    renderBoard();

    await switchView(user, '未了事項');

    const list = await screen.findByRole('list', { name: '未完了の未了事項の一覧' });
    expect(within(list).getByRole('link', { name: /防犯カメラの映像/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/task-camera?tab=tasks'
    );
  });

  it('「仮説」に切り替えると、仮説の一覧を表示し、仮説の詳細ページへのリンクを並べる', async () => {
    const user = userEvent.setup();
    renderBoard();

    await switchView(user, '仮説');

    const list = await screen.findByRole('list', { name: '仮説の一覧' });
    expect(within(list).getByRole('link', { name: /管理人が失踪に関わっている/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/hypotheses/hypothesis-caretaker?tab=hypotheses'
    );
  });

  describe('詳細を1カラムで表示する', () => {
    it('証言の詳細ページのURLでは、詳細だけを表示し、ボードは隠す', async () => {
      resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
      renderBoard(<p>隣家の住人の証言の詳細</p>);

      const detailRegion = await screen.findByRole('region', { name: '証言の詳細' });
      expect(within(detailRegion).getByText('隣家の住人の証言の詳細')).toBeInTheDocument();
      // 検証: 1カラムのため、詳細を開いている間はボードを画面から隠す
      expect(screen.queryByRole('list', { name: '時系列' })).not.toBeInTheDocument();
    });

    it('詳細を開いている間も、ボードは描画したまま隠すだけにする（入力中の内容を保つため）', async () => {
      resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
      renderBoard(<p>隣家の住人の証言の詳細</p>);

      await screen.findByRole('region', { name: '証言の詳細' });
      // 検証: 読み上げから外れる（hidden）だけで、要素そのものは残っている
      const timeline = screen.getByRole('list', { name: '時系列', hidden: true });
      expect(timeline).toBeInTheDocument();
    });

    it('証言を開いていないURLでは、詳細の枠を表示せず、ボードを表示する', async () => {
      renderBoard();

      expect(await screen.findByRole('list', { name: '時系列' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: '証言の詳細' })).not.toBeInTheDocument();
    });

    it('詳細を開いている間は、ボードの見出しに、開いている詳細の名前を表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      renderBoard(<p>隣家の住人の詳細</p>);

      expect(await screen.findByRole('heading', { name: '人物の詳細' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '時系列' })).not.toBeInTheDocument();
    });

    it('人物の詳細ページのURLでは、人物の詳細だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      renderBoard(<p>隣家の住人の詳細</p>);

      const detailRegion = await screen.findByRole('region', { name: '人物の詳細' });
      expect(within(detailRegion).getByText('隣家の住人の詳細')).toBeInTheDocument();
    });

    it('場所の詳細ページのURLでは、場所の詳細だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/places/place-villa');
      renderBoard(<p>湖畔の別荘の詳細</p>);

      const detailRegion = await screen.findByRole('region', { name: '場所の詳細' });
      expect(within(detailRegion).getByText('湖畔の別荘の詳細')).toBeInTheDocument();
    });

    it('人物を新しく登録するURLでも、登録の枠だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/new');
      renderBoard(<p>人物の登録フォーム</p>);

      const registerButton = await screen.findByRole('region', { name: '人物の登録' });
      expect(within(registerButton).getByText('人物の登録フォーム')).toBeInTheDocument();
    });

    it('場所を新しく登録するURLでも、登録の枠だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/places/new');
      renderBoard(<p>場所の登録フォーム</p>);

      expect(await screen.findByRole('region', { name: '場所の登録' })).toBeInTheDocument();
    });

    it('仮説の詳細ページのURLでは、仮説の詳細だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/hypotheses/hypothesis-caretaker?tab=hypotheses');
      renderBoard(<p>管理人の仮説の詳細</p>);

      const detailRegion = await screen.findByRole('region', { name: '仮説の詳細' });
      expect(within(detailRegion).getByText('管理人の仮説の詳細')).toBeInTheDocument();
    });

    it('未了事項の詳細ページのURLでは、未了事項の詳細だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/tasks/task-camera?tab=tasks');
      renderBoard(<p>防犯カメラの確認の詳細</p>);

      const detailRegion = await screen.findByRole('region', { name: '未了事項の詳細' });
      expect(within(detailRegion).getByText('防犯カメラの確認の詳細')).toBeInTheDocument();
    });

    it('未了事項を新しく登録するURLでも、登録の枠だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/tasks/new?tab=tasks');
      renderBoard(<p>未了事項の登録フォーム</p>);

      expect(await screen.findByRole('region', { name: '未了事項の登録' })).toBeInTheDocument();
    });

    it('仮説を新しく登録するURLでも、登録の枠だけを表示する', async () => {
      resetMockNavigation('/cases/case-lakeside/hypotheses/new?tab=hypotheses');
      renderBoard(<p>仮説の登録フォーム</p>);

      expect(await screen.findByRole('region', { name: '仮説の登録' })).toBeInTheDocument();
    });

    it('詳細を開いたまま表示を切り替えると、詳細を閉じてボードへ戻る', async () => {
      const user = userEvent.setup();
      resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
      renderBoard(<p>隣家の住人の証言の詳細</p>);

      const viewSwitch = await screen.findByRole('list', { name: '表示の切り替え' });
      expect(within(viewSwitch).getByRole('link', { name: '証言者別' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside?tab=speaker'
      );

      await switchView(user, '証言者別');
      expect(screen.queryByRole('region', { name: '証言の詳細' })).not.toBeInTheDocument();
    });
  });
});

describe('CaseBoard のキーボード操作', () => {
  it('ページの先頭に、サイドバーを飛ばして本文へ移るリンクを置く', async () => {
    renderBoard();

    const skipLink = await screen.findByRole('link', { name: '本文へ移動' });
    // 前提: リンク先は、ボード・詳細を表示するメインの領域
    expect(skipLink).toHaveAttribute('href', '#board-main');
    expect(document.getElementById('board-main')).toBeInTheDocument();
  });

  it('サイドバーを開閉するボタンの名前を日本語で読み上げる', async () => {
    renderBoard();

    expect(await screen.findByRole('button', { name: 'サイドバーを開閉' })).toBeInTheDocument();
  });

  it('詳細を開いているときに Esc キーを押すと、詳細を閉じて元の表示に戻る', async () => {
    const user = userEvent.setup();
    // 前提: グラフの表示から、証言の詳細を開いている
    resetMockNavigation(`/cases/${sampleFictionalCase.id}/claims/claim-neighbor?tab=graph`);
    renderBoard(<p>隣家の住人の証言の詳細</p>);
    await screen.findByText('隣家の住人の証言の詳細');

    await user.keyboard('{Escape}');

    expect(mockRouter.push).toHaveBeenCalledWith(`/cases/${sampleFictionalCase.id}?tab=graph`);
  });

  it('入力欄で文字を書いている間は、Esc キーを押しても詳細を閉じない（書きかけの内容を失わないため）', async () => {
    const user = userEvent.setup();
    resetMockNavigation(`/cases/${sampleFictionalCase.id}/claims/claim-neighbor`);
    renderBoard(<textarea aria-label="証言の本文" />);

    await user.click(await screen.findByRole('textbox', { name: '証言の本文' }));
    await user.keyboard('{Escape}');

    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('「/」キーまたは ⌘K で、ボード全体の検索窓へ移る', async () => {
    const user = userEvent.setup();
    renderBoard();
    const searchBox = await screen.findByRole('searchbox', { name: 'ボード全体を検索' });

    await user.keyboard('/');
    expect(searchBox).toHaveFocus();
    // 前提: 検索窓へ移るためのキーは、検索語として入力しない
    expect(searchBox).toHaveValue('');

    searchBox.blur();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(searchBox).toHaveFocus();
  });

  it('入力欄で「/」を打ったときは、検索窓へ移らずにそのまま文字を入力する', async () => {
    const user = userEvent.setup();
    resetMockNavigation(`/cases/${sampleFictionalCase.id}/claims/claim-neighbor`);
    renderBoard(<input aria-label="資料番号" />);

    const field = await screen.findByRole('textbox', { name: '資料番号' });
    await user.click(field);
    await user.keyboard('1/2');

    expect(field).toHaveValue('1/2');
    expect(field).toHaveFocus();
  });
});
