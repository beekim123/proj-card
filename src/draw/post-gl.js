// Lightweight WebGL2 2D water-reflection compositing pass (GLSL ES 3.00, single pass, zero external engines).
// Runs immediately after floorLayer and BEFORE the depth-sorted scenery/monster queue, sampling the
// cached world reflection texture (captured at the end of paintWorld before HUD/vignette) so puddles,
// shore grass, trees, and monsters follow 100% exact single-pass back-to-front depth occlusion.
import { WORLD } from '../config.js';

const FOG_END = WORLD.fogEnd || 42;
const FOCAL_RATIO = WORLD.focalRatio || (1371 / 1920);
const DEPTH_LOG_MAX = Math.log(1 + FOG_END * 0.45);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function depthToNorm(d) {
  return clamp(1 - Math.log(1 + Math.max(0, d) * 0.45) / DEPTH_LOG_MAX, 0, 1);
}

// ---------------------------------------------------------------------------
// 1. Crisp puddle-mask dataCanvas (only draws projected puddle polygons -> ~0.02ms)
// ---------------------------------------------------------------------------
let dataCanvas = null;
let dataCtx = null;
let dataW = 0;
let dataH = 0;
let dataDirty = true;
let dataSnap = null;

let sceneBuf = null;
let sceneBufCtx = null;
let sceneBufW = 0;
let sceneBufH = 0;
let sceneSnap = null;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function beginDataPass(w, h, cam, t, seed) {
  const dw = Math.max(2, Math.round(w * 0.42));
  const dh = Math.max(2, Math.round(h * 0.42));
  const resized = !dataCanvas || dataW !== dw || dataH !== dh;
  if (resized) {
    dataCanvas = makeCanvas(dw, dh);
    dataCtx = dataCanvas.getContext('2d');
    dataW = dw;
    dataH = dh;
    dataSnap = null;
  }

  const s = dataSnap;
  const stationaryReuse = !resized && s &&
    s.seed === seed &&
    Math.abs(cam.x - s.x) < 0.004 &&
    Math.abs(cam.z - s.z) < 0.004 &&
    Math.abs(cam.eye - s.eye) < 0.025 &&
    Math.abs(cam.yaw - s.yaw) < 0.0012 &&
    Math.abs(cam.horizon - s.horizon) < 0.8;

  if (stationaryReuse) {
    dataDirty = false;
    return { canvas: dataCanvas, ctx: null, reused: true };
  }

  const c = dataCtx;
  c.setTransform(dw / w, 0, 0, dh / h, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.clearRect(0, 0, w, h);

  dataDirty = true;
  dataSnap = {
    seed,
    x: cam.x,
    z: cam.z,
    eye: cam.eye,
    yaw: cam.yaw,
    horizon: cam.horizon,
  };
  return { canvas: dataCanvas, ctx: c, reused: false };
}

export function stampPuddleData(dctx, poly) {
  if (!dctx || !poly || poly.length < 3) return;
  let minY = Infinity, maxY = -Infinity, dFar = 42, dNear = 1;
  for (let i = 0; i < poly.length; i++) {
    const pt = poly[i];
    if (pt.y < minY) { minY = pt.y; dFar = pt.d; }
    if (pt.y > maxY) { maxY = pt.y; dNear = pt.d; }
  }
  dctx.beginPath();
  dctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) dctx.lineTo(poly[i].x, poly[i].y);
  dctx.closePath();

  const bFar = Math.round(depthToNorm(dFar) * 255);
  const bNear = Math.round(depthToNorm(dNear) * 255);
  dctx.globalCompositeOperation = 'source-over';
  if (maxY - minY > 2) {
    const grad = dctx.createLinearGradient(0, minY, 0, maxY);
    grad.addColorStop(0, `rgba(128,2,${bFar},0.75)`);
    grad.addColorStop(1, `rgba(128,2,${bNear},0.75)`);
    dctx.fillStyle = grad;
  } else {
    dctx.fillStyle = `rgba(128,2,${Math.round((bFar + bNear) * 0.5)},0.75)`;
  }
  dctx.fill();
}

