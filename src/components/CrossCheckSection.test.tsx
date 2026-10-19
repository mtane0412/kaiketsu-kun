/**
 * 証言の詳細に並べる「照合」（証言同士の突き合わせの結果の一覧・登録・編集・削除）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openedCase, openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { CrossCheckSection } from './CrossCheckSection';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: サンプルのケースには、防犯カメラ↔隣家の住人（裏付ける）と、管理人↔隣家の住人（食い違う）の照合がある
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
});

/** 「反応の記録」の「発言者」のパネルで、登録済みの人物を発言者に選びます。 */
async function chooseReactionSpeaker(user: UserEvent, reactionRegion: HTMLElement, personName: string) {
  await user.click(within(reactionRegion).getByRole('button', { name: /^発言者/ }));
  const speakerField = within(reactionRegion).getByRole('group', { name: '発言者' });
  await user.click(within(speakerField).getByRole('checkbox', { name: personName }));
}

/** 隣家の住人の証言の詳細に並ぶ「照合」を描画します。 */
function renderNeighborCrossCheck() {
  render(<CrossCheckSection claimId="claim-neighbor" tab="timeline" />);
  return screen.getByRole('region', { name: '照合' });
}

describe('CrossCheckSection', () => {
  it('照合した相手の証言を、種類・理由とともに、相手の証言の詳細へのリンクで並べる', () => {
    const crossCheckSection = renderNeighborCrossCheck();

    const item = within(crossCheckSection).getAllByRole('listitem');
    // 検証: 相手の証言の時系列の並び順（管理人 → 防犯カメラ）に並ぶ
    expect(within(item[0]!).getByText('食い違う')).toBeInTheDocument();
    expect(within(item[0]!).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
    expect(within(item[0]!).getByText(/管理人は別荘が真っ暗で/)).toBeInTheDocument();
    expect(within(item[1]!).getByText('裏付ける')).toBeInTheDocument();
    expect(within(item[1]!).getByRole('link', { name: /車が別荘の方向へ/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-police-camera'
    );
  });

  it('相手の証言が載っている資料を、媒体・原典の日付・資料の格の短い表示で示す（どの資料どうしの食い違いかを見比べるため）', () => {
    // 前提: 管理人の証言は、架空日報の朝刊（1998年8月14日）の記事を書籍の著者が転載した資料（二次報道）に載っている
    openTestCase({
      ...sampleFictionalCase,
      interviews: [
        {
          id: 'interview-reprint',
          title: '架空日報の記事の転載',
          interviewerPersonId: 'person-book',
          at: '2018-05',
          grade: 'secondaryReport',
          origin: { publisherPersonId: 'person-newspaper', publishedAt: '1998-08-14' },
        },
      ],
      claims: sampleFictionalCase.claims.map((claim) =>
        claim.id === 'claim-caretaker' ? { ...claim, sources: [{ interviewId: 'interview-reprint', viaPersonIds: ['person-newspaper', 'person-book'] }] } : claim
      ),
    });
    const crossCheckSection = renderNeighborCrossCheck();

    const [caretakerItem, cameraItem] = within(crossCheckSection).getAllByRole('listitem');
    expect(within(caretakerItem!).getByText('資料: 架空日報 朝刊 1998年8月14日・二次報道・転載')).toBeInTheDocument();
    // 検証: 資料にひもづかない証言には、資料の表示を出さない
    expect(within(cameraItem!).queryByText(/^資料:/)).not.toBeInTheDocument();
  });

  it('照合が1件も無い証言では、照合の登録を促す案内を表示する', () => {
    render(<CrossCheckSection claimId="claim-user-guess" tab="timeline" />);

    const crossCheckSection = screen.getByRole('region', { name: '照合' });
    expect(within(crossCheckSection).getByRole('button', { name: '照合を追加' })).toBeInTheDocument();
    expect(within(crossCheckSection).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('相手の証言・種類・理由を入力して保存すると、照合をケースに追加する', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '照合を追加' }));
    const registerButton = screen.getByRole('region', { name: '照合の登録' });
    // 検証: 相手の選択肢に、開いている証言そのものは並ばない
    expect(within(registerButton).queryByRole('option', { name: /明かりがついていて/ })).not.toBeInTheDocument();
    await user.selectOptions(within(registerButton).getByLabelText('相手の証言'), 'claim-report');
    await user.click(within(registerButton).getByRole('radio', { name: '同じ事柄を述べている' }));
    await user.type(within(registerButton).getByLabelText('理由（任意）'), 'どちらも12日夜の持ち主の様子を述べている。');
    await user.click(within(registerButton).getByRole('button', { name: '照合を保存' }));

    const addedCrossCheck = openedCase().crossChecks.find((crossCheck) => crossCheck.claimIds.includes('claim-report'));
    expect(addedCrossCheck).toMatchObject({
      claimIds: ['claim-neighbor', 'claim-report'],
      kind: 'sameSubject',
      reason: 'どちらも12日夜の持ち主の様子を述べている。',
    });
    expect(screen.queryByRole('region', { name: '照合の登録' })).not.toBeInTheDocument();
  });

  it('理由を書かずに保存すると、理由を持たない照合として追加する', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '照合を追加' }));
    const registerButton = screen.getByRole('region', { name: '照合の登録' });
    await user.selectOptions(within(registerButton).getByLabelText('相手の証言'), 'claim-report');
    await user.type(within(registerButton).getByLabelText('理由（任意）'), '   ');
    await user.click(within(registerButton).getByRole('button', { name: '照合を保存' }));

    const addedCrossCheck = openedCase().crossChecks.find((crossCheck) => crossCheck.claimIds.includes('claim-report'));
    // 検証: 空白だけの理由は、理由のキーごと持たせない
    expect(addedCrossCheck).toBeDefined();
    expect(addedCrossCheck).not.toHaveProperty('reason');
  });

  it('照合の種類と理由を編集できる', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: /見回りをしたとき.*との照合（食い違う）を編集/ }));
    const editButton = screen.getByRole('region', { name: '照合の編集' });
    // 検証: 編集では、登録済みの相手・種類・理由を初期値にする
    expect(within(editButton).getByLabelText('相手の証言')).toHaveValue('claim-caretaker');
    expect(within(editButton).getByRole('radio', { name: '食い違う' })).toBeChecked();
    await user.click(within(editButton).getByRole('radio', { name: '同じ事柄を述べている' }));
    await user.clear(within(editButton).getByLabelText('理由（任意）'));
    await user.type(within(editButton).getByLabelText('理由（任意）'), '見た時刻が2時間ずれており、両立しうる。');
    await user.click(within(editButton).getByRole('button', { name: '照合を保存' }));

    const afterEdit = openedCase().crossChecks.find((crossCheck) => crossCheck.id === 'cross-check-caretaker-neighbor');
    expect(afterEdit).toMatchObject({
      claimIds: ['claim-caretaker', 'claim-neighbor'],
      kind: 'sameSubject',
      reason: '見た時刻が2時間ずれており、両立しうる。',
    });
  });

  it('同じ相手との照合が複数ある場合も、編集・削除のボタンの名前を種類で区別する', () => {
    // 前提: 管理人の証言との間に、食い違う照合に加えて、同じ事柄を述べている照合も登録されている
    openTestCase({
      ...sampleFictionalCase,
      crossChecks: [
        ...sampleFictionalCase.crossChecks,
        {
          id: 'cross-check-caretaker-neighbor-subject',
          claimIds: ['claim-neighbor', 'claim-caretaker'],
          kind: 'sameSubject',
          reason: 'どちらも12日夜の別荘の様子を述べている。',
        },
      ],
    });

    renderNeighborCrossCheck();

    expect(screen.getByRole('button', { name: /見回りをしたとき.*との照合（食い違う）を編集/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /見回りをしたとき.*との照合（同じ事柄を述べている）を編集/ })).toBeInTheDocument();
  });

  it('撤回・訂正の照合は、どちらがどちらを撤回・訂正したかを選んで保存し、撤回・訂正した証言を1件目に置く', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '照合を追加' }));
    const registerRegion = screen.getByRole('region', { name: '照合の登録' });
    await user.selectOptions(within(registerRegion).getByLabelText('相手の証言'), 'claim-report');
    // 検証: 向きの欄は、撤回・訂正を選んだときだけ表示する
    expect(within(registerRegion).queryByRole('group', { name: '撤回・訂正の向き' })).not.toBeInTheDocument();
    await user.click(within(registerRegion).getByRole('radio', { name: '撤回・訂正している' }));
    const direction = within(registerRegion).getByRole('group', { name: '撤回・訂正の向き' });
    await user.click(within(direction).getByRole('radio', { name: '相手の証言が、この証言を撤回・訂正している' }));
    await user.click(within(registerRegion).getByRole('button', { name: '照合を保存' }));

    const addedCrossCheck = openedCase().crossChecks.find((crossCheck) => crossCheck.kind === 'revises');
    expect(addedCrossCheck?.claimIds).toEqual(['claim-report', 'claim-neighbor']);
  });

  it('撤回・訂正の照合を編集するときは、登録済みの向きを初期値にし、向きを入れ替えて保存できる', async () => {
    // 前提: 隣家の住人の証言が、新聞の記事の証言を訂正したと登録されている
    openTestCase({
      ...sampleFictionalCase,
      crossChecks: [{ id: 'cross-check-revision', claimIds: ['claim-neighbor', 'claim-report'], kind: 'revises' }],
    });
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    // 検証: 操作のボタンの名前にも、開いている証言がどちらの側かを含める
    await user.click(screen.getByRole('button', { name: /との照合（この証言が撤回・訂正した証言）を編集/ }));
    const direction = within(screen.getByRole('region', { name: '照合の編集' })).getByRole('group', { name: '撤回・訂正の向き' });
    expect(within(direction).getByRole('radio', { name: 'この証言が、相手の証言を撤回・訂正している' })).toBeChecked();
    await user.click(within(direction).getByRole('radio', { name: '相手の証言が、この証言を撤回・訂正している' }));
    await user.click(screen.getByRole('button', { name: '照合を保存' }));

    expect(openedCase().crossChecks[0]?.claimIds).toEqual(['claim-report', 'claim-neighbor']);
  });

  it('照合を削除しても、照合した証言は残る', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: /車が別荘の方向へ.*との照合（裏付ける）を削除/ }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    const caseData = openedCase();
    expect(caseData.crossChecks.map((crossCheck) => crossCheck.id)).toEqual(['cross-check-caretaker-neighbor']);
    expect(caseData.claims.map((claim) => claim.id)).toContain('claim-police-camera');
  });
});

