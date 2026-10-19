/**
 * 人物のアイコンに表示する文字の決定のテスト
 */
import { describe, expect, it } from 'vitest';
import { findIconTextCollisions, firstCharacter, personIconText, suggestIconTexts } from './person-icon';
import type { Person } from './types';

describe('personIconText', () => {
  it('アイコンの文字を指定していない人物は、名前の先頭の1文字を返す', () => {
    expect(personIconText({ name: '隣家の住人' })).toBe('隣');
  });

  it('アイコンの文字を指定した人物は、名前ではなく指定した文字を返す', () => {
    // 「管理人」と「管財人」のように先頭の文字が重なる人物を、見分けられるようにするための指定
    expect(personIconText({ name: '管理人', iconText: '鍵' })).toBe('鍵');
  });

  it('名前の前に空白があっても、空白ではない最初の文字を返す', () => {
    expect(personIconText({ name: ' 県警' })).toBe('県');
  });

  it('絵文字のように複数の符号で1文字になる文字も、途中で切らずに1文字として返す', () => {
    expect(personIconText({ name: '県道の防犯カメラ', iconText: '👨‍👩‍👧' })).toBe('👨‍👩‍👧');
  });

  it('名前が空の人物は、空文字列を返す', () => {
    expect(personIconText({ name: '' })).toBe('');
  });
});

describe('firstCharacter', () => {
  it('入力された文字列の先頭の1文字だけを返す（フォームの入力を1文字に切り詰めるため）', () => {
    expect(firstCharacter('新聞')).toBe('新');
  });

  it('空白だけの文字列は、空文字列を返す', () => {
    expect(firstCharacter('  ')).toBe('');
  });
});

/** テスト用の人物を作ります。種別は個人に固定します。 */
function person(id: string, name: string, extra: Partial<Person> = {}): Person {
  return { id, name, kind: 'individual', ...extra };
}

describe('findIconTextCollisions', () => {
  const victim = person('victim', '被害女性');
  const father = person('father', '被疑者の父親');
  const brother = person('brother', '被疑者の弟');
  const police = person('police', '県警');

  it('アイコンの文字が同じになる他の人物を返す（名前の頭がそろう人物）', () => {
    const collisions = findIconTextCollisions([victim, father, brother, police], victim);
    expect(collisions.map((other) => other.id)).toEqual(['father', 'brother']);
  });

  it('自分自身（同じID）は重なりに含めない', () => {
    expect(findIconTextCollisions([victim, police], victim)).toEqual([]);
  });

  it('アイコンの文字を指定して重ならなくなった人物は返さない', () => {
    const fatherWithIcon = person('father', '被疑者の父親', { iconText: '父' });
    expect(findIconTextCollisions([victim, fatherWithIcon], victim)).toEqual([]);
  });

  it('画像を登録した人物は、アイコンに文字を表示しないため重なりに含めない', () => {
    const fatherWithImage = person('father', '被疑者の父親', { imageDataUrl: 'data:image/png;base64,AAAA' });
    expect(findIconTextCollisions([victim, fatherWithImage], victim)).toEqual([]);
  });

  it('対象の人物が画像を登録している場合は、文字を表示しないため重なりは無い', () => {
    const victimWithImage = { ...victim, imageDataUrl: 'data:image/png;base64,AAAA' };
    expect(findIconTextCollisions([victimWithImage, father], victimWithImage)).toEqual([]);
  });

  it('保存前の人物（IDが無い）でも、入力中の名前から重なりを調べられる', () => {
    expect(findIconTextCollisions([victim, police], { name: '県の医科大学' }).map((other) => other.id)).toEqual([
      'police',
    ]);
  });

  it('名前もアイコンの文字も空の人物は、文字を表示しないため重なりは無い', () => {
    expect(findIconTextCollisions([person('blank', '')], { name: '' })).toEqual([]);
  });
});

describe('suggestIconTexts', () => {
  it('名前に含まれる文字のうち、他の人物のアイコンと重ならない文字を、名前の順に返す', () => {
    // 「被」は他の人物と重なるため除き、「疑」「者」…の順に候補にする
    const others = [person('victim', '被害女性')];
    expect(suggestIconTexts('被疑者の父親', others)).toEqual(['疑', '者', '父']);
  });

  it('ひらがな・記号・空白は、人物を表す文字になりにくいため候補にしない', () => {
    expect(suggestIconTexts('被疑者 の・弟', [person('victim', '被害女性')])).toEqual(['疑', '者', '弟']);
  });

  it('同じ文字は1回だけ候補にする', () => {
    expect(suggestIconTexts('小林小次郎', [person('kobayashi', '小林')])).toEqual(['林', '次', '郎']);
  });

  it('候補の数は上限までに切り詰める', () => {
    expect(suggestIconTexts('岩手県警察本部', [], 2)).toEqual(['岩', '手']);
  });

  it('画像を登録した人物のアイコンの文字は、表示されないため避けなくてよい', () => {
    const withImage = person('paper', '岩手日報', { imageDataUrl: 'data:image/png;base64,AAAA' });
    expect(suggestIconTexts('岩手医科大学', [withImage], 1)).toEqual(['岩']);
  });
});