// ---------------------------------------------------------------------------
// 2. Single-pass GLSL ES 3.00 WebGL2 Compositor (Pure Quiet Water Reflection)
//    Zero added lighting, zero god rays, zero foreground masking hacks.
// ---------------------------------------------------------------------------
const VERT_SRC = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(pos, 0.0, 1.0);
  v_uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
}
`;

const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_scene;
uniform sampler2D u_data;
uniform vec2 u_res;
uniform float u_time;
uniform float u_horizon;
uniform float u_sceneHorizon;
uniform float u_reflShift;
uniform float u_yaw;
uniform vec2 u_camPos;

uniform int u_rippleCount;
uniform vec4 u_ripples[8];

void main() {
  vec4 g = texture(u_data, v_uv);
  float waterMask = smoothstep(0.42, 0.72, g.a);
  if (waterMask <= 0.005) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = u_res.x / max(1.0, u_res.y);
  float bankFade = smoothstep(0.12, 0.92, waterMask);
  float dy = max(0.004, v_uv.y - u_horizon);
  float persp = 1.0 / (dy + 0.045);
  vec2 wPos = vec2(
    (v_uv.x - 0.5) * aspect * persp * 0.46 + u_yaw * 1.15 + u_camPos.x * 0.25,
    persp * 0.28 + u_camPos.y * 0.25
  );

  // Subtle flowing water waves
  float w1 = sin(wPos.x * 3.0 + wPos.y * 5.8 + u_time * 1.25);
  float w2 = cos(wPos.x * 6.9 - wPos.y * 10.2 - u_time * 1.80);
  float w3 = sin(wPos.x * 14.0 + wPos.y * 17.5 + u_time * 2.45);
  vec2 waveN = vec2(
    0.50 * w1 + 0.34 * w2 + 0.16 * w3,
    0.44 * cos(wPos.x * 2.7 + wPos.y * 6.4 + u_time * 1.40) - 0.32 * w2 + 0.14 * w3
  );

  // Real-time expanding footstep & droplet concentric ripples
  float rippleCrest = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= u_rippleCount) break;
    vec4 rp = u_ripples[i];
    float rDy = max(0.018, rp.y - u_horizon);
    float ellY = clamp(rDy * 1.9, 0.16, 0.72);
    vec2 dVec = vec2((v_uv.x - rp.x) * aspect, (v_uv.y - rp.y) / ellY);
    float rDist = length(dVec);
    float maxR = max(0.025, rp.w * aspect);
    float ringR = maxR * (0.08 + rp.z * 0.96);
    float bandW = max(0.016, maxR * 0.25);
    float dr = rDist - ringR;
    float env = exp(-(dr * dr) / (bandW * bandW)) * (1.0 - rp.z) * smoothstep(0.0, 0.04, rp.z);
    float phase = dr / max(0.005, maxR * 0.085) * 6.28318;
    vec2 rDir = dVec / max(0.0006, rDist);
    waveN += rDir * (cos(phase) * env * 2.2);
    rippleCrest += max(0.0, sin(phase)) * env;
  }

  // Horizon-axis vertical mirror reflection + soft wave refraction (reprojected for smooth yaw/pitch)
  float reflY = clamp(u_sceneHorizon - dy * 0.80, 0.008, max(0.012, u_sceneHorizon - 0.003));
  vec2 refr = vec2(waveN.x * 0.012, waveN.y * 0.016) * clamp(dy * 2.2, 0.24, 1.05);
  vec2 reflUV = clamp(
    vec2(v_uv.x + u_reflShift, reflY) + refr,
    vec2(0.003),
    vec2(0.997, max(0.012, u_sceneHorizon + 0.012))
  );
  vec3 reflA = texture(u_scene, reflUV).rgb;
  vec3 reflB = texture(u_scene, clamp(reflUV + vec2(0.002, 0.005), vec2(0.003), vec2(0.997))).rgb;
  vec3 refl = mix(reflA, reflB, 0.30);

  // Premultiplied source-over directly onto mainCanvas's native-Retina 2D wetTile bed (no v_uv read -> zero ghosting)
  float fresnel = mix(0.32, 0.60, pow(1.0 - clamp(dy * 1.85, 0.0, 1.0), 1.45)) * (0.50 + 0.50 * bankFade);
  float waveMod = 0.93 + 0.10 * waveN.y;
  vec3 reflCol = refl * vec3(0.76, 0.87, 0.90) * waveMod;
  vec3 rippleAdd = vec3(0.66, 0.82, 0.85) * rippleCrest * 0.26 * bankFade;

  float bedDark = 0.28 * bankFade;
  float outAlpha = clamp(waterMask * (bedDark + (1.0 - bedDark) * fresnel), 0.0, 1.0);
  vec3 outRGB = clamp(reflCol * (waterMask * fresnel) + rippleAdd * waterMask, 0.0, 1.0);
  outColor = vec4(outRGB, outAlpha);
}
`;