describe('CrossCheckSection の反応の記録', () => {
  it('反応を書いて保存すると、反応した人物の証言と、元の証言との照合（食い違う）を同時に追加する', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '反応を記録' }));
    const reactionRegion = screen.getByRole('region', { name: '反応の記録' });
    // 検証: 反応の多くは否定のため、種類の初期値は「食い違う」にする
    expect(within(reactionRegion).getByRole('radio', { name: '食い違う' })).toBeChecked();
    await user.type(within(reactionRegion).getByLabelText('内容'), 'その夜、持ち主は別荘にいなかった。');
    await chooseReactionSpeaker(user, reactionRegion, '管理人');
    await user.click(within(reactionRegion).getByRole('button', { name: '書き足す' }));

    const caseData = openedCase();
    const reactionClaim = caseData.claims.at(-1);
    expect(reactionClaim).toMatchObject({
      content: 'その夜、持ち主は別荘にいなかった。',
      speaker: { kind: 'person', personIds: ['person-caretaker'] },
    });
    const reactionCrossCheck = caseData.crossChecks.find((crossCheck) => crossCheck.claimIds.includes(reactionClaim!.id));
    // 検証: 反応の本文が食い違いの中身を表すため、照合の理由は持たせない
    expect(reactionCrossCheck).toMatchObject({ claimIds: ['claim-neighbor', reactionClaim!.id], kind: 'contradicts' });
    expect(reactionCrossCheck).not.toHaveProperty('reason');
    expect(screen.queryByRole('region', { name: '反応の記録' })).not.toBeInTheDocument();
  });

  it('反応の証言を、時系列の並び順で元の証言の直後に置く', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '反応を記録' }));
    const reactionRegion = screen.getByRole('region', { name: '反応の記録' });
    await user.type(within(reactionRegion).getByLabelText('内容'), 'その夜、持ち主は別荘にいなかった。');
    await chooseReactionSpeaker(user, reactionRegion, '管理人');
    await user.click(within(reactionRegion).getByRole('button', { name: '書き足す' }));

    const caseData = openedCase();
    const reactionClaimId = caseData.claims.at(-1)!.id;
    const order = caseData.timelineOrder;
    expect(order.indexOf(`claim:${reactionClaimId}`)).toBe(order.indexOf('claim:claim-neighbor') + 1);
  });

  it('種類を「裏付ける」に切り替えて、同意の反応を記録できる', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '反応を記録' }));
    const reactionRegion = screen.getByRole('region', { name: '反応の記録' });
    await user.click(within(reactionRegion).getByRole('radio', { name: '裏付ける' }));
    await user.type(within(reactionRegion).getByLabelText('内容'), '自分も庭に人影を見た。');
    await chooseReactionSpeaker(user, reactionRegion, '管理人');
    await user.click(within(reactionRegion).getByRole('button', { name: '書き足す' }));

    const caseData = openedCase();
    const reactionClaimId = caseData.claims.at(-1)!.id;
    expect(caseData.crossChecks.find((crossCheck) => crossCheck.claimIds.includes(reactionClaimId))).toMatchObject({
      kind: 'supports',
    });
  });

  it('反応の種類には、撤回・訂正を並べない', async () => {
    // 前提: 撤回・訂正は同じ発言者が前の発言を改めるものであり、別の人物の反応ではない
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '反応を記録' }));
    const reactionRegion = screen.getByRole('region', { name: '反応の記録' });

    expect(within(reactionRegion).getByRole('radio', { name: '食い違う' })).toBeInTheDocument();
    expect(within(reactionRegion).queryByRole('radio', { name: '撤回・訂正している' })).not.toBeInTheDocument();
  });

  it('発言者を選ばずに保存しようとすると、理由を示して、証言も照合も追加しない', async () => {
    // 前提: 反応は別の人物の反応を記録するものであり、発言者の無い証言（ユーザーの推測）にはしない
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '反応を記録' }));
    const reactionRegion = screen.getByRole('region', { name: '反応の記録' });
    await user.type(within(reactionRegion).getByLabelText('内容'), 'その夜、持ち主は別荘にいなかった。');
    await user.click(within(reactionRegion).getByRole('button', { name: '書き足す' }));

    expect(await within(reactionRegion).findByRole('alert')).toHaveTextContent('反応した人物を発言者に選んでください');
    expect(openedCase().claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(openedCase().crossChecks).toHaveLength(sampleFictionalCase.crossChecks.length);
  });

  it('「やめる」で閉じると、証言も照合も追加しない', async () => {
    const user = userEvent.setup();
    renderNeighborCrossCheck();

    await user.click(screen.getByRole('button', { name: '反応を記録' }));
    const reactionRegion = screen.getByRole('region', { name: '反応の記録' });
    await user.type(within(reactionRegion).getByLabelText('内容'), 'その夜、持ち主は別荘にいなかった。');
    await user.click(within(reactionRegion).getByRole('button', { name: 'やめる' }));

    expect(screen.queryByRole('region', { name: '反応の記録' })).not.toBeInTheDocument();
    expect(openedCase().claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(openedCase().crossChecks).toHaveLength(sampleFictionalCase.crossChecks.length);
  });
});
