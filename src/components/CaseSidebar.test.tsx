/**
 * ケースのサイドバー（表示の切り替え・登録済みの一覧・ケースの切り替え）のテスト
 *
 * サイドバーは SidebarProvider の中でしか動かないため、実際の画面と同じく
 * ケースを開く枠（CaseGate）と SidebarProvider の中に描画します。
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openTestCase } from '@/test/open-case';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CaseGate } from './CaseGate';
import { CaseSidebar } from './CaseSidebar';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** サンプルのケースを開いた状態で、サイドバーを描画します。 */
function renderSidebar() {
  render(
    <CaseGate caseId={sampleFictionalCase.id}>
      <SidebarProvider>
        <CaseSidebar />
      </SidebarProvider>
    </CaseGate>
  );
}

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

describe('CaseSidebar', () => {
  describe('表示の切り替え', () => {
    it('時系列・証言者別・地図をリンクとして並べ、開いている表示を示す', async () => {
      renderSidebar();

      const viewSwitch = await screen.findByRole('list', { name: '表示の切り替え' });
      expect(within(viewSwitch).getByRole('link', { name: '時系列' })).toHaveAttribute('href', '/cases/case-lakeside');
      expect(within(viewSwitch).getByRole('link', { name: '証言者別' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside?tab=speaker'
      );
      expect(within(viewSwitch).getByRole('link', { name: '地図' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
      // 検証: いま開いている表示は、読み上げにも現在地として伝える
      expect(within(viewSwitch).getByRole('link', { name: '時系列' })).toHaveAttribute('aria-current', 'page');
      expect(within(viewSwitch).getByRole('link', { name: '地図' })).not.toHaveAttribute('aria-current');
    });

    it('詳細を開いている間も、詳細を閉じてボードへ戻るリンクにする', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      renderSidebar();

      // 検証: ボードと詳細は1カラムで入れ替わるため、表示の切り替えは必ずボードへ戻る
      const viewSwitch = await screen.findByRole('list', { name: '表示の切り替え' });
      expect(within(viewSwitch).getByRole('link', { name: '地図' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
    });
  });

  describe('登録済みの一覧', () => {
    it('人物の一覧では、人物ではない種別を名前に添えて伝える', async () => {
      renderSidebar();

      const personList = await screen.findByRole('list', { name: '人物の一覧' });
      expect(within(personList).getByRole('link', { name: '県道の防犯カメラ（記録・媒体）' })).toBeInTheDocument();
      expect(within(personList).getByRole('link', { name: '県警（組織）' })).toBeInTheDocument();
    });

    it('人物の一覧を並べ、それぞれの詳細ページへのリンクにする', async () => {
      renderSidebar();

      const personList = await screen.findByRole('list', { name: '人物の一覧' });
      expect(within(personList).getByRole('link', { name: '隣家の住人' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/persons/person-neighbor'
      );
      // 前提: サンプルのケースには人物が7件ある
      expect(within(personList).getAllByRole('link')).toHaveLength(7);
    });

    it('場所の一覧を並べ、それぞれの詳細ページへのリンクにする', async () => {
      renderSidebar();

      const placeList = await screen.findByRole('list', { name: '場所の一覧' });
      expect(within(placeList).getByRole('link', { name: '湖畔の別荘' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/places/place-villa'
      );
    });

    it('人物・場所は、見出しの横のボタンから登録のページへ進める', async () => {
      renderSidebar();

      expect(await screen.findByRole('link', { name: '人物を登録' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/persons/new'
      );
      expect(screen.getByRole('link', { name: '場所を登録' })).toHaveAttribute('href', '/cases/case-lakeside/places/new');
    });

    it('資料の一覧を日時の早い順に並べ、それぞれの詳細ページへのリンクにし、見出しの横のボタンから登録のページへ進める', async () => {
      // 前提: 書籍の取材（2018年）と、管理人と隣家の住人がそろって応じた記者会見（1998年）を登録している
      openTestCase({
        ...sampleFictionalCase,
        interviews: [
          { id: 'interview-book', title: '管理人', interviewerPersonId: 'person-book', at: '2018-05' },
          { id: 'interview-press', title: '管理人、隣家の住人', at: '1998-08-14' },
        ],
      });
      renderSidebar();

      const interviewList = await screen.findByRole('list', { name: '資料の一覧' });
      const links = within(interviewList).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual([
        '管理人、隣家の住人・1998年8月14日',
        '管理人・2018年5月・湖畔の夏 20年目の証言（架空の書籍）',
      ]);
      expect(links[0]).toHaveAttribute('href', '/cases/case-lakeside/interviews/interview-press');
      expect(screen.getByRole('link', { name: '資料を登録' })).toHaveAttribute('href', '/cases/case-lakeside/interviews/new');
    });

    it('証言の一覧は、開いてから証言の詳細ページへのリンクを並べる', async () => {
      const user = userEvent.setup();
      renderSidebar();

      // 前提: 証言は数が多くサイドバーを占めるため、最初は折りたたんでいる
      expect(screen.queryByRole('list', { name: '証言の一覧' })).not.toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: /^証言/ }));

      const claimList = await screen.findByRole('list', { name: '証言の一覧' });
      expect(within(claimList).getByRole('link', { name: /明かりがついていて/ })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/claims/claim-neighbor'
      );
    });

    it('裏付けの無い証言の一覧は、裏付ける照合を1件も持たない証言だけを、詳細へのリンクで並べる', async () => {
      const user = userEvent.setup();
      renderSidebar();

      // 前提: 裏付ける照合は、防犯カメラ↔隣家の住人の1件だけ。管理人の証言は食い違う照合しか持たない
      await user.click(await screen.findByRole('button', { name: /^裏付けの無い証言/ }));

      const list = await screen.findByRole('list', { name: '裏付けの無い証言の一覧' });
      expect(within(list).getAllByRole('link')).toHaveLength(3);
      expect(within(list).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/claims/claim-caretaker'
      );
      expect(within(list).queryByRole('link', { name: /明かりがついていて/ })).not.toBeInTheDocument();
    });

    it('未完了の未了事項の件数を示し、未完了のものだけを、未了事項の詳細へのリンクで並べる', async () => {
      const user = userEvent.setup();
      renderSidebar();

      // 前提: 未完了の未了事項は、防犯カメラの映像の確認と管理人への再聴取の2件。天気の確認は完了している
      const heading = await screen.findByRole('button', { name: /^未完了の未了事項/ });
      expect(heading).toHaveTextContent('2');
      await user.click(heading);

      const list = await screen.findByRole('list', { name: '未完了の未了事項の一覧' });
      expect(within(list).getAllByRole('link')).toHaveLength(2);
      expect(within(list).getByRole('link', { name: /防犯カメラの映像/ })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/tasks/task-camera'
      );
      expect(within(list).queryByRole('link', { name: /天気/ })).not.toBeInTheDocument();
    });

    describe('登録が多い一覧', () => {
      /** サンプルのケースに人物を足し、人物が15件あるケースを開きます。 */
      function openCaseWith15Persons() {
        const extraPersons = Array.from({ length: 8 }, (_, index) => ({
          id: `person-villager-${index + 1}`,
          name: `村人${index + 1}`,
          kind: 'individual' as const,
        }));
        openTestCase({ ...sampleFictionalCase, persons: [...sampleFictionalCase.persons, ...extraPersons] });
      }

      it('最初は先頭の10件だけを並べ、残りの件数を示すボタンで、すべてを表示できる', async () => {
        const user = userEvent.setup();
        openCaseWith15Persons();
        renderSidebar();

        const personList = await screen.findByRole('list', { name: '人物の一覧' });
        // 前提: 一覧が長くなりすぎて、下の「場所」「証言」の見出しが画面の外へ押し出されないよう、10件で区切る
        expect(within(personList).getAllByRole('link')).toHaveLength(10);

        await user.click(screen.getByRole('button', { name: '人物をあと5件表示' }));

        expect(within(personList).getAllByRole('link')).toHaveLength(15);
        expect(screen.queryByRole('button', { name: '人物をあと5件表示' })).not.toBeInTheDocument();
      });

      it('開いている項目が11件目以降にある場合は、最初からすべてを並べる（現在地を見失わないため）', async () => {
        openCaseWith15Persons();
        resetMockNavigation('/cases/case-lakeside/persons/person-villager-8');
        renderSidebar();

        const personList = await screen.findByRole('list', { name: '人物の一覧' });
        expect(within(personList).getByRole('link', { name: '村人8' })).toHaveAttribute('aria-current', 'page');
        expect(within(personList).getAllByRole('link')).toHaveLength(15);
      });
    });

    it('開いている人物の詳細は、一覧でも現在地として示す', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      renderSidebar();

      const personList = await screen.findByRole('list', { name: '人物の一覧' });
      expect(within(personList).getByRole('link', { name: '隣家の住人' })).toHaveAttribute('aria-current', 'page');
      expect(within(personList).getByRole('link', { name: '管理人' })).not.toHaveAttribute('aria-current');
    });
  });

  describe('ケースの切り替え', () => {
    it('ケース名のメニューから、保存済みの他のケースとケースの一覧へ移れる', async () => {
      const user = userEvent.setup();
      // 前提: 切り替え先として、もう1件のケースを保存しておく
      openTestCase({ ...sampleFictionalCase, id: 'case-old-well', name: '古井戸の目撃証言（架空）' });
      openTestCase(sampleFictionalCase);
      renderSidebar();

      await user.click(await screen.findByRole('button', { name: /湖畔の別荘失踪事件（架空）/ }));

      expect(await screen.findByRole('menuitem', { name: '古井戸の目撃証言（架空）' })).toHaveAttribute(
        'href',
        '/cases/case-old-well'
      );
      expect(screen.getByRole('menuitem', { name: 'ケースの一覧' })).toHaveAttribute('href', '/');
    });
  });
  describe('検索', () => {
    it('検索窓でEnterキーを押すと、検索語を持たせた検索結果のページへ移る', async () => {
      const user = userEvent.setup();
      resetMockNavigation(`/cases/${sampleFictionalCase.id}?tab=map`);
      renderSidebar();

      await user.type(screen.getByRole('searchbox', { name: 'ボード全体を検索' }), '管理人{Enter}');

      expect(mockRouter.push).toHaveBeenCalledWith(`/cases/${sampleFictionalCase.id}/search?tab=map&q=${encodeURIComponent('管理人')}`);
    });

    it('URLの検索語が変わると、検索窓の文字列もそれに合わせる', () => {
      resetMockNavigation(`/cases/${sampleFictionalCase.id}/search?q=${encodeURIComponent('管理人')}`);
      renderSidebar();
      const getSearchBox = () => screen.getByRole('searchbox', { name: 'ボード全体を検索' });
      expect(getSearchBox()).toHaveValue('管理人');

      act(() => mockRouter.push(`/cases/${sampleFictionalCase.id}/search?q=${encodeURIComponent('隣家')}`));
      expect(getSearchBox()).toHaveValue('隣家');

      act(() => mockRouter.push(`/cases/${sampleFictionalCase.id}`));
      expect(getSearchBox()).toHaveValue('');
    });

    it('IMEの変換中のEnterキーでは、検索結果のページへ移らない', () => {
      renderSidebar();
      const getSearchBox = screen.getByRole('searchbox', { name: 'ボード全体を検索' });

      fireEvent.change(getSearchBox, { target: { value: 'かんりにん' } });
      fireEvent.keyDown(getSearchBox, { key: 'Enter', isComposing: true });

      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('空白だけの検索語では、検索結果のページへ移らない', async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.type(screen.getByRole('searchbox', { name: 'ボード全体を検索' }), '  {Enter}');

      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });
});