// ---------------------------------------------------------------------------
// 3. WebGL2 Lifecycle & Single-Pass Execution
// ---------------------------------------------------------------------------
let glCanvas = null;
let gl = null;
let prog = null;
let vao = null;
let sceneTex = null;
let dataTex = null;
let sceneTexW = 0, sceneTexH = 0;
let dataTexW = 0, dataTexH = 0;
let loc = null;
let glStatus = 0;

const rippleBuf = new Float32Array(32);

function compileShader(glCtx, type, src) {
  const sh = glCtx.createShader(type);
  glCtx.shaderSource(sh, src);
  glCtx.compileShader(sh);
  if (!glCtx.getShaderParameter(sh, glCtx.COMPILE_STATUS)) {
    const info = glCtx.getShaderInfoLog(sh);
    glCtx.deleteShader(sh);
    throw new Error('GLSL compile failed: ' + info);
  }
  return sh;
}

function makeTexture(glCtx) {
  const tex = glCtx.createTexture();
  glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
  glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
  return tex;
}

function initGL() {
  if (glStatus !== 0) return glStatus === 1;
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
    glStatus = -1;
    return false;
  }
  try {
    glCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(2, 2);
    glCanvas.width = 2;
    glCanvas.height = 2;
    const ctx = glCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!ctx) {
      console.warn('[post-gl] WebGL2 unavailable, falling back to pure 2D.');
      glStatus = -1;
      return false;
    }
    gl = ctx;
    if (glCanvas.addEventListener) {
      glCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        glStatus = -1;
        console.warn('[post-gl] WebGL2 context lost, falling back to pure 2D.');
      });
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('GLSL link failed: ' + gl.getProgramInfoLog(prog));
    }

    vao = gl.createVertexArray();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    sceneTex = makeTexture(gl);
    dataTex = makeTexture(gl);
    sceneTexW = sceneTexH = dataTexW = dataTexH = 0;

    loc = {
      u_scene: gl.getUniformLocation(prog, 'u_scene'),
      u_data: gl.getUniformLocation(prog, 'u_data'),
      u_res: gl.getUniformLocation(prog, 'u_res'),
      u_time: gl.getUniformLocation(prog, 'u_time'),
      u_horizon: gl.getUniformLocation(prog, 'u_horizon'),
      u_sceneHorizon: gl.getUniformLocation(prog, 'u_sceneHorizon'),
      u_reflShift: gl.getUniformLocation(prog, 'u_reflShift'),
      u_yaw: gl.getUniformLocation(prog, 'u_yaw'),
      u_camPos: gl.getUniformLocation(prog, 'u_camPos'),
      u_rippleCount: gl.getUniformLocation(prog, 'u_rippleCount'),
      u_ripples: gl.getUniformLocation(prog, 'u_ripples[0]'),
    };

    gl.useProgram(prog);
    gl.uniform1i(loc.u_scene, 0);
    gl.uniform1i(loc.u_data, 1);

    glStatus = 1;
    return true;
  } catch (err) {
    console.warn('[post-gl] Init failed, falling back to pure 2D:', err);
    glStatus = -1;
    return false;
  }
}

