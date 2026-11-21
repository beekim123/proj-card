// From the repository root: nice -n 10 ./node_modules/.bin/electron scripts/export-env.cjs
const {app, BrowserWindow, screen} = require('electron');
const {readFile, writeFile, readdir, mkdir, mkdtemp, rename, rm} = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../art/env');

// Scale the viewBox before rasterization. Trees are usually visible only in part
// at close range. The smaller foreground silhouettes carry finer contours per metre.
const scales = {
  tree:2.5, vine:8, shrub:8, grass:8, rock:8, log:8, loot:3, ground:4,
  sky:1.5, forest:1.5, low_fog:1, mote:3, fall:2, eyes:1
};

// Runs inside Chromium, sharing exactly the SVG and PNG implementation of the game.
async function renderSource(svgText, palette, scale, tile) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw Error('Invalid SVG');
  const source = doc.documentElement;
  for (const element of source.querySelectorAll('*')) {
    for (const attr of ['fill','stroke','stop-color']) {
      const binding = element.getAttribute('data-palette-' + attr);
      if (!binding) continue;
      const [key, level] = binding.split(':');
      const value = palette[key]?.[level];
      if (!value) throw Error('Unknown palette entry ' + binding);
      element.setAttribute(attr, value);
    }
  }
  const width = Math.round(source.viewBox.baseVal.width * scale);
  const height = Math.round(source.viewBox.baseVal.height * scale);
  source.setAttribute('width', width);
  source.setAttribute('height', height);
  const roles = [...source.children].map(e => e.id).filter(id => id === 'base' || id === 'sway');
  if (roles.length === 1) throw Error('Both base and sway are required');
  if (!roles.length) roles.push('body');
  if (source.querySelector('#warm')) roles.push('warm');

  function isolated(role) {
    const svg = source.cloneNode(true);
    if (role !== 'warm') svg.querySelector('#warm')?.remove();
    if (role !== 'body') {
      const part = svg.querySelector('#' + role);
      for (let child = part; child !== svg; child = child.parentNode) {
        for (const sibling of [...child.parentNode.children]) {
          if (sibling !== child && sibling.tagName !== 'defs') sibling.remove();
        }
      }
    }
    return new XMLSerializer().serializeToString(svg);
  }
  const layers = [];
  for (const role of roles) {
    const url = URL.createObjectURL(new Blob([isolated(role)], {type:'image/svg+xml'}));
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    let left=0, top=0, right=width, bottom=height;
    if (!tile) {
      const pixels = ctx.getImageData(0,0,width,height).data;
      left = width; top = height; right = bottom = 0;
      for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
        if (!pixels[(y*width+x)*4+3]) continue;
        left = Math.min(left,x); right = Math.max(right,x+1);
        top = Math.min(top,y); bottom = Math.max(bottom,y+1);
      }
      if (right) {
        left=Math.max(0,left-1); top=Math.max(0,top-1);
        right=Math.min(width,right+1); bottom=Math.min(height,bottom+1);
      } else left = top = 0;
    }
    const w=right-left, h=bottom-top;
    const out = document.createElement('canvas');
    out.width=Math.max(1,w); out.height=Math.max(1,h);
    if (w && h) out.getContext('2d').drawImage(canvas,left,top,w,h,0,0,w,h);
    layers.push({role, rect:[left/width,top/height,w/width,h/height], png:out.toDataURL().split(',')[1]});
    canvas.width = out.width = 0;
  }
  return {width, height, layers};
}

async function exportArt() {
  const internal = screen.getAllDisplays().find(display => display.internal);
  if (!internal) throw Error('Mac 内屏不可用，未创建导出窗口');
  const win = new BrowserWindow({x:internal.bounds.x+8,y:internal.bounds.y+8,
    width:64,height:64,show:false,focusable:false,webPreferences:{sandbox:true}});
  await win.loadURL('about:blank');
  const sourceDir = path.join(root, 'SVG原稿');
  const palettePath = process.argv.find(arg => arg.startsWith('--palette='))?.slice(10);
  const palette = JSON.parse(await readFile(palettePath || path.join(root,'环境-颜色表.json'),'utf8'));
  const files = (await readdir(sourceDir)).filter(name => name.endsWith('.svg')).sort();
  const stage = await mkdtemp(path.join(root,'.export-'));
  try {
    const entries = [];
    const pngs = [];
    for (const name of files) {
      const id = name.slice(0,-4), type = id.replace(/_\d+$/, '');
      if (!scales[type]) throw Error('Undefined output scale for ' + name);
      const text = await readFile(path.join(sourceDir,name),'utf8');
      const tile = type === 'ground' || type === 'forest' || type === 'low_fog';
      const args = [text,palette,scales[type],tile].map(v => JSON.stringify(v)).join(',');
      const data = await win.webContents.executeJavaScript('('+renderSource.toString()+')('+args+')');
      for (const layer of data.layers) {
        const file = id+(layer.role==='body'?'':'.'+layer.role)+'.png';
        await writeFile(path.join(stage,file),Buffer.from(layer.png,'base64'));
        delete layer.png;
        layer.file = file;
        pngs.push(file);
      }
      entries.push('  '+id+': '+JSON.stringify(data));
    }
    await mkdir(path.join(root,'png'),{recursive:true});
    for (const file of pngs) await rename(path.join(stage,file),path.join(root,'png',file));
    await writeFile(path.join(root,'manifest.js'),'// Generated by scripts/export-env.cjs\nexport const ENV_SPRITES = {\n'+entries.join(',\n')+'\n};\n');
    console.log(files.length+' SVG → '+pngs.length+' PNG');
  } finally {
    await rm(stage,{recursive:true,force:true});
    win.destroy();
  }
}
app.whenReady().then(exportArt).then(()=>app.quit(),error=>{console.error(error);app.exit(1)});
