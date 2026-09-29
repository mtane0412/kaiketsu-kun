/**
 * ケースのサイドバー（表示の切り替え・登録済みの一覧・ケースの切り替え）のテスト
 *
 * サイドバーは SidebarProvider の中でしか動かないため、実際の画面と同じく
 * ケースを開く枠（CaseGate）と SidebarProvider の中に描画します。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CaseGate } from './CaseGate';
import { CaseSidebar } from './CaseSidebar';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** サンプルのケースを開いた状態で、サイドバーを描画します。 */
function サイドバーを描画する() {
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
      サイドバーを描画する();

      const 表示 = await screen.findByRole('list', { name: '表示の切り替え' });
      expect(within(表示).getByRole('link', { name: '時系列' })).toHaveAttribute('href', '/cases/case-lakeside');
      expect(within(表示).getByRole('link', { name: '証言者別' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside?tab=speaker'
      );
      expect(within(表示).getByRole('link', { name: '地図' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
      // 検証: いま開いている表示は、読み上げにも現在地として伝える
      expect(within(表示).getByRole('link', { name: '時系列' })).toHaveAttribute('aria-current', 'page');
      expect(within(表示).getByRole('link', { name: '地図' })).not.toHaveAttribute('aria-current');
    });

    it('詳細を開いている間も、詳細を閉じてボードへ戻るリンクにする', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      サイドバーを描画する();

      // 検証: ボードと詳細は1カラムで入れ替わるため、表示の切り替えは必ずボードへ戻る
      const 表示 = await screen.findByRole('list', { name: '表示の切り替え' });
      expect(within(表示).getByRole('link', { name: '地図' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
    });
  });

  describe('登録済みの一覧', () => {
    it('人物の一覧では、人物ではない種別を名前に添えて伝える', async () => {
      サイドバーを描画する();

      const 人物の一覧 = await screen.findByRole('list', { name: '人物の一覧' });
      expect(within(人物の一覧).getByRole('link', { name: '県道の防犯カメラ（記録・媒体）' })).toBeInTheDocument();
      expect(within(人物の一覧).getByRole('link', { name: '県警（組織）' })).toBeInTheDocument();
    });

    it('人物の一覧を並べ、それぞれの詳細ページへのリンクにする', async () => {
      サイドバーを描画する();

      const 人物の一覧 = await screen.findByRole('list', { name: '人物の一覧' });
      expect(within(人物の一覧).getByRole('link', { name: '隣家の住人' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/persons/person-neighbor'
      );
      // 前提: サンプルのケースには人物が7件ある
      expect(within(人物の一覧).getAllByRole('link')).toHaveLength(7);
    });

    it('場所の一覧を並べ、それぞれの詳細ページへのリンクにする', async () => {
      サイドバーを描画する();

      const 場所の一覧 = await screen.findByRole('list', { name: '場所の一覧' });
      expect(within(場所の一覧).getByRole('link', { name: '湖畔の別荘' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/places/place-villa'
      );
    });

    it('人物・場所は、見出しの横のボタンから登録のページへ進める', async () => {
      サイドバーを描画する();

      expect(await screen.findByRole('link', { name: '人物を登録' })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/persons/new'
      );
      expect(screen.getByRole('link', { name: '場所を登録' })).toHaveAttribute('href', '/cases/case-lakeside/places/new');
    });

    it('証言の一覧は、開いてから証言の詳細ページへのリンクを並べる', async () => {
      const user = userEvent.setup();
      サイドバーを描画する();

      // 前提: 証言は数が多くサイドバーを占めるため、最初は折りたたんでいる
      expect(screen.queryByRole('list', { name: '証言の一覧' })).not.toBeInTheDocument();

      await user.click(await screen.findByRole('button', { name: /^証言/ }));

      const 証言の一覧 = await screen.findByRole('list', { name: '証言の一覧' });
      expect(within(証言の一覧).getByRole('link', { name: /明かりがついていて/ })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/claims/claim-neighbor'
      );
    });

    it('裏付けの無い証言の一覧は、裏付ける照合を1件も持たない証言だけを、詳細へのリンクで並べる', async () => {
      const user = userEvent.setup();
      サイドバーを描画する();

      // 前提: 裏付ける照合は、防犯カメラ↔隣家の住人の1件だけ。管理人の証言は食い違う照合しか持たない
      await user.click(await screen.findByRole('button', { name: /^裏付けの無い証言/ }));

      const 一覧 = await screen.findByRole('list', { name: '裏付けの無い証言の一覧' });
      expect(within(一覧).getAllByRole('link')).toHaveLength(3);
      expect(within(一覧).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/claims/claim-caretaker'
      );
      expect(within(一覧).queryByRole('link', { name: /明かりがついていて/ })).not.toBeInTheDocument();
    });

    it('未完了の未了事項の件数を示し、未完了のものだけを、未了事項の詳細へのリンクで並べる', async () => {
      const user = userEvent.setup();
      サイドバーを描画する();

      // 前提: 未完了の未了事項は、防犯カメラの映像の確認と管理人への再聴取の2件。天気の確認は完了している
      const 見出し = await screen.findByRole('button', { name: /^未完了の未了事項/ });
      expect(見出し).toHaveTextContent('2');
      await user.click(見出し);

      const 一覧 = await screen.findByRole('list', { name: '未完了の未了事項の一覧' });
      expect(within(一覧).getAllByRole('link')).toHaveLength(2);
      expect(within(一覧).getByRole('link', { name: /防犯カメラの映像/ })).toHaveAttribute(
        'href',
        '/cases/case-lakeside/tasks/task-camera'
      );
      expect(within(一覧).queryByRole('link', { name: /天気/ })).not.toBeInTheDocument();
    });

    it('開いている人物の詳細は、一覧でも現在地として示す', async () => {
      resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
      サイドバーを描画する();

      const 人物の一覧 = await screen.findByRole('list', { name: '人物の一覧' });
      expect(within(人物の一覧).getByRole('link', { name: '隣家の住人' })).toHaveAttribute('aria-current', 'page');
      expect(within(人物の一覧).getByRole('link', { name: '管理人' })).not.toHaveAttribute('aria-current');
    });
  });

  describe('ケースの切り替え', () => {
    it('ケース名のメニューから、保存済みの他のケースとケースの一覧へ移れる', async () => {
      const user = userEvent.setup();
      // 前提: 切り替え先として、もう1件のケースを保存しておく
      openTestCase({ ...sampleFictionalCase, id: 'case-old-well', name: '古井戸の目撃証言（架空）' });
      openTestCase(sampleFictionalCase);
      サイドバーを描画する();

      await user.click(await screen.findByRole('button', { name: /湖畔の別荘失踪事件（架空）/ }));

      expect(await screen.findByRole('menuitem', { name: '古井戸の目撃証言（架空）' })).toHaveAttribute(
        'href',
        '/cases/case-old-well'
      );
      expect(screen.getByRole('menuitem', { name: 'ケースの一覧' })).toHaveAttribute('href', '/');
    });
  });
});