export function isPostGLAvailable() {
  return initGL();
}

function uploadTexture(unit, tex, source, prevW, prevH) {
  const sw = source.width;
  const sh = source.height;
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (sw !== prevW || sh !== prevH) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return [sw, sh];
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return [prevW, prevH];
}

function uploadSceneSnapshot(mainCanvas, sw, sh, params, needsWorld) {
  if (!sceneBuf || sceneBufW !== sw || sceneBufH !== sh) {
    sceneBuf = makeCanvas(sw, sh);
    sceneBufCtx = sceneBuf.getContext('2d', { alpha: false });
    sceneBufCtx.imageSmoothingQuality = 'low';
    sceneBufW = sw;
    sceneBufH = sh;
  }
  sceneBufCtx.drawImage(mainCanvas, 0, 0, sw, sh);
  [sceneTexW, sceneTexH] = uploadTexture(gl.TEXTURE0, sceneTex, sceneBuf, sceneTexW, sceneTexH);
  sceneSnap = {
    t: needsWorld ? -1e9 : (params.time || 0),
    seed: params.seed,
    yaw: params.yaw || 0,
    x: params.camX || 0,
    z: params.camZ || 0,
    horizonUv: params.horizonUv,
    needsWorld,
  };
}

export function applyPostGL(ctx, mainCanvas, dCanvas, params) {
  if (!initGL() || !mainCanvas || !dCanvas || gl.isContextLost()) return false;
  if (!params.hasPuddle) return true;

  const pw = mainCanvas.width;
  const ph = mainCanvas.height;
  if (pw < 2 || ph < 2) return false;

  const gw = Math.max(2, Math.min(pw, Math.round(params.w * 0.42)));
  const gh = Math.max(2, Math.min(ph, Math.round(params.h * 0.42)));
  if (glCanvas.width !== gw || glCanvas.height !== gh) {
    glCanvas.width = gw;
    glCanvas.height = gh;
    sceneSnap = null;
  }

  const t = params.time || 0;
  const sw = Math.max(2, Math.min(pw, Math.round(params.w * 0.36)));
  const sh = Math.max(2, Math.min(ph, Math.round(params.h * 0.36)));
  const ss = sceneSnap;
  const stale = !ss || !sceneBuf || sceneBufW !== sw || sceneBufH !== sh ||
    ss.seed !== params.seed ||
    Math.hypot((params.camX || 0) - ss.x, (params.camZ || 0) - ss.z) > 2.5 ||
    Math.abs(angleDiff(params.yaw || 0, ss.yaw)) > 0.7;

  if (stale) {
    // Cold start or teleport: seed reflection from current horizon/sky on frame 0;
    // captureSceneGL at end of this frame immediately upgrades it to the full tree/monster world.
    uploadSceneSnapshot(mainCanvas, sw, sh, params, true);
  } else {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
  }

  if (dataDirty || dataTexW !== dCanvas.width || dataTexH !== dCanvas.height) {
    [dataTexW, dataTexH] = uploadTexture(gl.TEXTURE1, dataTex, dCanvas, dataTexW, dataTexH);
    dataDirty = false;
  } else {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dataTex);
  }

  const pb = params.puddleBox;
  const pad = 10;
  const bx0 = pb && Number.isFinite(pb[0]) ? clamp(Math.floor(pb[0] - pad), 0, params.w) : 0;
  const by0 = pb && Number.isFinite(pb[1]) ? clamp(Math.floor(pb[1] - pad), 0, params.h) : 0;
  const bx1 = pb && Number.isFinite(pb[2]) ? clamp(Math.ceil(pb[2] + pad), 0, params.w) : params.w;
  const by1 = pb && Number.isFinite(pb[3]) ? clamp(Math.ceil(pb[3] + pad), 0, params.h) : params.h;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  if (bw < 2 || bh < 2) return true;

  const sx = Math.max(0, Math.floor((bx0 / params.w) * gw));
  const sy = Math.max(0, Math.floor((by0 / params.h) * gh));
  const sx1 = Math.min(gw, Math.ceil((bx1 / params.w) * gw));
  const sy1 = Math.min(gh, Math.ceil((by1 / params.h) * gh));
  const scW = Math.max(1, sx1 - sx);
  const scH = Math.max(1, sy1 - sy);

  gl.viewport(0, 0, gw, gh);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(sx, gh - sy1, scW, scH);
  gl.useProgram(prog);
  gl.bindVertexArray(vao);

  const activeSnap = sceneSnap;
  const reflShift = clamp(angleDiff(params.yaw || 0, activeSnap.yaw) * FOCAL_RATIO, -0.35, 0.35);

  gl.uniform2f(loc.u_res, params.w, params.h);
  gl.uniform1f(loc.u_time, t);
  gl.uniform1f(loc.u_horizon, params.horizonUv);
  gl.uniform1f(loc.u_sceneHorizon, activeSnap.horizonUv);
  gl.uniform1f(loc.u_reflShift, reflShift);
  gl.uniform1f(loc.u_yaw, params.yaw || 0);
  gl.uniform2f(loc.u_camPos, params.camX || 0, params.camZ || 0);

  const ripples = params.ripples || [];
  const count = Math.min(8, ripples.length);
  for (let i = 0; i < count; i++) {
    const r = ripples[i];
    const o = i * 4;
    rippleBuf[o] = r[0];
    rippleBuf[o + 1] = r[1];
    rippleBuf[o + 2] = r[2];
    rippleBuf[o + 3] = r[3];
  }
  gl.uniform1i(loc.u_rippleCount, count);
  if (count > 0) gl.uniform4fv(loc.u_ripples, rippleBuf);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.SCISSOR_TEST);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(glCanvas, sx, sy, scW, scH, (sx / gw) * params.w, (sy / gh) * params.h, (scW / gw) * params.w, (scH / gh) * params.h);
  ctx.restore();
  return true;
}

