// PNG atlas metadata -> lazy native Godot resources. No engine, plugins or dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const art = path.join(root, 'art');
const sprites = path.join(art, 'sprites');
const out = path.join(art, 'resources');
const manifest = JSON.parse(fs.readFileSync(path.join(art, 'art-manifest.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(sprites, 'sprites.json'), 'utf8'));
const lossless = manifest.assets.filter(d => d.id.startsWith('gem_icon_') || d.id.startsWith('rule_') || d.id.startsWith('relic_') || d.id.startsWith('ui_icon_') || d.id.startsWith('ui_node_') || d.id.startsWith('ui_reward_') || ['ui_panel', 'ui_btn', 'ui_btn_primary', 'ui_mult_badge', 'ui_heart', 'ui_heart_empty', 'ui_countdown', 'ui_hp_frame', 'ui_rule_sign', 'ui_rainbow_slot', 'card_gem_bar', 'bg_tile'].includes(d.id)).map(d => d.id);
fs.mkdirSync(out, { recursive: true });
const str = value => JSON.stringify(value);
const write = (file, content) => fs.writeFileSync(file, content);
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
let actions = 0, sets = 0;

for (const definition of manifest.assets) {
  const entries = Object.fromEntries(Object.entries(data.assets).filter(([name]) => name.split('@')[0] === definition.id).map(([name, entry]) => [name.includes('@') ? name.split('@')[1] : '', entry]));
  const deliveredSvg = path.join(art, 'svg', `${definition.id}.svg`);
  const svg = fs.readFileSync(fs.existsSync(deliveredSvg) ? deliveredSvg : path.join(art, 'placeholders/svg', `${definition.id}.svg`), 'utf8');
  const fingerprint = hash(svg);
  const animations = {};
  for (const [tint, entry] of Object.entries(entries)) {
    if (entry.hash !== fingerprint) throw new Error(`精灵图过期：${definition.id}${tint ? '@' + tint : ''}`);
    sets++;
    for (const [actionName, action] of Object.entries(entry.actions)) {
      const name = `${definition.id}${tint ? '@' + tint : ''}--${actionName.replace('~', '_')}`;
      const file = `${name}.tres`;
      const files = [...new Set(action.frames.map(f => f.s === -1 ? entry.still : f.s >= 0 ? entry.sheets[f.s].f : null).filter(Boolean))];
      const external = files.map((f, i) => `[ext_resource type="Texture2D" path="res://art/sprites/${f}" id="t${i}"]`).join('\n');
      const frames = [];
      const sub = [];
      action.frames.forEach((frame, i) => {
        const id = `f${i}`;
        if (frame.s === -2) {
          sub.push(`[sub_resource type="AtlasTexture" id="${id}"]\nregion = Rect2(0, 0, ${entry.w * entry.scale}, ${entry.h * entry.scale})`);
        } else {
          const filename = frame.s === -1 ? entry.still : entry.sheets[frame.s].f;
          const scale = frame.s === -1 ? entry.stillScale : entry.scale;
          const region = frame.s === -1 ? [0, 0, entry.w * scale, entry.h * scale] : [frame.x, frame.y, frame.w, frame.h];
          const margin = frame.s === -1 ? [0, 0, 0, 0] : [frame.ox, frame.oy, entry.w * scale - frame.w, entry.h * scale - frame.h];
          sub.push(`[sub_resource type="AtlasTexture" id="${id}"]\natlas = ExtResource("t${files.indexOf(filename)}")\nregion = Rect2(${region.join(', ')})\nmargin = Rect2(${margin.join(', ')})\nfilter_clip = true`);
        }
        frames.push(`{ "duration": ${frame.d}, "texture": SubResource("${id}") }`);
      });
      write(path.join(out, file), `[gd_resource type="SpriteFrames" load_steps=${files.length + action.frames.length + 1} format=3]\n\n${external}\n\n${sub.join('\n\n')}\n\n[resource]\nanimations = [{ "frames": [${frames.join(',\n')}], "loop": ${action.loop}, "name": &${str(actionName)}, "speed": 1000.0 }]\n`);
      animations[`${tint}:${actionName}`] = `res://art/resources/${file}`;
      actions++;
    }
  }
  write(path.join(out, `${definition.id}.tres`), `[gd_resource type="Resource" script_class="ArtResource" load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://scripts/art/art_resource.gd" id="1"]\n\n[resource]\nscript = ExtResource("1")\nart_id = ${str(definition.id)}\nsvg_fingerprint = ${str(fingerprint)}\ndefinition = ${str(definition)}\nentries = ${str(entries)}\nanimations = ${str(animations)}\n`);
}

for (const filename of fs.readdirSync(sprites).filter(f => f.endsWith('.png'))) {
  const id = filename.split('@')[0].replace(/-\d+\.png$/, '').replace(/\.png$/, '');
  const mode = lossless.includes(id) ? 0 : 2;
  const source = `res://art/sprites/${filename}`;
  const digest = crypto.createHash('md5').update(source).digest('hex');
  const dest = `res://.godot/imported/${filename}-${digest}${mode === 2 ? '.s3tc' : ''}.ctex`;
  const remapPath = mode === 2 ? `path.s3tc=${str(dest)}` : `path=${str(dest)}`;
  write(path.join(sprites, `${filename}.import`), `[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n${remapPath}\nmetadata={\n"vram_texture": ${mode === 2}\n}\n\n[deps]\n\nsource_file=${str(source)}\ndest_files=[${str(dest)}]\n\n[params]\n\ncompress/mode=${mode}\ncompress/high_quality=false\ncompress/lossy_quality=0.7\ncompress/uastc_level=0\ncompress/rdo_quality_loss=0.0\ncompress/hdr_compression=1\ncompress/normal_map=0\ncompress/channel_pack=0\nmipmaps/generate=false\nmipmaps/limit=-1\nroughness/mode=0\nroughness/src_normal=""\nprocess/fix_alpha_border=true\nprocess/premult_alpha=false\nprocess/normal_map_invert_y=false\nprocess/hdr_as_srgb=false\nprocess/hdr_clamp_exposure=false\nprocess/size_limit=0\ndetect_3d/compress_to=0\n`);
}
write(path.join(out, 'lossless-assets.json'), JSON.stringify({ reason: '文字/细线界面与小图标保留无损；其他牌面、怪、特效大图VRAM压缩；全部无mipmap。', ids: lossless }, null, 2) + '\n');
console.log(`已生成 ${manifest.assets.length} 个ArtResource、${sets} 套、${actions} 个原生SpriteFrames资源；${lossless.length} 个素材无损，其余VRAM压缩；mipmap关闭。`);
