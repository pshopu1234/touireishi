/**
 * <candle-flame> — 闇の中に、エネルギーのある炎がぽっと灯るコンポーネント
 *
 * 使い方:
 *   <script src="candle-flame.js" defer></script>
 *   <candle-flame delay="0.7"></candle-flame>
 *
 * 属性:
 *   delay      点火までの秒数（既定 0.7）
 *   sway       炎の傾き・風の大きさ（既定 1。0で風なし、1.5で強め）
 *   embers     炎のまわりでチラチラ舞う粒の数（既定 130。0で粒なし）
 *   theme      "light" で明るい背景用の色（芯は黄金色、外側は濃い橙）。既定は暗い背景用
 *   sync-page  付けると <html> に --candle-light（0〜1）を毎フレーム書き込む。
 *              文字の明るさなどを炎の揺らぎと同期させたい時に使う。
 *
 * イベント:
 *   ignite  炎がついた瞬間
 *   lit     炎が灯りきった時（文字の表示などのきっかけに）
 *
 * サイズは幅で指定（高さは幅の5/3倍）: candle-flame { width: 120px; }
 * 炎は WebGL のシェーダーで毎フレーム描画（乱流ノイズを上へ流して、揺らめく炎の舌を作る）。
 * WebGL が使えない端末ではやわらかな光だけを表示する。
 * 動きを減らす設定（prefers-reduced-motion）では、粒を止めて炎も静かに灯る。
 */
