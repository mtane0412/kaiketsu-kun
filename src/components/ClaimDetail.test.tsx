/**
 * 証言の詳細ページ（編集・削除・関連する証言への導線）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Interview } from '@/domain/types';
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

    const afterSave = openedCase().claims.find((claim) => claim.id === 'claim-neighbor');
    expect(afterSave?.content).toContain('窓は開いていた。');
    expect(afterSave?.when).toBe('1998-08-12T21:00');
    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
  });

  it('「この証言を削除」を、「発言者」と「証言を保存」より前に置く', () => {
    // 検証: 削除が「発言者」と「証言を保存」の中間に浮かないよう、行の左端に置くこと
    render(<ClaimDetail claimId="claim-neighbor" />);

    const deleteButton = screen.getByRole('button', { name: 'この証言を削除' });
    const speaker = screen.getByRole('button', { name: /^発言者:/ });
    const saveButton = screen.getByRole('button', { name: '証言を保存' });

    expect(deleteButton.compareDocumentPosition(speaker)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(speaker.compareDocumentPosition(saveButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('時系列の前後の証言へのリンクを表示する', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const beforeAndAfter = screen.getByRole('navigation', { name: '時系列の前後の証言' });
    expect(within(beforeAndAfter).getByRole('link', { name: /^前の証言/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-police-camera');
    expect(within(beforeAndAfter).getByRole('link', { name: /^次の証言/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-report');
  });

  it('同じ人物・場所に触れている他の証言を、人物・場所ごとにまとめてリンクにする', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const lakesideVilla = screen.getByRole('region', { name: '「湖畔の別荘」に触れている他の証言' });
    const links = within(within(lakesideVilla).getByRole('list')).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-caretaker');
    expect(links[0]).toHaveTextContent('管理人');
    expect(links[0]).toHaveTextContent(/見回りをしたとき/);
  });

  it('この証言が触れている発言者・経由・言及・場所を、人物・場所の詳細へのリンクにする', () => {
    // 前提: 隣家の住人の証言は、発言者が隣家の住人で、架空日報 朝刊を経由し、別荘の持ち主に言及し、湖畔の別荘を述べている
    render(<ClaimDetail claimId="claim-neighbor" />);

    const mentionedTargets = screen.getByRole('navigation', { name: 'この証言が触れている人物・場所' });
    expect(within(mentionedTargets).getByRole('link', { name: '発言者 隣家の住人' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-neighbor'
    );
    expect(within(mentionedTargets).getByRole('link', { name: '経由 架空日報 朝刊' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-newspaper'
    );
    expect(within(mentionedTargets).getByRole('link', { name: '言及 別荘の持ち主' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/persons/person-owner'
    );
    expect(within(mentionedTargets).getByRole('link', { name: '場所 湖畔の別荘' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/places/place-villa'
    );
  });

  it('「〇〇に触れている他の証言」の見出しを、その人物・場所の詳細へのリンクにする', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const lakesideVilla = screen.getByRole('region', { name: '「湖畔の別荘」に触れている他の証言' });
    expect(within(lakesideVilla).getByRole('link', { name: '湖畔の別荘' })).toHaveAttribute('href', '/cases/case-lakeside/places/place-villa');
  });

  it('似ている証言を、似ている順にリンクにし、似ている理由を添える', () => {
    // 前提: 隣家の住人の証言に最も似ているのは、同じ場所で日時も近い管理人の証言
    render(<ClaimDetail claimId="claim-neighbor" />);

    const similarSection = screen.getByRole('region', { name: '似ている証言' });
    const items = within(within(similarSection).getByRole('list')).getAllByRole('listitem');
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-caretaker');
    expect(items[0]).toHaveTextContent('人物: 別荘の持ち主');
    expect(items[0]).toHaveTextContent('同じ場所: 湖畔の別荘');
    expect(items[0]).toHaveTextContent('日時が近い（約2時間差）');
  });

  it('似ている証言に、照合の種類と、両方をひもづけている仮説を目印として添える', () => {
    // 前提: 隣家の住人の証言と管理人の証言は「食い違う」照合を持ち、仮説「持ち主は19時より前に別荘を離れた」に両方ひもづいている
    render(<ClaimDetail claimId="claim-neighbor" />);

    const similarSection = screen.getByRole('region', { name: '似ている証言' });
    const caretakerItem = within(similarSection)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByRole('link', { name: /見回りをしたとき/ }) !== null);
    expect(caretakerItem).toHaveTextContent('照合: 食い違い');
    expect(caretakerItem).toHaveTextContent('仮説: 持ち主は19時より前に別荘を離れた');
  });

  it('似ている証言の欄を、「〇〇に触れている他の証言」より前に置く', () => {
    render(<ClaimDetail claimId="claim-neighbor" />);

    const similarSection = screen.getByRole('region', { name: '似ている証言' });
    const lakesideVilla = screen.getByRole('region', { name: '「湖畔の別荘」に触れている他の証言' });
    expect(similarSection.compareDocumentPosition(lakesideVilla)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('開いているタブをURLから引き継ぎ、詳細を閉じるリンクと、他の証言へのリンクに反映する', () => {
    resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor?tab=map');
    render(<ClaimDetail claimId="claim-neighbor" />);

    expect(screen.getByRole('link', { name: '証言の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside?tab=map');
    const beforeAndAfter = screen.getByRole('navigation', { name: '時系列の前後の証言' });
    expect(within(beforeAndAfter).getByRole('link', { name: /^次の証言/ })).toHaveAttribute('href', '/cases/case-lakeside/claims/claim-report?tab=map');
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

    const crossCheck = screen.getByRole('region', { name: '照合' });
    expect(within(crossCheck).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
  });

  it('この証言を使っている仮説へ、ひもづけている立場とともに、証言の詳細からたどれる', () => {
    // 前提: 管理人の証言は、管理人の仮説の「管理人の機会」と、否定された仮説の「支える証言」にひもづいている
    render(<ClaimDetail claimId="claim-caretaker" />);

    const hypothesis = screen.getByRole('region', { name: 'この証言を使っている仮説' });
    const item = within(hypothesis).getAllByRole('listitem');
    expect(within(item[0]!).getByRole('link', { name: /管理人が失踪に関わっている/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/hypotheses/hypothesis-caretaker'
    );
    expect(item[0]).toHaveTextContent('管理人の機会');
    expect(item[1]).toHaveTextContent('持ち主は19時より前に別荘を離れた');
    expect(item[1]).toHaveTextContent('支える証言');
    expect(item[1]).toHaveTextContent('否定された');
  });

  it('この証言の未了事項を、状態とともに並べ、この証言をひもづけた未了事項を追加するページへのリンクを置く', () => {
    // 前提: 防犯カメラの証言は、対応中の「防犯カメラの映像の確認」にひもづいている
    render(<ClaimDetail claimId="claim-police-camera" />);

    const task = screen.getByRole('region', { name: 'この証言の未了事項' });
    const [item] = within(task).getAllByRole('listitem');
    expect(within(item!).getByRole('link', { name: /防犯カメラの映像/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/task-camera'
    );
    expect(item).toHaveTextContent('対応中');
    expect(within(task).getByRole('link', { name: 'この証言の未了事項を追加' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/new?link=claim%3Aclaim-police-camera'
    );
  });

  it('未了事項にひもづいた証言の削除の確認では、未了事項からひもづけを外すことを伝える', async () => {
    const user = userEvent.setup();
    render(<ClaimDetail claimId="claim-police-camera" />);

    await user.click(screen.getByRole('button', { name: 'この証言を削除' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('この証言をひもづけた未了事項1件から、ひもづけを外します。');
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

/** 管理人へのインタビュー動画の聴取です（文字起こしを貼り付けています）。 */
const videoInterview: Interview = {
  id: 'interview-video',
  title: '管理人へのインタビュー',
  url: 'https://www.youtube.com/watch?v=abc',
  transcript: '0:00\nこんばんは、管理人です\n12:34\nあの夜は別荘が真っ暗でした',
};

