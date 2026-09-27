/**
 * 地図の種類の切り替え（地理院タイルの標準地図・淡色地図、OpenStreetMap）のテスト
 */
import { render, screen } from '@testing-library/react';
import { MapContainer } from 'react-leaflet';
import { describe, expect, it } from 'vitest';
import type { MapTileStyle } from '@/lib/map-tiles';
import { MapTileLayers } from './MapTileLayers';

/** 地図の中に、タイルの切り替えを描画します。 */
function renderInMap(defaultStyle: MapTileStyle) {
  return render(
    <MapContainer center={[36.5, 137.5]} zoom={5}>
      <MapTileLayers defaultStyle={defaultStyle} />
    </MapContainer>
  );
}

describe('MapTileLayers', () => {
  it('淡色地図・標準地図・OpenStreetMap を切り替える選択肢を表示し、最初は指定した種類（淡色地図）を選ぶ', async () => {
    renderInMap('pale');

    expect(await screen.findByRole('radio', { name: '淡色地図' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '標準地図' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'OpenStreetMap' })).not.toBeChecked();
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
    // 検証: タイルが1枚以上読み込まれ、そのすべてが淡色地図であること
    expect(tileUrls.length).toBeGreaterThan(0);
    expect(tileUrls.every((url) => url?.includes('/pale/'))).toBe(true);
  });

  it('OpenStreetMap を選んだ場合は、OpenStreetMap のタイルを出典（OpenStreetMap の協力者）と共に読み込む', async () => {
    const { container } = renderInMap('osm');
    expect(await screen.findByRole('radio', { name: 'OpenStreetMap' })).toBeChecked();

    expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    const tileUrls = [...container.querySelectorAll('img.leaflet-tile')].map((tile) => tile.getAttribute('src'));
    expect(tileUrls.length).toBeGreaterThan(0);
    expect(tileUrls.every((url) => url?.startsWith('https://tile.openstreetmap.org/'))).toBe(true);
  });
});
