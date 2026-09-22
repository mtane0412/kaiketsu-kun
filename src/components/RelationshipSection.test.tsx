/**
 * 人物の詳細に並べる「関係」（人物どうしの関係の一覧・登録・編集・削除）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openedCase, openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { RelationshipSection } from './RelationshipSection';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: サンプルのケースには「別荘の持ち主 → 管理人（雇用主・片方向）」と「管理人 と 別荘の持ち主（金銭トラブル？・双方向）」がある
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/persons/person-owner');
});

/** 別荘の持ち主の詳細に並ぶ「関係」を描画します。 */
function 持ち主の関係を描画() {
  render(<RelationshipSection personId="person-owner" personName="別荘の持ち主" tab="timeline" />);
  return screen.getByRole('region', { name: '関係' });
}

describe('RelationshipSection', () => {
  it('この人物が関わる関係を、向きが分かる説明と、相手の人物へのリンクで並べる', () => {
    const 関係 = 持ち主の関係を描画();

    expect(within(関係).getByText('雇用主（別荘の持ち主から管理人へ）')).toBeInTheDocument();
    expect(within(関係).getByText('金銭トラブル？（別荘の持ち主と管理人の双方向）')).toBeInTheDocument();
    expect(within(関係).getAllByRole('link', { name: '管理人' })[0]).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-caretaker'
    );
  });

  it('根拠の証言を、証言の詳細へのリンクで示す', () => {
    const 関係 = 持ち主の関係を描画();

    // 前提: 雇用主の関係は、管理人の証言（claim-caretaker）を根拠にしている
    expect(within(関係).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
  });

  it('根拠の証言が登録されていない関係には、根拠が未登録であることを示す', async () => {
    openTestCase({
      ...sampleFictionalCase,
      relationships: [
        {
          id: 'relationship-no-basis',
          fromPersonId: 'person-owner',
          toPersonId: 'person-caretaker',
          label: '面識がある',
          directed: false,
          basisClaimIds: [],
        },
      ],
    });

    const 関係 = 持ち主の関係を描画();

    expect(within(関係).getByText('根拠未登録')).toBeInTheDocument();
  });

  it('関係が1件も無い人物では、関係の登録を促す案内を表示する', () => {
    render(<RelationshipSection personId="person-neighbor" personName="隣家の住人" tab="timeline" />);

    const 関係 = screen.getByRole('region', { name: '関係' });
    expect(within(関係).getByRole('button', { name: '関係を追加' })).toBeInTheDocument();
    expect(within(関係).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('相手・関係の名前・向き・根拠の証言を入力して保存すると、関係をケースに追加する', async () => {
    const user = userEvent.setup();
    持ち主の関係を描画();

    await user.click(screen.getByRole('button', { name: '関係を追加' }));
    const 登録 = screen.getByRole('region', { name: '関係の登録' });
    await user.selectOptions(within(登録).getByLabelText('相手の人物'), 'person-neighbor');
    await user.type(within(登録).getByLabelText('関係の名前'), '近所付き合い');
    await user.click(within(登録).getByRole('radio', { name: /別荘の持ち主から隣家の住人へ/ }));
    await user.click(within(登録).getByRole('checkbox', { name: /明かりがついていて/ }));
    await user.click(within(登録).getByRole('button', { name: '関係を保存' }));

    const 追加された関係 = openedCase().relationships.at(-1);
    expect(追加された関係).toMatchObject({
      fromPersonId: 'person-owner',
      toPersonId: 'person-neighbor',
      label: '近所付き合い',
      directed: true,
      basisClaimIds: ['claim-neighbor'],
    });
  });

  it('向きを双方向のままにすると、向きを持たない関係として保存する', async () => {
    const user = userEvent.setup();
    持ち主の関係を描画();

    await user.click(screen.getByRole('button', { name: '関係を追加' }));
    const 登録 = screen.getByRole('region', { name: '関係の登録' });
    await user.selectOptions(within(登録).getByLabelText('相手の人物'), 'person-neighbor');
    await user.type(within(登録).getByLabelText('関係の名前'), '近所付き合い');
    await user.click(within(登録).getByRole('button', { name: '関係を保存' }));

    expect(openedCase().relationships.at(-1)).toMatchObject({ label: '近所付き合い', directed: false });
  });

  it('相手の人物の選択肢に、開いている人物自身を並べない', async () => {
    const user = userEvent.setup();
    持ち主の関係を描画();

    await user.click(screen.getByRole('button', { name: '関係を追加' }));
    const 相手 = screen.getByLabelText('相手の人物');

    expect(within(相手).queryByRole('option', { name: '別荘の持ち主' })).not.toBeInTheDocument();
    expect(within(相手).getByRole('option', { name: '管理人' })).toBeInTheDocument();
  });

  it('登録済みの関係を編集して保存すると、同じ関係を書き換える', async () => {
    const user = userEvent.setup();
    const 関係 = 持ち主の関係を描画();

    await user.click(within(関係).getByRole('button', { name: '雇用主（管理人）の関係を編集' }));
    const 編集 = screen.getByRole('region', { name: '関係の編集' });
    expect(within(編集).getByLabelText('関係の名前')).toHaveValue('雇用主');

    await user.clear(within(編集).getByLabelText('関係の名前'));
    await user.type(within(編集).getByLabelText('関係の名前'), '元の雇用主');
    await user.click(within(編集).getByRole('button', { name: '関係を保存' }));

    const 関係の一覧 = openedCase().relationships;
    expect(関係の一覧).toHaveLength(2);
    expect(関係の一覧.find((item) => item.id === 'relationship-employment')).toMatchObject({
      fromPersonId: 'person-owner',
      toPersonId: 'person-caretaker',
      label: '元の雇用主',
      directed: true,
    });
  });

  it('指し示されている側の人物から編集しても、関係の向きを入れ替えない', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/persons/person-caretaker');
    render(<RelationshipSection personId="person-caretaker" personName="管理人" tab="timeline" />);

    await user.click(screen.getByRole('button', { name: '雇用主（別荘の持ち主）の関係を編集' }));
    const 編集 = screen.getByRole('region', { name: '関係の編集' });
    // 前提: 管理人から見ると、雇用主の関係は「別荘の持ち主から管理人へ」向いている
    expect(within(編集).getByRole('radio', { name: /別荘の持ち主から管理人へ/ })).toBeChecked();

    await user.click(within(編集).getByRole('button', { name: '関係を保存' }));

    expect(openedCase().relationships.find((item) => item.id === 'relationship-employment')).toMatchObject({
      fromPersonId: 'person-owner',
      toPersonId: 'person-caretaker',
      directed: true,
    });
  });

  it('関係を削除すると、ケースから関係を取り除く', async () => {
    const user = userEvent.setup();
    const 関係 = 持ち主の関係を描画();

    await user.click(within(関係).getByRole('button', { name: '雇用主（管理人）の関係を削除' }));
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().relationships.map((item) => item.id)).toEqual(['relationship-money-trouble']);
  });
});