export function captureSceneGL(mainCanvas, params) {
  if (glStatus !== 1 || !mainCanvas || !params.hasPuddle || gl.isContextLost()) return;
  const pw = mainCanvas.width;
  const ph = mainCanvas.height;
  if (pw < 2 || ph < 2) return;

  const t = params.time || 0;
  const sw = Math.max(2, Math.min(pw, Math.round(params.w * 0.36)));
  const sh = Math.max(2, Math.min(ph, Math.round(params.h * 0.36)));
  const ss = sceneSnap;
  const needResize = !sceneBuf || sceneBufW !== sw || sceneBufH !== sh;
  const moving = ss ? (Math.abs(angleDiff(params.yaw || 0, ss.yaw)) > 0.025 || Math.hypot((params.camX || 0) - ss.x, (params.camZ || 0) - ss.z) > 0.12) : true;
  const cadence = moving ? 0.16 : (params.hasActors ? 0.65 : 2.5);
  const needRefresh = needResize || !ss || ss.needsWorld || ss.seed !== params.seed ||
    Math.abs(t - ss.t) > cadence ||
    Math.abs(angleDiff(params.yaw || 0, ss.yaw)) > 0.06 ||
    Math.hypot((params.camX || 0) - ss.x, (params.camZ || 0) - ss.z) > 0.50 ||
    Math.abs(params.horizonUv - ss.horizonUv) > 0.04;

  if (needRefresh) uploadSceneSnapshot(mainCanvas, sw, sh, params, false);
}