/** 管理人の証言を、動画の文字起こしから書き起こした（引用 quoteText を持つ）ケースを返します。 */
function caseWithQuote(quoteText: string, interview: Interview = videoInterview): Case {
  return {
    ...sampleFictionalCase,
    interviews: [interview],
    claims: sampleFictionalCase.claims.map((claim) =>
      claim.id === 'claim-caretaker' ? { ...claim, interviewId: interview.id, quote: { text: quoteText, seconds: 754 } } : claim
    ),
  };
}

describe('ClaimDetail（引用）', () => {
  beforeEach(() => {
    resetMockNavigation('/cases/case-lakeside/claims/claim-caretaker');
  });

  it('引用の原文と動画の位置を示し、その時点から動画を再生するリンクを置く', () => {
    openTestCase(caseWithQuote('あの夜は別荘が真っ暗でした'));
    render(<ClaimDetail claimId="claim-caretaker" />);

    const quoteSection = screen.getByRole('region', { name: '引用' });
    expect(within(quoteSection).getByText('あの夜は別荘が真っ暗でした')).toBeInTheDocument();
    const videoLink = within(quoteSection).getByRole('link', { name: '12:34 から動画を開く' });
    expect(videoLink).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc&t=754s');
    expect(videoLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(quoteSection).queryByText(/本文に見つかりません/)).not.toBeInTheDocument();
  });

  it('引用の原文が時刻だけの行を含む場合は、時刻の行を除いて示す（動画の位置は別に示すため）', () => {
    openTestCase(caseWithQuote('12:34\nあの夜は別荘が真っ暗でした'));
    render(<ClaimDetail claimId="claim-caretaker" />);

    const quoteSection = screen.getByRole('region', { name: '引用' });
    expect(within(quoteSection).getByRole('blockquote')).toHaveTextContent(/^あの夜は別荘が真っ暗でした$/);
    expect(within(screen.getByRole('group', { name: '引用' })).queryByText(/^12:34/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: '引用' })).getByText('あの夜は別荘が真っ暗でした')).toBeInTheDocument();
    expect(within(quoteSection).queryByText(/資料の本文に見つかりません/)).not.toBeInTheDocument();
  });

  it('YouTube 以外の資料では、再生位置を付けずに資料を開くリンクを置く', () => {
    openTestCase(caseWithQuote('あの夜は別荘が真っ暗でした', { ...videoInterview, url: 'https://example.com/news/1' }));
    render(<ClaimDetail claimId="claim-caretaker" />);

    const quoteSection = screen.getByRole('region', { name: '引用' });
    expect(within(quoteSection).getByRole('link', { name: '資料を開く' })).toHaveAttribute('href', 'https://example.com/news/1');
  });

  it('引用の原文が聴取の本文に見つからない場合は、見つからないことを示す', () => {
    openTestCase(caseWithQuote('あの夜は明かりがついていました'));
    render(<ClaimDetail claimId="claim-caretaker" />);

    expect(within(screen.getByRole('region', { name: '引用' })).getByText(/資料の本文に見つかりません/)).toBeInTheDocument();
  });

  it('聴取に本文が無い場合は、引用を照らし合わせられないことを示す', () => {
    const { transcript: _transcript, ...interviewWithoutTranscript } = videoInterview;
    openTestCase(caseWithQuote('あの夜は別荘が真っ暗でした', interviewWithoutTranscript));
    render(<ClaimDetail claimId="claim-caretaker" />);

    expect(within(screen.getByRole('region', { name: '引用' })).getByText(/照らし合わせられません/)).toBeInTheDocument();
  });

  it('引用を持たない証言では、引用の欄を表示しない', () => {
    openTestCase(sampleFictionalCase);
    render(<ClaimDetail claimId="claim-caretaker" />);

    expect(screen.queryByRole('region', { name: '引用' })).not.toBeInTheDocument();
  });

  it('編集で引用を保持し、「引用を外す」を押して保存すると、引用を持たない証言にする', async () => {
    const user = userEvent.setup();
    openTestCase(caseWithQuote('あの夜は別荘が真っ暗でした'));
    render(<ClaimDetail claimId="claim-caretaker" />);

    await user.click(screen.getByRole('button', { name: '証言を保存' }));
    expect(openedCase().claims.find((claim) => claim.id === 'claim-caretaker')?.quote).toEqual({
      text: 'あの夜は別荘が真っ暗でした',
      seconds: 754,
    });

    await user.click(screen.getByRole('button', { name: '引用を外す' }));
    await user.click(screen.getByRole('button', { name: '証言を保存' }));
    expect(openedCase().claims.find((claim) => claim.id === 'claim-caretaker')).not.toHaveProperty('quote');
  });
});
