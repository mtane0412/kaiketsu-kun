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
  it('人物の編集で、登録済みの種別を示し、種別を変更できる', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-police" />);

    const kind = screen.getByRole('combobox', { name: '種別' });
    expect(kind).toHaveDisplayValue('組織');

    await user.selectOptions(kind, '人物');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(openedCase().persons.find((person) => person.id === 'person-police')?.kind).toBe('individual');
  });

  it('人物の名前を見出しにして、編集フォームに現在の内容を表示する', () => {
    render(<PersonDetail personId="person-neighbor" />);

    expect(screen.getByRole('heading', { name: '隣家の住人' })).toBeInTheDocument();
    const editButton = screen.getByRole('region', { name: '人物の編集' });
    expect(within(editButton).getByLabelText('名前')).toHaveValue('隣家の住人');
  });

  it('この人物が述べた証言と、言及している証言を、証言の詳細へのリンクで並べる', () => {
    render(<PersonDetail personId="person-neighbor" />);

    // 前提: 隣家の住人は「夜9時ごろ」の証言を述べ、ユーザーの推測から言及されている
    const statedClaims = screen.getByRole('region', { name: 'この人物が述べた証言' });
    expect(within(statedClaims).getByRole('link', { name: /明かりがついていて/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-neighbor');

    const mentioningClaims = screen.getByRole('region', { name: 'この人物に言及している証言' });
    expect(within(mentioningClaims).getByRole('link', { name: /管理人の証言は事件の20年後/ })).toHaveAttribute(
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
    const caseData: Case = {
      ...sampleFictionalCase,
      persons: sampleFictionalCase.persons.map((person) =>
        person.id === 'person-neighbor' ? { ...person, note: '@[湖畔の別荘](place:place-villa)の隣に住んでいます。' } : person
      ),
    };
    openTestCase(caseData);
    render(<PersonDetail personId="person-neighbor" />);

    const related = screen.getByRole('region', { name: '関連するエンティティ' });
    expect(within(related).getByRole('link', { name: /湖畔の別荘/ })).toHaveAttribute('href', '/cases/case-lakeside/places/place-villa');
  });

  it('開いているタブをURLから引き継ぎ、詳細を閉じるリンクと、証言へのリンクに反映する', () => {
    resetMockNavigation('/cases/case-lakeside/persons/person-neighbor?tab=map');
    render(<PersonDetail personId="person-neighbor" />);

    expect(screen.getByRole('link', { name: '人物の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
    const statedClaims = screen.getByRole('region', { name: 'この人物が述べた証言' });
    expect(within(statedClaims).getByRole('link', { name: /明かりがついていて/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-neighbor?tab=map'
    );
  });

  it('どの証言からも参照されていない人物を削除すると、ボードに戻る', async () => {
    // 前提: 証言にも関係にも現れない「町役場の職員」を登録したケースを用意する
    const user = userEvent.setup();

    openTestCase({
      ...sampleFictionalCase,
      persons: [...sampleFictionalCase.persons, { id: 'person-clerk', name: '町役場の職員', kind: 'individual' }],
    });
    render(<PersonDetail personId="person-clerk" />);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(openedCase().persons.map((person) => person.id)).not.toContain('person-clerk');
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/cases/case-lakeside');
  });

  it('証言から参照されている人物を削除しようとすると、理由を示して削除しない', async () => {
    const user = userEvent.setup();

    render(<PersonDetail personId="person-neighbor" />);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('他のデータから参照されているため削除できません');
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('人物どうしの関係を登録・編集できる節を並べる', () => {
    // 前提: 別荘の持ち主は、管理人との関係を2件持つ
    resetMockNavigation('/cases/case-lakeside/persons/person-owner');
    render(<PersonDetail personId="person-owner" />);

    const relationship = screen.getByRole('region', { name: '関係' });
    expect(within(relationship).getByText('雇用主（別荘の持ち主から管理人へ）')).toBeInTheDocument();
    expect(within(relationship).getByRole('button', { name: '関係を追加' })).toBeInTheDocument();
  });

  it('聴取ごとに証言を並べる「供述の変遷」の節を並べる', () => {
    resetMockNavigation('/cases/case-lakeside/persons/person-caretaker');
    render(<PersonDetail personId="person-caretaker" />);

    const history = screen.getByRole('region', { name: '供述の変遷' });
    expect(within(history).getByRole('button', { name: '聴取を追加' })).toBeInTheDocument();
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

  it('人物どうしの関係の節は並べない', () => {
    render(<PlaceDetail placeId="place-villa" />);

    expect(screen.queryByRole('region', { name: '関係' })).not.toBeInTheDocument();
  });

  it('供述の変遷の節は並べない', () => {
    render(<PlaceDetail placeId="place-villa" />);

    expect(screen.queryByRole('region', { name: '供述の変遷' })).not.toBeInTheDocument();
  });

  it('場所の名前を見出しにして、編集フォームに現在の内容を表示する', () => {
    render(<PlaceDetail placeId="place-villa" />);

    expect(screen.getByRole('heading', { name: '湖畔の別荘' })).toBeInTheDocument();
    const editButton = screen.getByRole('region', { name: '場所の編集' });
    expect(within(editButton).getByLabelText('名前')).toHaveValue('湖畔の別荘');
  });

  it('この場所を述べている証言を、時系列の並び順で、証言の詳細へのリンクにする', () => {
    render(<PlaceDetail placeId="place-villa" />);

    // 前提: 湖畔の別荘を述べているのは、管理人の証言と隣家の住人の証言の2件
    const statingClaims = screen.getByRole('region', { name: 'この場所を述べている証言' });
    const links = within(statingClaims).getAllByRole('link');
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

describe('人物・場所の未了事項', () => {
  it('人物の詳細に、その人物をひもづけた未了事項と、追加するページへのリンクを並べる', () => {
    // 前提: 管理人は、未着手の「管理人への再聴取」にひもづいている
    render(<PersonDetail personId="person-caretaker" />);

    const taskSection = screen.getByRole('region', { name: 'この人物の未了事項' });
    expect(within(taskSection).getByRole('link', { name: /再度聞く/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/task-caretaker'
    );
    expect(taskSection).toHaveTextContent('未着手');
    expect(within(taskSection).getByRole('link', { name: 'この人物の未了事項を追加' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/new?link=person%3Aperson-caretaker'
    );
  });

  it('場所の詳細に、その場所をひもづけた未了事項を並べる', () => {
    // 前提: 湖畔の別荘は、管理人への再聴取と、完了した天気の確認にひもづいている
    render(<PlaceDetail placeId="place-villa" />);

    const taskSection = screen.getByRole('region', { name: 'この場所の未了事項' });
    expect(within(taskSection).getAllByRole('listitem')).toHaveLength(2);
    expect(taskSection).toHaveTextContent('完了');
  });

  it('未了事項にひもづいた人物の削除の確認では、未了事項からひもづけを外すことを伝え、削除すると外れる', async () => {
    // 前提: 駅員は、「防犯カメラの映像の確認」の未了事項だけが参照する人物とする
    openTestCase({
      ...sampleFictionalCase,
      persons: [...sampleFictionalCase.persons, { id: 'person-station-staff', name: '駅員', kind: 'individual' }],
      tasks: sampleFictionalCase.tasks.map((task) =>
        task.id === 'task-camera' ? { ...task, personIds: ['person-station-staff'] } : task
      ),
    });
    const user = userEvent.setup();
    render(<PersonDetail personId="person-station-staff" />);

    await user.click(screen.getByRole('button', { name: 'この人物を削除' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('この人物をひもづけた未了事項1件から、ひもづけを外します。');
    await user.click(screen.getByRole('button', { name: '削除する' }));

    expect(openedCase().tasks.find((task) => task.id === 'task-camera')?.personIds).toEqual([]);
  });
});

describe('NewPersonDetail・NewPlaceDetail', () => {
  it('人物を新しく登録し、保存するとその人物の詳細へ移る', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/persons/new');
    render(<NewPersonDetail />);

    const registerButton = screen.getByRole('region', { name: '人物の登録' });
    await user.type(within(registerButton).getByLabelText('名前'), '通報した釣り人');
    await user.click(within(registerButton).getByRole('button', { name: '人物を保存' }));

    const registeredPerson = openedCase().persons.find((person) => person.name === '通報した釣り人');
    expect(registeredPerson).toBeDefined();
    // 検証: 保存した直後から、そのまま編集・削除を続けられるよう、登録した人物の詳細へ移る
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/persons/${registeredPerson!.id}`);
  });

  it('人物の登録では種別を選べ、既定値は「人物」とする', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/persons/new');
    render(<NewPersonDetail />);

    const registerButton = screen.getByRole('region', { name: '人物の登録' });
    const kind = within(registerButton).getByRole('combobox', { name: '種別' });
    expect(kind).toHaveDisplayValue('人物');

    await user.type(within(registerButton).getByLabelText('名前'), '駅の改札の記録');
    await user.selectOptions(kind, '記録・媒体');
    await user.click(within(registerButton).getByRole('button', { name: '人物を保存' }));

    expect(openedCase().persons.find((person) => person.name === '駅の改札の記録')?.kind).toBe('record');
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

    const registerButton = screen.getByRole('region', { name: '場所の登録' });
    await user.type(within(registerButton).getByLabelText('名前'), '桟橋');
    await user.click(within(registerButton).getByRole('button', { name: '場所を保存' }));

    const registeredPlace = openedCase().places.find((place) => place.name === '桟橋');
    expect(registeredPlace).toBeDefined();
    // 検証: 戻り先の表示（?tab=map）も引き継ぐ
    expect(mockRouter.replace).toHaveBeenCalledWith(`/cases/case-lakeside/places/${registeredPlace!.id}?tab=map`);
  });
});

describe('人物の識別子', () => {
  /** 別荘の持ち主と管理人が、表記の違う同じ電話番号を持つケースです。 */
  const samePhoneNumberCase: Case = {
    ...sampleFictionalCase,
    persons: sampleFictionalCase.persons.map((person) => {
      if (person.id === 'person-owner') return { ...person, identifiers: [{ type: '電話番号', value: '090-1234-5678' }] };
      if (person.id === 'person-caretaker') return { ...person, identifiers: [{ type: '携帯電話', value: '09012345678' }] };
      return person;
    }),
  };

  it('人物の編集で、識別子を複数登録できる', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-owner" />);

    await user.click(screen.getByRole('button', { name: '識別子を追加' }));
    await user.type(screen.getByRole('combobox', { name: '識別子1の種類' }), '電話番号');
    await user.type(screen.getByRole('textbox', { name: '識別子1の値' }), '090-1234-5678');
    await user.click(screen.getByRole('button', { name: '識別子を追加' }));
    await user.type(screen.getByRole('combobox', { name: '識別子2の種類' }), '車両ナンバー');
    await user.type(screen.getByRole('textbox', { name: '識別子2の値' }), '品川 300 あ 12-34');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(openedCase().persons.find((person) => person.id === 'person-owner')?.identifiers).toEqual([
      { type: '電話番号', value: '090-1234-5678' },
      { type: '車両ナンバー', value: '品川 300 あ 12-34' },
    ]);
  });

  it('登録済みの識別子を表示し、削除できる', async () => {
    const user = userEvent.setup();
    openTestCase(samePhoneNumberCase);
    render(<PersonDetail personId="person-owner" />);

    expect(screen.getByRole('combobox', { name: '識別子1の種類' })).toHaveValue('電話番号');
    expect(screen.getByRole('textbox', { name: '識別子1の値' })).toHaveValue('090-1234-5678');

    await user.click(screen.getByRole('button', { name: '識別子1を削除' }));
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(openedCase().persons.find((person) => person.id === 'person-owner')?.identifiers).toBeUndefined();
  });

  it('種類と値の両方が空の行は保存せず、片方だけが空の行は保存せずに理由を示す', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-owner" />);

    await user.click(screen.getByRole('button', { name: '識別子を追加' }));
    await user.click(screen.getByRole('button', { name: '識別子を追加' }));
    await user.type(screen.getByRole('textbox', { name: '識別子2の値' }), '090-1234-5678');
    await user.click(screen.getByRole('button', { name: '人物を保存' }));

    expect(screen.getByText(/識別子の種類と値を入力してください/)).toBeInTheDocument();
    expect(openedCase().persons.find((person) => person.id === 'person-owner')?.identifiers).toBeUndefined();
  });

  it('同じ識別子を持つ人物を、一致した識別子とともに、互いの詳細に表示する', () => {
    openTestCase(samePhoneNumberCase);
    const { unmount } = render(<PersonDetail personId="person-owner" />);

    const fromOwner = screen.getByRole('region', { name: '同じ識別子を持つ人物' });
    const linkToCaretaker = within(fromOwner).getByRole('link', { name: /管理人/ });
    expect(linkToCaretaker).toHaveAttribute('href', '/cases/case-lakeside/persons/person-caretaker');
    expect(linkToCaretaker).toHaveTextContent('携帯電話: 09012345678');
    unmount();

    render(<PersonDetail personId="person-caretaker" />);
    const fromCaretaker = screen.getByRole('region', { name: '同じ識別子を持つ人物' });
    expect(within(fromCaretaker).getByRole('link', { name: /別荘の持ち主/ })).toHaveTextContent('電話番号: 090-1234-5678');
  });

  it('識別子を持つが一致する人物がいない場合は、いないことを示し、識別子を持たない人物では節を表示しない', () => {
    // 前提: 管理人の識別子を外すと、別荘の持ち主の電話番号と一致する人物はいない
    openTestCase({
      ...samePhoneNumberCase,
      persons: samePhoneNumberCase.persons.map((person) =>
        person.id === 'person-caretaker' ? { ...person, identifiers: undefined } : person
      ),
    });
    const { unmount } = render(<PersonDetail personId="person-owner" />);
    expect(within(screen.getByRole('region', { name: '同じ識別子を持つ人物' })).getByText('同じ識別子を持つ人物はいません。')).toBeInTheDocument();
    unmount();

    render(<PersonDetail personId="person-police" />);
    expect(screen.queryByRole('region', { name: '同じ識別子を持つ人物' })).not.toBeInTheDocument();
  });
});
