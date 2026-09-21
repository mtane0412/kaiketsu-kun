/**
 * 人物のアイコンに表示する文字の決定のテスト
 */
import { describe, expect, it } from 'vitest';
import { firstCharacter, personIconText } from './person-icon';

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