(() => {
  const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uGrow;   // 炎の大きさ（点火時に 0 → 1）
uniform float uLight;  // まわりの光の強さ
uniform float uSway;   // 風による傾き
uniform float uPower;  // 明るさの揺らぎ
uniform float uTheme;  // 0: 暗い背景用 / 1: 明るい背景用

float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= .5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2((uv.x - .5) * uRes.x / uRes.y, uv.y - .1);   // 根元を原点に
  p /= max(uGrow, .02);
  float t = uTime;
  float h = clamp(p.y, 0., 1.2);

  // 上へ流れる乱流。2段重ねて、炎の舌が裂けたり伸びたりする
  float n1 = fbm(vec2(p.x * 5., p.y * 3. - t * 1.7));
  float n2 = fbm(vec2(p.x * 8. + n1 * 1.8, p.y * 4.5 - t * 2.5) + 3.7);
  float n3 = noise(vec2(p.x * 24., p.y * 12. - t * 5.));
  float ridge = 1. - abs(n2 * 2. - 1.);            // 尾根状のノイズで、光の筋を作る

  // 根元は動かず、上ほど大きく揺れて、舌が左右に舐めるように動く
  float x = p.x - (uSway * .08 * h * h + (n1 - .5) * .15 * h);

  // しずく形の距離場を、乱流で削ったり引き伸ばしたりする
  vec2 q = vec2(x, p.y - .09);
  float k = 8. + 20. * max(q.y, 0.);
  float shape = length(vec2(q.x * k, q.y * (q.y < 0. ? 6.5 : 1.95)));
  shape -= (ridge * .9 + n2 * .5 - .66) * .78 * clamp(q.y * 2.2 + .12, 0., 1.2);
  shape += (n3 - .5) * .07 * clamp(q.y * 3., 0., 1.);
  float c = clamp((1. - shape) * 1.5, 0., 1.);

  // 根元ほど高温（白〜黄）、先端ほど低温（橙）
  float fade = mix(1., .35, smoothstep(0., .55, p.y));
  float core = exp(-length(vec2(x * 16., (p.y - .1) * 4.5)) * 2.2);   // 白熱する芯
  float e = (pow(c, 1.6) * 4.4 + core * c * 3.) * fade * uPower;
  vec2 edge = vec2(smoothstep(.5, .36, abs(uv.x - .5)), smoothstep(1., .82, uv.y) * smoothstep(0., .1, uv.y));
  e *= edge.x * edge.y;

  // 炎のまわりのもや（キャンバスの端では消す）
  float haze = exp(-length(vec2(x * 5., (p.y - .14) * 2.2)) * 3.) * .2 * uLight * edge.x * edge.y;

  if (uTheme > .5) {
    // 明るい背景用：白く飛ばさず、濃い橙 → 黄金色 → 淡い黄色の順に重ねる
    float d = 1. - exp(-e * .5);
    vec3 rgb = mix(vec3(1., .5, .14), vec3(1., .6, .12), smoothstep(0., .45, d));
    rgb = mix(rgb, vec3(1., .78, .28), smoothstep(.45, .8, d));
    rgb = mix(rgb, vec3(1., .87, .48), smoothstep(.8, 1., d));
    float fa = smoothstep(0., .8, d);
    float ha = haze * .7;
    gl_FragColor = vec4(rgb * fa + vec3(1., .55, .2) * ha * (1. - fa), fa + ha * (1. - fa));
    return;
  }

  // 黒体放射っぽい色：弱い所は赤橙、強い所は黄色を経て白へ
  vec3 col = 1. - exp(-e * vec3(1.9, .85, .2));
  col += vec3(1., .42, .1) * haze;

  float a = clamp(max(col.r, max(col.g, col.b)), 0., 1.);
  gl_FragColor = vec4(min(col, vec3(a)), a);
}`;

  const TEMPLATE = `
<style>
  :host { position: relative; display: inline-block; width: 120px; aspect-ratio: 3 / 5; pointer-events: none; }
  .halo, .glow { position: absolute; left: 50%; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%); opacity: 0; will-change: opacity, transform; }
  /* 部屋全体にじんわり広がる光 */
  .halo { top: 60%; width: 900%; background: radial-gradient(closest-side, rgba(255,140,60,.2), rgba(255,120,45,.09) 30%, rgba(255,110,40,.03) 60%, rgba(255,110,40,0)); }
  /* 炎のすぐまわりの強い光 */
  .glow { top: 68%; width: 170%; background: radial-gradient(closest-side, rgba(255,190,110,.4), rgba(255,140,60,.15) 45%, rgba(255,120,50,0)); }
  canvas { position: absolute; display: block; }
  .fire { inset: 0; width: 100%; height: 100%; opacity: 0; }
  .embers { left: -150%; top: -120%; width: 400%; height: 240%; }
  :host([theme="light"]) .fire { z-index: 1; }   /* 明るい背景では粒を炎の奥に回す */
  :host([theme="light"]) .halo { background: radial-gradient(closest-side, rgba(255,150,70,.15), rgba(255,140,60,.065) 32%, rgba(255,130,50,.02) 62%, rgba(255,130,50,0)); }
  :host([theme="light"]) .glow { background: radial-gradient(closest-side, rgba(255,175,90,.32), rgba(255,140,60,.12) 45%, rgba(255,120,50,0)); }
  .fallback {
    display: none; position: absolute; left: 50%; bottom: 10%; width: 22%; height: 50%; transform: translateX(-50%); opacity: 0;
    border-radius: 50% 50% 45% 45% / 70% 70% 30% 30%; filter: blur(3px);
    background: radial-gradient(ellipse at 50% 80%, #fff8e0, #ffc060 35%, rgba(255,120,40,.6) 60%, transparent 75%);
  }
</style>
<div class="halo"></div>
<div class="glow"></div>
<canvas class="fire"></canvas>
<div class="fallback"></div>
<canvas class="embers"></canvas>`;

  const clamp01 = x => Math.max(0, Math.min(1, x));
  const outCubic = x => 1 - Math.pow(1 - x, 3);
  const inOut = x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // なめらかな1次元ノイズ（-1〜1）。風や明るさのゆらぎに使う
  function makeNoise(seed) {
    let s = seed % 2147483647 || 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const p = Array.from({ length: 256 }, () => rnd() * 2 - 1);
    return x => {
      const i = Math.floor(x), t = x - i, u = t * t * (3 - 2 * t);
      const a = p[i & 255], b = p[(i + 1) & 255];
      return a + (b - a) * u;
    };
  }

  class CandleFlame extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
      const $ = s => this.shadowRoot.querySelector(s);
      this.$fire = $('.fire'); this.$embers = $('.embers'); this.$fallback = $('.fallback');
      this.$halo = $('.halo'); this.$glow = $('.glow');
      this.noise = makeNoise(Math.floor(Math.random() * 1e6) + 1);
      this.raf = 0;
      this.visible = true;
      this.frame = this.frame.bind(this);
      this.onVis = () => this.resume();
      this.$fire.addEventListener('webglcontextlost', ev => { ev.preventDefault(); this.gl = null; });
      this.$fire.addEventListener('webglcontextrestored', () => this.initGL());
    }

    connectedCallback() {
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.delay = parseFloat(this.getAttribute('delay') ?? '.7');
      this.swayAmt = parseFloat(this.getAttribute('sway') ?? '1');
      this.emberCount = this.reduce ? 0 : parseInt(this.getAttribute('embers') ?? '130', 10);
      this.syncPage = this.hasAttribute('sync-page');
      this.lightTheme = this.getAttribute('theme') === 'light';
      this.start = 0;                                   // 最初に画面に映った時から数える
      this.ignited = this.isLit = this.done = false;
      this.gust = { at: 4 + Math.random() * 4, amp: 0, t0: 0 };
      this.particles = [];

      if (!this.gl && !this.initGL()) this.$fallback.style.display = 'block';
      this.ectx = this.$embers.getContext('2d');

      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this);
      this.resize();
      this.io = new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; this.resume(); });
      this.io.observe(this);
      document.addEventListener('visibilitychange', this.onVis);
      this.resume();
    }

    disconnectedCallback() {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.ro?.disconnect();
      this.io?.disconnect();
      document.removeEventListener('visibilitychange', this.onVis);
    }

    initGL() {
      const gl = this.$fire.getContext('webgl', { premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
      if (!gl) return false;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {};
      for (const n of ['uRes', 'uTime', 'uGrow', 'uLight', 'uSway', 'uPower', 'uTheme']) this.u[n] = gl.getUniformLocation(prog, n);
      this.gl = gl;
      return true;
    }

    resize() {
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      this.W = this.clientWidth;
      this.H = this.clientHeight;
      this.$fire.width = Math.round(this.W * this.dpr);
      this.$fire.height = Math.round(this.H * this.dpr);
      this.$embers.width = Math.round(this.W * 4 * this.dpr);
      this.$embers.height = Math.round(this.H * 2.4 * this.dpr);
    }

    // 画面外・別タブの間は止めて電池を節約する
    resume() {
      if (!this.raf && !this.done && this.visible && !document.hidden) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.frame);
      }
    }

    // --- チラチラ舞う粒 ---------------------------------------------
    // spark: 炎から立ちのぼる火の粉 / glint: 炎のまわりで瞬く光の粒
    spawn(burst) {
      const H = this.H, r = Math.random;
      const spark = burst || r() < .45;
      const p = spark
        ? {
            spark: true,
            x: (r() - .5) * .14 * H,
            y: -(.1 + r() * .35) * H,
            vx: (r() - .5) * .1 * H * (burst ? 3.5 : 1),
            vy: -(.1 + r() * .26) * H * (burst ? 1.9 : 1),
            life: (burst ? .7 : 1.6) + r() * 2.4,
            size: .6 + r() * 1.3,
            a: .6 + r() * .4,
            tw: 7 + r() * 16
          }
        : {
            spark: false,
            x: (r() - .5) * 2 * Math.pow(r(), 1.4) * 1.05 * H,
            y: -(.05 + Math.pow(r(), 1.2) * 1.1) * H,
            vx: (r() - .5) * .03 * H,
            vy: -(.015 + r() * .06) * H,
            life: 1.8 + r() * 3.2,
            size: .45 + r() * 1,
            a: .35 + r() * .6,
            tw: 3 + r() * 10
          };
      p.age = burst ? 0 : -r() * p.life;     // 少しずつ現れるように開始を散らす
      p.wob = 1.5 + r() * 3;
      p.wobA = (.02 + r() * .05) * H;
      p.ph = r() * 6.283;
      return p;
    }

    drawEmbers(dt, light, sway) {
      const ctx = this.ectx, d = this.dpr, H = this.H;
      const cw = this.W * 4, ch = H * 2.4;
      const bx = cw / 2, by = H * 2.1;             // 炎の根元
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      if (!this.emberCount || light <= 0) return;
      ctx.globalCompositeOperation = this.lightTheme ? 'source-over' : 'lighter';
      while (this.particles.length < this.emberCount) this.particles.push(this.spawn(false));

      for (let i = 0; i < this.particles.length; i++) {
        let p = this.particles[i];
        p.age += dt;
        if (p.age > p.life) {
          if (i >= this.emberCount) { this.particles.splice(i--, 1); continue; }   // 点火時の火の粉は使い切り
          p = this.particles[i] = this.spawn(false);
          p.age = 0;
        }
        if (p.age < 0) continue;
        p.x += (p.vx + sway * .05 * H + Math.cos(p.age * p.wob + p.ph) * p.wobA) * dt;
        p.y += p.vy * dt;
        if (p.spark) p.vy *= 1 - .35 * dt;

        const k = p.age / p.life;
        const fade = Math.min(1, p.age / .2) * Math.pow(1 - k, 1.3);
        const twinkle = .25 + .75 * (.5 + .5 * Math.sin(p.age * p.tw + p.ph)) * (.5 + .5 * Math.sin(p.age * p.tw * 1.73 + p.ph * 2));
        const alpha = Math.min(1, p.a * fade * twinkle * light * (this.lightTheme ? 1.3 : 1));
        if (alpha < .01) continue;

        // 火の粉は熱い黄色から橙へ冷めていく（明るい背景では濃いめの色で）
        const L = this.lightTheme;
        const rr = L ? 240 : 255;
        const g = p.spark ? Math.round((L ? 165 : 225) - k * (L ? 50 : 110)) : (L ? 170 : 200);
        const b = p.spark ? Math.round((L ? 70 : 150) - k * (L ? 30 : 110)) : (L ? 95 : 140);
        const x = bx + p.x, y = by + p.y;
        ctx.fillStyle = `rgba(${rr},${g},${b},${(alpha * (L ? .12 : .16)).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, p.size * 3.2, 0, 6.283); ctx.fill();
        ctx.fillStyle = `rgba(${rr},${Math.min(255, g + 25)},${Math.min(255, b + 40)},${alpha.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, 6.283); ctx.fill();
      }
    }

    // --- 毎フレームの処理 --------------------------------------------
    frame(now) {
      this.raf = 0;
      if (!this.start) this.start = this.last = now;
      const dt = Math.min(.05, (now - this.last) / 1000);
      this.last = now;
      const t = (now - this.start) / 1000;
      const e = t - this.delay;

      // 点火：小さな火種がぽっと現れ、すっと伸びて落ち着く
      let g, light, pop = 0;
      if (e <= 0) { g = 0; light = 0; }
      else if (this.reduce) { g = 1; light = outCubic(clamp01(e)); }
      else {
        if (e < .07) g = .3 * outCubic(e / .07);
        else if (e < .4) g = .3 + .78 * outCubic((e - .07) / .33);
        else if (e < 1.2) g = 1.08 - .08 * inOut((e - .4) / .8);
        else g = 1;
        light = .85 * outCubic(clamp01(e / .3)) + .15 * outCubic(clamp01(e / 1.8));
        pop = Math.exp(-e * 5);                        // ついた瞬間の、ぽっという明るさ
      }

      if (e > 0 && !this.ignited) {
        this.ignited = true;
        if (this.emberCount) for (let i = 0; i < 12; i++) this.particles.push(this.spawn(true));
        this.dispatchEvent(new Event('ignite', { bubbles: true }));
      }
      if (e > .55 && !this.isLit) { this.isLit = true; this.dispatchEvent(new Event('lit', { bubbles: true })); }

      // 風と明るさのゆらぎ（炎の形の乱れはシェーダー側で作る）
      const amp = this.reduce ? 0 : this.swayAmt * clamp01((e - .2) / 1.2);
      const n = this.noise;
      const n1 = n(t * .4), n2 = n(t * 1.1 + 50), n3 = n(t * 4 + 120), n4 = n(t * 7 + 300);
      let gust = 0;
      if (amp) {
        const G = this.gust;
        if (t > G.at) { G.t0 = t; G.amp = (Math.random() < .5 ? -1 : 1) * (.4 + Math.random() * .6); G.at = t + 7 + Math.random() * 8; }
        const dt2 = t - G.t0;
        if (G.amp) gust = G.amp * Math.exp(-dt2 * 1.2) * Math.sin(dt2 * 4.5);
      }
      const sway = (n1 * .7 + n2 * .3 + gust) * amp;
      const power = (1 + (n3 * .035 + n4 * .015 + n2 * .03) * (this.reduce ? 0 : 1)) * (1 + pop * .6);

      // 炎
      if (this.gl && this.W) {
        const gl = this.gl, u = this.u;
        gl.viewport(0, 0, this.$fire.width, this.$fire.height);
        gl.uniform2f(u.uRes, this.$fire.width, this.$fire.height);
        gl.uniform1f(u.uTime, this.reduce ? 3 : t % 600);
        gl.uniform1f(u.uGrow, g);
        gl.uniform1f(u.uLight, light);
        gl.uniform1f(u.uSway, sway);
        gl.uniform1f(u.uPower, power);
        gl.uniform1f(u.uTheme, this.lightTheme ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      const shown = clamp01(e / .05).toFixed(3);
      this.$fire.style.opacity = shown;
      this.$fallback.style.opacity = shown;

      // まわりの光
      this.$glow.style.opacity = (light * power).toFixed(3);
      this.$glow.style.transform = `translate(-50%, -50%) scale(${((.85 + .15 * Math.min(g, 1.08)) * (1 + (power - 1) * .5)).toFixed(3)})`;
      this.$halo.style.opacity = (light * (.9 + (power - 1) * 1.2)).toFixed(3);

      // 粒
      if (this.W) this.drawEmbers(dt, light, sway);

      const level = clamp01(light * power).toFixed(3);
      this.style.setProperty('--candle-light', level);
      if (this.syncPage) document.documentElement.style.setProperty('--candle-light', level);

      // 動きを減らす設定なら、灯りきった時点で止める
      if (this.reduce && light >= 1) { this.done = true; return; }
      if (this.visible && !document.hidden) this.raf = requestAnimationFrame(this.frame);
    }
  }

  if (!customElements.get('candle-flame')) customElements.define('candle-flame', CandleFlame);
})();
