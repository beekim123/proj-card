import './styles.css';
import { loadArtAssets, renderArtGallery } from './art';
import { GameUI } from './ui/game';

async function start() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('缺少 #app 容器');
  root.textContent = '加载中';
  root.className = 'loading';
  try {
    const store = await loadArtAssets();
    const palette = store.manifest.palette;
    for (const key of ['ink', 'text', 'textDim', 'accent', 'accentDark', 'pageBg', 'panelBg', 'barTrack', 'barFill', 'hpFill', 'hpChip'] as const) document.documentElement.style.setProperty(`--${key}`, palette[key]);
    root.className = '';
    if (new URLSearchParams(location.search).get('page') === 'art') { document.body.classList.add('art-page'); renderArtGallery(root, store); }
    else new GameUI(root, store);
  } catch (error) {
    console.error(error);
    root.replaceChildren();
    const message = document.createElement('p'); message.textContent = '加载失败，请通过静态服务器打开，并确认 art-manifest.json 存在。';
    const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.addEventListener('click', () => location.reload()); root.append(message, retry);
  }
}
void start();
