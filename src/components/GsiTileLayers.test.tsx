/**
 * 地理院タイルの種類の切り替え（標準地図・淡色地図）のテスト
 */
import { render, screen } from '@testing-library/react';
import { MapContainer } from 'react-leaflet';
import { describe, expect, it } from 'vitest';
import { GsiTileLayers } from './GsiTileLayers';

/** 地図の中に、タイルの切り替えを描画します。 */
function renderInMap(defaultStyle: 'standard' | 'pale') {
  return render(
    <MapContainer center={[36.5, 137.5]} zoom={5}>
      <GsiTileLayers defaultStyle={defaultStyle} />
    </MapContainer>
  );
}

describe('GsiTileLayers', () => {
  it('標準地図と淡色地図を切り替える選択肢を表示し、最初は指定した種類（淡色地図）を選ぶ', async () => {
    renderInMap('pale');

    expect(await screen.findByRole('radio', { name: '淡色地図' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '標準地図' })).not.toBeChecked();
  });

  it('最初に選ぶ種類に標準地図を指定できる', async () => {
    renderInMap('standard');

    expect(await screen.findByRole('radio', { name: '標準地図' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '淡色地図' })).not.toBeChecked();
  });

  it('選んだ種類のタイルを、出典（地理院タイル）と共に読み込む', async () => {
    const { container } = renderInMap('pale');
    await screen.findByRole('radio', { name: '淡色地図' });

    expect(screen.getByRole('link', { name: '地理院タイル' })).toBeInTheDocument();
    const tileUrls = [...container.querySelectorAll('img.leaflet-tile')].map((tile) => tile.getAttribute('src'));
    // 前提: jsdom では地図の大きさが0のためタイルが1枚も読み込まれない場合がある。読み込まれたタイルはすべて淡色地図であること
    expect(tileUrls.every((url) => url?.includes('/pale/'))).toBe(true);
  });
});
