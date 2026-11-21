const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const auto = process.argv.includes('--auto');
const monster = process.argv.find(arg => arg.startsWith('--monster='))?.slice('--monster='.length) ?? '';
const captureMonster = Boolean(monster) && process.argv.includes('--capture');
const output = process.env.NIGHTWOOD_EVIDENCE ? path.resolve(process.env.NIGHTWOOD_EVIDENCE) : path.join(__dirname, 'artifacts/nightwood');
let win;
let internal;
let measurements;
app.setName('异能卡牌');
// Regression runs may use a separate profile; do not take over an existing player's window or save.
if(process.env.NIGHTWOOD_TEST_PROFILE)app.setPath('userData',path.resolve(process.env.NIGHTWOOD_TEST_PROFILE));
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  const displays = screen.getAllDisplays();
  internal = displays.find(d => d.internal);
  if (!internal) {
    console.error('没有识别到内置屏幕。请打开 Mac 内屏后重新启动。');
    app.exit(2);
    return;
  }
  measurements = {
    electron: process.versions.electron, chrome: process.versions.chrome,
    vsync: 'default', internal: internal.id, externalConnected: displays.some(d => !d.internal),
    bounds: internal.bounds, scaleFactor: internal.scaleFactor, displayFrequency: internal.displayFrequency
  };
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    ...internal.bounds, show: false, frame: false, movable: false,
    backgroundColor: '#203037', title: '异能卡牌',
    webPreferences: {preload: path.join(__dirname,'preload.cjs'), contextIsolation: true, sandbox: true}
  });
  const onInternal = () => screen.getAllDisplays().some(d => d.id === internal.id && d.internal)
    && screen.getDisplayMatching(win.getBounds()).id === internal.id;
  function guardDisplay() {
    if (!onInternal()) {
      win.hide();
      console.error('内屏配置改变，已关闭试玩。');
      app.exit(2);
    }
  }
  win.setBounds(internal.bounds);
  if (!onInternal()) { app.exit(2); return; }
  win.setSimpleFullScreen(true);
  if (!onInternal()) { app.exit(2); return; }
  win.on('move', guardDisplay);
  screen.on('display-removed', guardDisplay);
  screen.on('display-metrics-changed', guardDisplay);
  win.webContents.on('render-process-gone', (_,details) => {
    console.error('绘图进程结束', details.reason);
    app.exit(3);
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.meta && input.key.toLowerCase() === 'q') { event.preventDefault(); app.quit(); }
  });
  win.webContents.on('console-message', (_, details) => {
    if (details.level === 'error') console.error(details.message, details.sourceId, details.lineNumber);
  });
  const root = path.join(__dirname,'art/monster');
  const entries = await fs.readdir(root,{withFileTypes:true});
  const modules = entries.filter(entry => entry.isDirectory() && /^[a-z][a-z0-9-]*$/.test(entry.name))
    .map(entry => entry.name);
  await win.loadFile('index.html', {query: {
    ...(process.argv.some(v=>/^--seed=\d+$/.test(v))?{seed:process.argv.find(v=>/^--seed=\d+$/.test(v)).slice(7)}:{}),
    ...(process.argv.includes('--observe')?{observe:'1'}:{}),...(process.argv.includes('--fullhp')?{fullhp:'1'}:{}),auto: auto ? '1' : '0', monster, modules: modules.join(','), captureMonster: captureMonster ? '1' : '0'
  }});
  if (!onInternal()) { app.exit(2); return; }
  win.show();
  win.focus();
  win.webContents.focus();
  console.log('内屏', JSON.stringify(measurements));
});
app.on('window-all-closed', () => app.quit());

if (auto) {
  ipcMain.on('lock-gesture', () => {
    // In auto mode a genuine Electron input event exercises Chromium pointer lock.
    const {width,height} = win.getContentBounds();
    const point = {x: Math.floor(width*.145), y: Math.floor(height*.485), button: 'left', clickCount: 1};
    win.webContents.sendInputEvent({type:'mouseMove', x:point.x, y:point.y});
    win.webContents.sendInputEvent({type:'mouseDown', ...point});
    win.webContents.sendInputEvent({type:'mouseUp', ...point});
  });
}
if (auto || captureMonster) {
  ipcMain.handle('capture', async (_, name, data) => {
    if (!/^\d\d-[a-z]+(?:-[0-9]+)?\.png$/.test(name)) throw Error('截图文件名不匹配');
    await fs.mkdir(output, {recursive:true});
    await fs.writeFile(path.join(output,name), Buffer.from(data));
  });
  ipcMain.handle('finish', async (_, report) => {
    if (auto && report) {
      await fs.mkdir(output, {recursive:true});
      await fs.writeFile(path.join(output,'auto.json'), JSON.stringify({...report, display:measurements}, null, 1));
      console.log('60 秒完成', JSON.stringify(report.summary));
    } else console.log('看怪截图完成');
    setImmediate(() => app.quit());
  });
}
