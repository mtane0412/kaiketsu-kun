/**
 * 人物・場所の詳細（編集・削除・逆引きした証言・関連するエンティティへの導線）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { openedCase, openTestCase } from '@/test/open-case';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { NewPersonDetail, NewPlaceDetail, PersonDetail, PlaceDetail } from './EntityDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: サンプルのケースの時系列は「管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測」の順に並ぶ
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
});

describe('PersonDetail', () => {
  it('人物の名前を見出しにして、編集フォームに現在の内容を表示する', () => {
    render(<PersonDetail personId="person-neighbor" />);

    expect(screen.getByRole('heading', { name: '隣家の住人' })).toBeInTheDocument();
    const 編集 = screen.getByRole('region', { name: '人物の編集' });
    expect(within(編集).getByLabelText('名前')).toHaveValue('隣家の住人');
  });

  it('この人物が述べた証言と、言及している証言を、証言の詳細へのリンクで並べる', () => {
    render(<PersonDetail personId="person-neighbor" />);

    // 前提: 隣家の住人は「夜9時ごろ」の証言を述べ、ユーザーの推測から言及されている
    const 述べた証言 = screen.getByRole('region', { name: 'この人物が述べた証言' });
    expect(within(述べた証言).getByRole('link', { name: /明かりがついていて/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-neighbor');

    const 言及している証言 = screen.getByRole('region', { name: 'この人物に言及している証言' });
    expect(within(言及している証言).getByRole('link', { name: /管理人の証言は事件の20年後/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-user-guess'
    );
  });

  it('経由した証言が1件も無い人物では、そのまとまりの見出しを表示しない', () => {
    // 前提: 隣家の住人が経由した証言は1件も無い
    render(<PersonDetail personId="person-neighbor" />);

    expect(screen.queryByRole('region', { name: 'この人物を経由して伝わった証言' })).not.toBeInTheDocument();
  });

  it('メモのメンションでつながったエンティティを、そのエンティティの詳細へのリンクで表示する', () => {
    // 前提: 隣家の住人のメモから、湖畔の別荘に言及している
    const ケース: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor' ? { ...person, note: '@[湖畔の別荘](place:place-villa)の隣に住んでいます。' } : person
      ),
    };
    openTestCase(ケース);
    render(<PersonDetail personId="person-neighbor" />);

    const 関連 = screen.getByRole('region', { name: '関連するエンティティ' });
    expect(within(関連).getByRole('link', { name: /湖畔の別荘/ })).toHaveAttribute('href', '/cases/case-lakeside/places/place-villa');
  });

  it('開いているタブをURLから引き継ぎ、詳細を閉じるリンクと、証言へのリンクに反映する', () => {
    resetMockNavigation('/cases/case-lakeside/persons/person-neighbor?tab=map');
    render(<PersonDetail personId="person-neighbor" />);

    expect(screen.getByRole('link', { name: '人物の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
    const 述べた証言 = screen.getByRole('region', { name: 'この人物が述べた証言' });
    expect(within(述べた証言).getByRole('link', { name: /明かりがついていて/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-neighbor?tab=map'
    );
  });

  it('どの証言からも参照されていない人物を削除すると、ボードに戻る', async () => {
    // 前提: 証言にも関係にも現れない「町役場の職員」を登録したケースを用意する
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    openTestCase({
      ...sampleFictionalCase,
      persons: [...sampleFictionalCase.persons, { id: 'person-clerk', name: '町役場の職員' }],
    });
    render(<PersonDetail personId="person-clerk" />);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));

    expect(openedCase().persons.map((person) => person.id)).not.toContain('person-clerk');
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/cases/case-lakeside');
  });

  it('証言から参照されている人物を削除しようとすると、理由を示して削除しない', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PersonDetail personId="person-neighbor" />);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));

    expect(screen.getByRole('alert')).toHaveTextContent('他のデータから参照されているため削除できません');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('ケースに無い人物を開いた場合は、見つからないことを伝え、詳細を閉じられるようにする', () => {
    render(<PersonDetail personId="person-deleted" />);

    expect(screen.getByRole('heading', { name: '人物が見つかりません' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '人物の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside');
  });
});

describe('PlaceDetail', () => {
  beforeEach(() => {
    resetMockNavigation('/cases/case-lakeside/places/place-villa');
  });

  it('場所の名前を見出しにして、編集フォームに現在の内容を表示する', () => {
    render(<PlaceDetail placeId="place-villa" />);

    expect(screen.getByRole('heading', { name: '湖畔の別荘' })).toBeInTheDocument();
    const 編集 = screen.getByRole('region', { name: '場所の編集' });
    expect(within(編集).getByLabelText('名前')).toHaveValue('湖畔の別荘');
  });

  it('この場所を述べている証言を、時系列の並び順で、証言の詳細へのリンクにする', () => {
    render(<PlaceDetail placeId="place-villa" />);

    // 前提: 湖畔の別荘を述べているのは、管理人の証言と隣家の住人の証言の2件
    const 述べている証言 = screen.getByRole('region', { name: 'この場所を述べている証言' });
    const links = within(述べている証言).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/cases/case-lakeside/claims/claim-caretaker',
      '/cases/case-lakeside/claims/claim-neighbor',
    ]);
  });

  it('ケースに無い場所を開いた場合は、見つからないことを伝え、詳細を閉じられるようにする', () => {
    render(<PlaceDetail placeId="place-deleted" />);

    expect(screen.getByRole('heading', { name: '場所が見つかりません' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '場所の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside');
  });
});

describe('NewPersonDetail・NewPlaceDetail', () => {
  it('人物を新しく登録し、保存するとその人物の詳細へ移る', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/persons/new');
    render(<NewPersonDetail />);

    const 登録 = screen.getByRole('region', { name: '人物の登録' });
    await user.type(within(登録).getByLabelText('名前'), '通報した釣り人');
    await user.click(within(登録).getByRole('button', { name: '人物を保存' }));

    const 登録した人物 = openedCase().persons.find((person) => person.name === '通報した釣り人');
    expect(登録した人物).toBeDefined();
    // 検証: 保存した直後から、そのまま編集・削除を続けられるよう、登録した人物の詳細へ移る
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/persons/${登録した人物!.id}`);
  });

  it('人物の登録では、削除のボタンを表示しない', () => {
    resetMockNavigation('/cases/case-lakeside/persons/new');
    render(<NewPersonDetail />);

    // 前提: まだ保存していないため、削除できる対象が無い
    expect(screen.queryByRole('button', { name: 'この人物を削除' })).not.toBeInTheDocument();
  });

  it('場所を新しく登録し、保存するとその場所の詳細へ移る', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/places/new?tab=map');
    render(<NewPlaceDetail />);

    const 登録 = screen.getByRole('region', { name: '場所の登録' });
    await user.type(within(登録).getByLabelText('名前'), '桟橋');
    await user.click(within(登録).getByRole('button', { name: '場所を保存' }));

    const 登録した場所 = openedCase().places.find((place) => place.name === '桟橋');
    expect(登録した場所).toBeDefined();
    // 検証: 戻り先の表示（?tab=map）も引き継ぐ
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/places/${登録した場所!.id}?tab=map`);
  });
});
