/**
 * 証言の詳細ページ（編集・削除・関連する証言への導線）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openedCase, openTestCase } from '@/test/open-case';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { ClaimDetail } from './ClaimDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: サンプルのケースの時系列は「管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測」の順に並ぶ
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
});

describe('ClaimDetail', () => {
  it('証言の内容を1つのフォームで編集でき、本文の日時のメンションを保持する', async () => {
    const user = userEvent.setup();
    render(<ClaimDetail claimId="claim-neighbor" />);

    // 検証: 日時は専用の欄ではなく、本文のメンションとして読み込む
    expect(screen.getByLabelText('内容')).toHaveValue(
      '@1998年8月12日 21:00ごろ、@湖畔の別荘の明かりがついていて、庭に@別荘の持ち主の姿が見えた。'
    );

    await user.type(screen.getByLabelText('内容'), ' 窓は開いていた。');
    await user.click(screen.getByRole('button', { name: '証言を保存' }));

    const 保存後 = openedCase().claims.find((claim) => claim.id === 'claim-neighbor');
    expect(保存後?.content).toContain('窓は開いていた。');
    expect(保存後?.when).toBe('1998-08-12T21:00');
    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
  });

  it('「この証言を削除」を、「発言者」と「証言を保存」より前に置く', () => {
    // 検証: 削除が「発言者」と「証言を保存」の中間に浮かないよう、行の左端に置くこと
    render(<ClaimDetail claimId="claim-neighbor" />);

    const 削除 = screen.getByRole('button', { name: 'この証言を削除' });
    const 発言者 = screen.getByRole('button', { name: /^発言者:/ });
    const 保存 = screen.getByRole('button', { name: '証言を保存' });

    expect(削除.compareDocumentPosition(発言者)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(発言者.compareDocumentPosition(保存)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('時系列の前後の証言へのリンクを表示する', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const 前後 = screen.getByRole('navigation', { name: '時系列の前後の証言' });
    expect(within(前後).getByRole('link', { name: /^前の証言/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-police-camera');
    expect(within(前後).getByRole('link', { name: /^次の証言/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-report');
  });

  it('同じ人物・場所に触れている他の証言を、人物・場所ごとにまとめてリンクにする', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const 湖畔の別荘 = screen.getByRole('region', { name: '「湖畔の別荘」に触れている他の証言' });
    const links = within(within(湖畔の別荘).getByRole('list')).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-caretaker');
    expect(links[0]).toHaveTextContent('管理人');
    expect(links[0]).toHaveTextContent(/見回りをしたとき/);
  });

  it('この証言が触れている発言者・経由・言及・場所を、人物・場所の詳細へのリンクにする', () => {
    // 前提: 隣家の住人の証言は、発言者が隣家の住人で、架空日報 朝刊を経由し、別荘の持ち主に言及し、湖畔の別荘を述べている
    render(<ClaimDetail claimId="claim-neighbor" />);

    const 触れている先 = screen.getByRole('navigation', { name: 'この証言が触れている人物・場所' });
    expect(within(触れている先).getByRole('link', { name: '発言者 隣家の住人' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-neighbor'
    );
    expect(within(触れている先).getByRole('link', { name: '経由 架空日報 朝刊' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-newspaper'
    );
    expect(within(触れている先).getByRole('link', { name: '言及 別荘の持ち主' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-owner'
    );
    expect(within(触れている先).getByRole('link', { name: '場所 湖畔の別荘' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa'
    );
  });

  it('「〇〇に触れている他の証言」の見出しを、その人物・場所の詳細へのリンクにする', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const 湖畔の別荘 = screen.getByRole('region', { name: '「湖畔の別荘」に触れている他の証言' });
    expect(within(湖畔の別荘).getByRole('link', { name: '湖畔の別荘' })).toHaveAttribute('href', '/cases/case-lakeside/places/place-villa');
  });

  it('開いているタブをURLから引き継ぎ、詳細を閉じるリンクと、他の証言へのリンクに反映する', () => {
    resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor?tab=map');
    render(<ClaimDetail claimId="claim-neighbor" />);

    expect(screen.getByRole('link', { name: '証言の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
    const 前後 = screen.getByRole('navigation', { name: '時系列の前後の証言' });
    expect(within(前後).getByRole('link', { name: /^次の証言/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-report?tab=map');
  });

  it('証言を削除すると、ボードに戻る', async () => {
    const user = userEvent.setup();

    render(<ClaimDetail claimId="claim-neighbor" />);

    await user.click(screen.getByRole('button', { name: 'この証言を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(openedCase().claims.map((claim) => claim.id)).not.toContain('claim-neighbor');
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/cases/case-lakeside');
  });

  it('照合を含む証言の削除の確認では、照合もあわせて削除することを伝え、削除すると照合も消える', async () => {
    // 前提: 隣家の住人の証言は、2件の照合（防犯カメラ・管理人）に含まれる
    const user = userEvent.setup();

    render(<ClaimDetail claimId="claim-neighbor" />);

    await user.click(screen.getByRole('button', { name: 'この証言を削除' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('この証言を含む照合2件も削除します。');
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().crossChecks).toEqual([]);
  });

  it('照合した相手の証言へ、証言の詳細からたどれる', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const 照合 = screen.getByRole('region', { name: '照合' });
    expect(within(照合).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
  });

  it('この証言を使っている仮説へ、ひもづけている立場とともに、証言の詳細からたどれる', () => {
    // 前提: 管理人の証言は、管理人の仮説の「管理人の機会」と、否定された仮説の「支える証言」にひもづいている
    render(<ClaimDetail claimId="claim-caretaker" />);

    const 仮説 = screen.getByRole('region', { name: 'この証言を使っている仮説' });
    const 項目 = within(仮説).getAllByRole('listitem');
    expect(within(項目[0]!).getByRole('link', { name: /管理人が失踪に関わっている/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/hypotheses/hypothesis-caretaker'
    );
    expect(項目[0]).toHaveTextContent('管理人の機会');
    expect(項目[1]).toHaveTextContent('持ち主は19時より前に別荘を離れた');
    expect(項目[1]).toHaveTextContent('支える証言');
    expect(項目[1]).toHaveTextContent('否定された');
  });

  it('どの仮説にも使われていない証言では、仮説の欄を表示しない', () => {
    render(<ClaimDetail claimId="claim-report" />);

    expect(screen.queryByRole('region', { name: 'この証言を使っている仮説' })).not.toBeInTheDocument();
  });

  it('仮説にひもづいた証言の削除の確認では、仮説からひもづけを外すことを伝え、削除すると仮説から外れる', async () => {
    // 前提: 防犯カメラの証言は、否定された仮説の「反する証言」にだけひもづいている
    const user = userEvent.setup();
    render(<ClaimDetail claimId="claim-police-camera" />);

    await user.click(screen.getByRole('button', { name: 'この証言を削除' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('この証言をひもづけた仮説1件から、ひもづけを外します。');
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().hypotheses[1]?.opposingClaimIds).toEqual(['claim-neighbor']);
  });

  it('関係の根拠になっている証言を削除しようとすると、理由を示して削除しない', async () => {
    // 前提: 管理人の証言（claim-caretaker）は、関係「雇用主」の根拠になっている
    const user = userEvent.setup();

    render(<ClaimDetail claimId="claim-caretaker" />);

    await user.click(screen.getByRole('button', { name: 'この証言を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('他のデータから参照されているため削除できません');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('ケースに無い証言を開いた場合は、見つからないことを伝え、詳細を閉じられるようにする', () => {
    render(<ClaimDetail claimId="claim-deleted" />);

    expect(screen.getByRole('heading', { name: '証言が見つかりません' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '証言の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside');
  });
});
