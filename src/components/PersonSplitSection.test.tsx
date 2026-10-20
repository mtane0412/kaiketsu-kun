/**
 * 人物の詳細の「人物を分ける」節のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openedCase, openTestCase } from '@/test/open-case';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { PersonDetail } from './EntityDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 節の見出しです。 */
const SECTION_NAME = '人物を分ける';

beforeEach(async () => {
  localStorage.clear();
  // 前提: サンプルの「隣家の住人」は、証言 claim-neighbor の発言者で、ユーザーの推測の本文で言及されている
  await openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/persons/person-neighbor');
});

/** 「分け方を選ぶ」を押して、参照の一覧を開きます。 */
async function openSplitter(user: ReturnType<typeof userEvent.setup>) {
  const section = screen.getByRole('region', { name: SECTION_NAME });
  await user.click(within(section).getByRole('button', { name: '分け方を選ぶ' }));
  return section;
}

describe('PersonDetail の、人物を分ける操作', () => {
  it('新しい人物の名前を入れ、移す参照を選んで確認すると、選んだ参照だけを新しい人物に移し、新しい人物の詳細へ移る', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-neighbor" />);

    const section = await openSplitter(user);
    await user.type(within(section).getByLabelText('新しい人物の名前'), '隣家の息子');
    await user.click(within(section).getByRole('checkbox', { name: /発言者/ }));
    await user.click(within(section).getByRole('button', { name: '分ける' }));
    // 取り消せない操作のため、確認の画面で改めて承認を求める
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('「隣家の住人」から「隣家の息子」を分けますか？');
    expect(dialog).toHaveTextContent('選んだ1件の参照を「隣家の息子」に移します');
    await user.click(within(dialog).getByRole('button', { name: '分ける' }));

    const current = openedCase();
    const newPerson = current.persons.find((person) => person.name === '隣家の息子');
    expect(newPerson).toMatchObject({ kind: 'individual' });
    const claim = current.claims.find((item) => item.id === 'claim-neighbor');
    expect(claim?.speaker).toEqual({ kind: 'person', personIds: [newPerson?.id] });
    // 選ばなかった本文での言及は、元の人物に残る
    expect(current.claims.some((item) => item.mentionedPersonIds.includes('person-neighbor'))).toBe(true);
    expect(mockRouter.push).toHaveBeenLastCalledWith(`/cases/case-lakeside/persons/${newPerson?.id}`);
  });

  it('参照を、種類と参照元（証言の本文の冒頭など）で示し、すべて選ぶ・すべて外すができる', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-neighbor" />);

    const section = await openSplitter(user);
    const speaker = within(section).getByRole('checkbox', { name: /発言者/ });
    expect(speaker).toHaveAccessibleName(expect.stringContaining('湖畔の別荘の明かりがついていて'));

    await user.click(within(section).getByRole('button', { name: 'すべて選ぶ' }));
    for (const checkbox of within(section).getAllByRole('checkbox')) expect(checkbox).toBeChecked();
    await user.click(within(section).getByRole('button', { name: 'すべて外す' }));
    for (const checkbox of within(section).getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
  });

  it('新しい人物の名前を入れるまでは、分けるボタンを押せない', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-neighbor" />);

    const section = await openSplitter(user);
    expect(within(section).getByRole('button', { name: '分ける' })).toBeDisabled();
    await user.type(within(section).getByLabelText('新しい人物の名前'), '  ');
    expect(within(section).getByRole('button', { name: '分ける' })).toBeDisabled();
  });

  it('やめると、参照の一覧を閉じ、ケースを変えない', async () => {
    const user = userEvent.setup();
    render(<PersonDetail personId="person-neighbor" />);

    const section = await openSplitter(user);
    await user.click(within(section).getByRole('button', { name: 'やめる' }));

    expect(within(section).queryByLabelText('新しい人物の名前')).not.toBeInTheDocument();
    expect(openedCase()).toEqual(sampleFictionalCase);
  });
});
