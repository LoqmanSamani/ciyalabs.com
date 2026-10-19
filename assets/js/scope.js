/*
  Ciya Labs - research scope
  One canvas, four live visuals:
    0 Ciya Labs     the mark and the name sampled out of Gaussian noise (reverse diffusion)
    1 BioDreamer    imagined rollouts over a 3D learned energy landscape, then the chosen plan
    2 HydraTrade    cross-sectional rank flow (bump chart) over a market-neutral equity curve
    3 Theseus       a 3D donor network scanned plane by plane and rebuilt as a copy
  Exposes window.CiyaScope = { init, set, setActive, caption }.
*/

(function() {
    'use strict';

    var CY = '63,214,230';
    var RD = '217,71,58';
    var SV = '228,234,240';
    var CYv = [63, 214, 230];
    var RDv = [217, 71, 58];
    var SVv = [228, 234, 240];
    var BG = [6, 12, 20];
    var FONT = '"JetBrains Mono", ui-monospace, monospace';

    var canvas, ctx, hooks;
    var W = 0, H = 0, DPR = 1;
    var mode = 0;
    var active = false;
    var raf = 0;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    var state = null;
    var lastData = '';

    function rgba(c, a) {
        return 'rgba(' + c + ',' + a + ')';
    }

    function mix(p, q, f, a) {
        return 'rgba(' + Math.round(p[0] + (q[0] - p[0]) * f) + ',' + Math.round(p[1] + (q[1] - p[1]) * f) + ',' +
            Math.round(p[2] + (q[2] - p[2]) * f) + ',' + a + ')';
    }

    function clamp(v, a, b) {
        return Math.min(b, Math.max(a, v));
    }

    function smooth(u) {
        u = clamp(u, 0, 1);
        return u * u * (3 - 2 * u);
    }

    function pad(n, w) {
        var s = String(n);
        while (s.length < w) {
            s = '0' + s;
        }
        return s;
    }

    function gauss() {
        var u = 1 - Math.random(),
            v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function report(cap, data) {
        if (hooks && data !== lastData) {
            lastData = data;
            hooks.onData(cap, data);
        }
    }

    function grid() {
        ctx.strokeStyle = rgba(SV, 0.03);
        ctx.lineWidth = 1;
        var step = 60, x, y;
        ctx.beginPath();
        for (x = step; x < W; x += step) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, H);
        }
        for (y = step; y < H; y += step) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(W, y + 0.5);
        }
        ctx.stroke();
    }

    function clear() {
        ctx.fillStyle = 'rgb(' + BG.join(',') + ')';
        ctx.fillRect(0, 0, W, H);
    }

    function label(text, x, y, color, align, size) {
        ctx.font = '500 ' + (size || 10) + 'px ' + FONT;
        ctx.fillStyle = color;
        var w = ctx.measureText(text).width;
        ctx.fillText(text, align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y);
    }

    /* the drawing area left free by the chip (top) and the readout (bottom) */
    function area() {
        return {
            top: 140,
            bottom: H - 150
        };
    }

    /* ---------------------------------------------------------- */
    /* 0 // CIYA LABS - the mark and the name out of noise          */
    /* ---------------------------------------------------------- */

    /* the logo's own geometry (logo/tools/build_kit.py) */
    var MARK = [
        [33.4, 45.14],
        [58, 6],
        [102, 76],
        [0, 76],
        [26.4, 34],
        [52.8, 76]
    ];

    function sampleMark(n, ox, oy, sc, stroke) {
        var segs = [],
            total = 0,
            pts = [],
            i;
        for (i = 0; i < MARK.length - 1; i++) {
            var l = Math.hypot(MARK[i + 1][0] - MARK[i][0], MARK[i + 1][1] - MARK[i][1]);
            segs.push(l);
            total += l;
        }
        for (i = 0; i < n; i++) {
            var d = (i + Math.random()) / n * total,
                s = 0;
            while (s < segs.length - 1 && d > segs[s]) {
                d -= segs[s];
                s++;
            }
            var f = d / segs[s],
                ax = MARK[s][0],
                ay = MARK[s][1],
                bx = MARK[s + 1][0],
                by = MARK[s + 1][1];
            var nx = -(by - ay) / segs[s],
                ny = (bx - ax) / segs[s],
                off = (Math.random() - 0.5) * stroke;
            pts.push([ox + (ax + (bx - ax) * f) * sc + nx * off, oy + (ay + (by - ay) * f) * sc + ny * off]);
        }
        return pts;
    }

    function sampleText(text, n, cx, baseline, size) {
        var off = document.createElement('canvas');
        off.width = Math.max(1, Math.ceil(W));
        off.height = Math.max(1, Math.ceil(size * 1.6));
        var o = off.getContext('2d');
        o.font = '700 ' + size + 'px ' + FONT;
        if ('letterSpacing' in o) {
            o.letterSpacing = Math.round(size * 0.22) + 'px';
        }
        o.textBaseline = 'alphabetic';
        o.fillStyle = '#fff';
        var w = o.measureText(text).width;
        o.fillText(text, cx - w / 2, size * 1.2);
        var img = o.getImageData(0, 0, off.width, off.height).data,
            cand = [],
            step = Math.max(1, Math.round(size / 26)),
            x, y;
        for (y = 0; y < off.height; y += step) {
            for (x = 0; x < off.width; x += step) {
                if (img[(y * off.width + x) * 4 + 3] > 140) {
                    cand.push([x, y - size * 1.2 + baseline]);
                }
            }
        }
        var pts = [];
        for (var i = 0; i < n && cand.length; i++) {
            var c = cand[Math.floor(Math.random() * cand.length)];
            pts.push([c[0] + (Math.random() - 0.5) * step * 0.8, c[1] + (Math.random() - 0.5) * step * 0.8]);
        }
        return pts;
    }

    var lab = {
        cap: 'REVERSE DIFFUSION // NOISE TO STRUCTURE',
        start: function() {
            var A = area(),
                mid = (A.top + A.bottom) / 2;
            var markW = Math.min(W * 0.42, (A.bottom - A.top) * 0.62 * 102 / 70);
            var sc = markW / 102,
                markH = 70 * sc,
                fs = Math.max(16, Math.round(markW * 0.17)),
                gap = fs * 1.15,
                blockH = markH + gap + fs;
            var top = mid - blockH / 2;
            var ox = W / 2 - 51 * sc,
                oy = top - 6 * sc;
            var dense = clamp(W * H / 520000, 0.45, 1);
            var mk = sampleMark(Math.round(1700 * dense), ox, oy, sc, 4.6 * sc * 1.1);
            var base = top + markH + gap + fs * 0.78;
            var tx = sampleText('CIYA LABS', Math.round(2600 * dense), W / 2, base, fs);
            var parts = [];
            mk.forEach(function(p) {
                parts.push({ x0: p[0], y0: p[1], kind: 0 });
            });
            tx.forEach(function(p) {
                parts.push({ x0: p[0], y0: p[1], kind: 1 });
            });
            parts.forEach(function(p) {
                p.d = Math.random() * 0.3;
                p.ph = Math.random() * Math.PI * 2;
            });
            state = {
                parts: parts,
                cx: W / 2,
                cy: mid,
                sig: Math.min(W, H) * 0.34,
                t0: performance.now(),
                cycle: -1,
                poly: { ox: ox, oy: oy, sc: sc },
                text: { base: base, fs: fs }
            };
            this.noise();
        },
        noise: function() {
            state.parts.forEach(function(p) {
                p.ex = gauss();
                p.ey = gauss();
            });
        },
        /* position of a particle at diffusion time t (1 = pure noise, 0 = data);
           the noise term rotates as it shrinks, so samples spiral in rather than slide */
        pos: function(p, t) {
            var st = state;
            var abar = Math.pow(Math.cos((t + 0.008) / 1.008 * Math.PI / 2), 2);
            var a = Math.sqrt(abar),
                b = Math.sqrt(1 - abar);
            var th = 1.7 * b,
                c = Math.cos(th),
                s = Math.sin(th);
            var nx = (p.ex * c - p.ey * s) * st.sig,
                ny = (p.ex * s + p.ey * c) * st.sig;
            return [st.cx + a * (p.x0 - st.cx) + b * nx, st.cy + a * (p.y0 - st.cy) + b * ny, a];
        },
        frame: function(now) {
            var st = state,
                self = this;
            var L = 11;
            var raw = reduce.matches ? 6.5 : (now - st.t0) / 1000;
            var cyc = Math.floor(raw / L),
                T = raw - cyc * L;
            if (cyc !== st.cycle) {
                if (st.cycle >= 0) {
                    this.noise();
                }
                st.cycle = cyc;
            }
            /* 0-5.2 s denoise, 5.2-9 s hold, 9-11 s forward noising */
            var gOf = function(t) {
                if (t < 5.2) {
                    return Math.max(0, t) / 5.2;
                }
                return t < 9 ? 1.3 : 1.3 - (t - 9) / 2 * 1.3;
            };
            var g = gOf(T),
                gp = gOf(T - 0.08);
            grid();
            var hold = T >= 5.2 && T < 9;
            var shimmer = hold && !reduce.matches;
            var meanT = 0;
            /* particles are batched into a few colour buckets: one path per bucket */
            var NB = 8,
                paths = [],
                k;
            for (k = 0; k < NB * 2; k++) {
                paths.push([]);
            }
            st.parts.forEach(function(p) {
                var t = 1 - smooth((g - p.d) / 0.92),
                    tp = 1 - smooth((gp - p.d) / 0.92);
                meanT += t;
                /* the streak is where the sample was 80 ms ago: it vanishes once the sample settles */
                var q = self.pos(p, t),
                    r = self.pos(p, tp);
                var x = q[0],
                    y = q[1];
                if (shimmer) {
                    x += Math.sin(now * 0.0016 + p.ph) * 0.4;
                    y += Math.cos(now * 0.0013 + p.ph) * 0.4;
                }
                var lv = Math.min(NB - 1, Math.floor(q[2] * NB));
                paths[p.kind * NB + lv].push(r[0], r[1], x + 0.01, y);
            });
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            for (k = 0; k < NB * 2; k++) {
                var arr = paths[k];
                if (!arr.length) {
                    continue;
                }
                var kind = k >= NB ? 1 : 0,
                    a = (k % NB + 0.5) / NB,
                    f = clamp((a - 0.55) / 0.45, 0, 1);
                ctx.strokeStyle = kind === 0 ? mix(CYv, RDv, f, (0.2 + 0.65 * a).toFixed(3)) :
                    mix(CYv, SVv, f, (0.16 + 0.6 * a).toFixed(3));
                ctx.lineWidth = kind === 0 ? 1.1 + 1.1 * a : 0.9 + 0.8 * a;
                ctx.beginPath();
                for (var i = 0; i < arr.length; i += 4) {
                    ctx.moveTo(arr[i], arr[i + 1]);
                    ctx.lineTo(arr[i + 2], arr[i + 3]);
                }
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
            meanT /= st.parts.length || 1;
            /* once sampled, the exact mark settles in underneath the particles */
            var settle = smooth((1 - meanT - 0.9) / 0.1);
            if (settle > 0) {
                var P = st.poly;
                ctx.strokeStyle = rgba(RD, 0.45 * settle);
                ctx.lineWidth = 4.6 * P.sc * 0.8;
                ctx.lineJoin = 'miter';
                ctx.beginPath();
                MARK.forEach(function(m, i) {
                    var X = P.ox + m[0] * P.sc,
                        Y = P.oy + m[1] * P.sc;
                    if (i === 0) {
                        ctx.moveTo(X, Y);
                    } else {
                        ctx.lineTo(X, Y);
                    }
                });
                ctx.stroke();
                var Tx = st.text;
                ctx.font = '700 ' + Tx.fs + 'px ' + FONT;
                if ('letterSpacing' in ctx) {
                    ctx.letterSpacing = Math.round(Tx.fs * 0.22) + 'px';
                }
                ctx.fillStyle = rgba(SV, 0.5 * settle);
                var tw = ctx.measureText('CIYA LABS').width;
                ctx.fillText('CIYA LABS', W / 2 - tw / 2, Tx.base);
                if ('letterSpacing' in ctx) {
                    ctx.letterSpacing = '0px';
                }
            }
            var step = Math.round(meanT * 1000);
            report(this.cap, hold ? 'SAMPLE COMPLETE // STEP 0000 / 1000' : 'STEP ' + pad(step, 4) + ' / 1000');
        }
    };

    /* ---------------------------------------------------------- */
    /* 1 // BIODREAMER - planning over a learned 3D landscape       */
    /* ---------------------------------------------------------- */

    var WELLS = [
        [0.70, 0.66, 0.13, 1.15], /* goal: deepest basin */
        [0.26, 0.38, 0.11, 0.70],
        [0.36, 0.78, 0.09, 0.55],
        [0.76, 0.28, 0.10, 0.62],
        [0.52, 0.52, 0.20, 0.30]
    ];

    function field(x, y) {
        var f = 0.09 * Math.sin(7 * x + 2) * Math.cos(6 * y - 1) + 0.04 * Math.sin(17 * x * y),
            i, w, dx, dy;
        for (i = 0; i < WELLS.length; i++) {
            w = WELLS[i];
            dx = x - w[0];
            dy = y - w[1];
            f -= w[3] * Math.exp(-(dx * dx + dy * dy) / (2 * w[2] * w[2]));
        }
        return f;
    }

    function gradF(x, y) {
        var e = 0.002;
        return [(field(x + e, y) - field(x - e, y)) / (2 * e), (field(x, y + e) - field(x, y - e)) / (2 * e)];
    }

    /* noisy descent with momentum plus a goal-seeking drift of varying strength (the policy);
       exploration noise anneals over the horizon */
    function rollout(x, y, noise, drive) {
        var pts = [[x, y]],
            vx = 0,
            vy = 0,
            gx = WELLS[0][0],
            gy = WELLS[0][1],
            s, g, n, temp, dx, dy, dn;
        for (s = 0; s < 52; s++) {
            g = gradF(x, y);
            n = Math.hypot(g[0], g[1]) + 0.6;
            temp = noise * (1 - s / 52);
            dx = gx - x;
            dy = gy - y;
            dn = Math.hypot(dx, dy) + 0.05;
            vx = 0.78 * vx - 0.008 * g[0] / n + drive * 0.0052 * dx / dn + temp * gauss() * 0.0045;
            vy = 0.78 * vy - 0.008 * g[1] / n + drive * 0.0052 * dy / dn + temp * gauss() * 0.0045;
            x = clamp(x + vx, 0.04, 0.96);
            y = clamp(y + vy, 0.04, 0.96);
            pts.push([x, y]);
        }
        return pts;
    }

    var bio = {
        cap: 'IMAGINED ROLLOUTS // LEARNED ENERGY LANDSCAPE',
        NR: 7,
        start: function() {
            var NX = 72,
                NY = 34,
                z = [],
                lo = 1e9,
                hi = -1e9,
                i, j, v;
            for (j = 0; j < NY; j++) {
                var row = [];
                for (i = 0; i < NX; i++) {
                    v = field(i / (NX - 1), j / (NY - 1));
                    row.push(v);
                    lo = Math.min(lo, v);
                    hi = Math.max(hi, v);
                }
                z.push(row);
            }
            state = { z: z, NX: NX, NY: NY, lo: lo, hi: hi };
            this.episode();
        },
        episode: function() {
            var st = state;
            var sx = 0.08 + Math.random() * 0.22,
                sy = 0.10 + Math.random() * 0.2;
            if (Math.random() < 0.5) {
                sx = 1 - sx;
            }
            st.paths = [];
            for (var r = 0; r < this.NR; r++) {
                st.paths.push(rollout(sx, sy, 0.6 + Math.random() * 1.3, 0.2 + r / (this.NR - 1) * 1.5));
            }
            st.score = st.paths.map(function(p) {
                var e = p[p.length - 1];
                return field(e[0], e[1]);
            });
            st.best = st.score.indexOf(Math.min.apply(null, st.score));
            st.t0 = performance.now();
        },
        /* world (x, y in [0,1], z = energy) to screen, with a slowly swaying camera */
        proj: function(x, y, z) {
            var st = state;
            var u = x - 0.5,
                v = 0.5 - y;
            var ur = u * st.cy - v * st.sy,
                vr = u * st.sy + v * st.cy;
            var k = st.S / (2.3 + vr * 1.5);
            return [W / 2 + ur * k * 1.5, st.mid - (vr * 0.95 + (z - st.zc) * st.amp) * k, vr];
        },
        frame: function(now) {
            var st = state,
                self = this;
            var t = reduce.matches ? 99 : (now - st.t0) / 1000;
            var yaw = reduce.matches ? 0.2 : 0.32 * Math.sin(now / 7000);
            var A = area();
            st.cy = Math.cos(yaw);
            st.sy = Math.sin(yaw);
            st.S = Math.min(W * 1.2, (A.bottom - A.top) * 1.75);
            st.mid = (A.top + A.bottom) / 2 + 10;
            st.zc = (st.lo + st.hi) / 2;
            st.amp = 0.3;
            var NX = st.NX,
                NY = st.NY,
                i, j;
            /* ridgelines, far to near; each row hides what lies behind it */
            for (j = 0; j < NY; j++) {
                var y = j / (NY - 1),
                    pts = [];
                for (i = 0; i < NX; i++) {
                    pts.push(self.proj(i / (NX - 1), y, st.z[j][i]));
                }
                var near = j / (NY - 1);
                ctx.fillStyle = 'rgb(' + BG.join(',') + ')';
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (i = 1; i < NX; i++) {
                    ctx.lineTo(pts[i][0], pts[i][1]);
                }
                ctx.lineTo(pts[NX - 1][0], H);
                ctx.lineTo(pts[0][0], H);
                ctx.closePath();
                ctx.fill();
                ctx.lineWidth = 1;
                for (i = 1; i < NX; i++) {
                    var depth = 1 - ((st.z[j][i] + st.z[j][i - 1]) / 2 - st.lo) / (st.hi - st.lo);
                    var a = (0.1 + 0.5 * near) * (0.35 + 0.65 * Math.pow(depth, 1.4));
                    ctx.strokeStyle = mix(SVv, CYv, smooth(depth * 1.3), a.toFixed(3));
                    ctx.beginPath();
                    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
                    ctx.lineTo(pts[i][0], pts[i][1]);
                    ctx.stroke();
                }
            }
            var n = st.paths[0].length - 1;
            var drawPath = function(p, upto, color, width, dash) {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.setLineDash(dash || []);
                ctx.beginPath();
                for (var k = 0; k <= upto && k < p.length; k++) {
                    var q = self.proj(p[k][0], p[k][1], field(p[k][0], p[k][1]) + 0.03);
                    if (k === 0) {
                        ctx.moveTo(q[0], q[1]);
                    } else {
                        ctx.lineTo(q[0], q[1]);
                    }
                }
                ctx.stroke();
                ctx.setLineDash([]);
            };
            /* phase 1: imagine; phase 2: commit to the best plan and act */
            var grow = clamp(t / 2.2, 0, 1),
                act = clamp((t - 2.6) / 2.6, 0, 1),
                step = Math.floor(act * n),
                committed = t >= 2.6;
            st.paths.forEach(function(p, k) {
                if (!committed || k !== st.best) {
                    drawPath(p, Math.floor(grow * n), rgba(SV, committed ? 0.12 : 0.32), 1, [3, 4]);
                }
            });
            if (committed) {
                drawPath(st.paths[st.best], n, rgba(CY, 0.3), 1.2, [2, 3]);
                drawPath(st.paths[st.best], step, rgba(CY, 0.95), 2.2);
            }
            /* goal beacon */
            var gl = WELLS[0],
                G = self.proj(gl[0], gl[1], field(gl[0], gl[1]));
            var pulse = reduce.matches ? 0 : (now / 1000) % 2 / 2;
            ctx.strokeStyle = rgba(RD, 0.55);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(G[0] + 0.5, G[1]);
            ctx.lineTo(G[0] + 0.5, G[1] - 46);
            ctx.stroke();
            ctx.strokeStyle = rgba(RD, 0.9);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(G[0], G[1], 9, 4, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = rgba(RD, 0.5 * (1 - pulse));
            ctx.beginPath();
            ctx.ellipse(G[0], G[1], 9 + 24 * pulse, 4 + 10 * pulse, 0, 0, Math.PI * 2);
            ctx.stroke();
            label('TARGET', G[0] + 6, G[1] - 40, rgba(RD, 0.9));
            /* agent */
            var ap = st.paths[st.best][committed ? step : 0],
                Ap = self.proj(ap[0], ap[1], field(ap[0], ap[1]) + 0.03);
            ctx.fillStyle = rgba(CY, 1);
            ctx.beginPath();
            ctx.arc(Ap[0], Ap[1], 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = rgba(CY, 0.35);
            ctx.beginPath();
            ctx.arc(Ap[0], Ap[1], 9, 0, Math.PI * 2);
            ctx.stroke();
            /* inset: predicted end energy of each imagined rollout (lower is better) */
            if (W >= 520) {
                var bw = 150,
                    bx = W - 28 - bw,
                    by = 84,
                    rh = 11;
                ctx.fillStyle = 'rgba(3,7,12,0.72)';
                ctx.fillRect(bx - 12, by - 6, bw + 24, 30 + this.NR * rh + 6);
                ctx.strokeStyle = rgba(SV, 0.1);
                ctx.strokeRect(bx - 12 + 0.5, by - 6 + 0.5, bw + 24, 30 + this.NR * rh + 6);
                label('PREDICTED ENERGY', bx, by + 10, rgba(SV, 0.5), 'left', 9);
                var smin = Math.min.apply(null, st.score),
                    smax = Math.max.apply(null, st.score) + 0.05;
                st.score.forEach(function(s, k) {
                    var shown = clamp(grow * self.NR - k, 0, 1);
                    var len = (0.15 + 0.85 * (smax - s) / (smax - smin + 1e-6)) * (bw - 40) * shown;
                    var yy = by + 22 + k * rh;
                    ctx.fillStyle = k === st.best && t > 2.2 ? rgba(CY, 0.9) : rgba(SV, 0.28);
                    ctx.fillRect(bx + 24, yy, len, 5);
                    label(pad(k + 1, 2), bx, yy + 6, rgba(SV, 0.4), 'left', 8);
                });
            }
            report(this.cap, !committed ? 'IMAGINING // ' + pad(Math.floor(grow * this.NR), 2) + ' OF ' +
                pad(this.NR, 2) + ' ROLLOUTS' : 'ACTING // STEP ' + pad(step, 2) + ' OF ' + n);
            if (t > 6.6 && !reduce.matches) {
                this.episode();
            }
        }
    };

    /* ---------------------------------------------------------- */
    /* 2 // HYDRATRADE - cross-sectional rank flow                  */
    /* ---------------------------------------------------------- */

    var rank = {
        cap: 'CROSS-SECTIONAL RANK FLOW // LONG Q5, SHORT Q1',
        N: 24,
        K: 22,
        Q: 5,
        DAY: 1100,
        start: function() {
            var a = [],
                i;
            for (i = 0; i < this.N; i++) {
                a.push(gauss() * 0.8);
            }
            state = {
                s: a,
                ranks: [],
                eq: [],
                e: 0,
                day: 0,
                t0: performance.now()
            };
            for (i = 0; i < this.K + 1; i++) {
                this.tick();
            }
            state.t0 = performance.now();
        },
        /* rank 0 is the highest score */
        order: function(s) {
            var idx = s.map(function(_, i) {
                return i;
            });
            idx.sort(function(p, q) {
                return s[q] - s[p];
            });
            var r = [];
            idx.forEach(function(ai, k) {
                r[ai] = k;
            });
            return r;
        },
        tick: function() {
            var st = state,
                N = this.N,
                Q = this.Q,
                prev = st.ranks.length ? st.ranks[st.ranks.length - 1] : null,
                i;
            /* next-day returns carry a small edge in yesterday's score: an illustrative simulation */
            if (prev) {
                var lg = 0,
                    sh = 0;
                for (i = 0; i < N; i++) {
                    var ret = 0.0035 * st.s[i] + 0.02 * gauss();
                    if (prev[i] < Q) {
                        lg += ret;
                    } else if (prev[i] >= N - Q) {
                        sh += ret;
                    }
                }
                st.e += (lg - sh) / Q;
            }
            for (i = 0; i < N; i++) {
                st.s[i] = st.s[i] * 0.8 + gauss() * 0.45;
            }
            st.ranks.push(this.order(st.s));
            st.eq.push(st.e);
            if (st.ranks.length > this.K + 1) {
                st.ranks.shift();
                st.eq.shift();
            }
            st.day += 1;
        },
        frame: function(now) {
            var st = state,
                self = this,
                N = this.N,
                K = this.K,
                Q = this.Q;
            var ph = reduce.matches ? 0 : (now - st.t0) / this.DAY;
            if (ph >= 1) {
                this.tick();
                st.t0 = now;
                ph = 0;
            }
            ph = smooth(ph);
            grid();
            var A = area();
            var x0 = Math.max(36, W * 0.07),
                x1 = W - Math.max(96, W * 0.14),
                y0 = A.top + 10,
                y1 = A.top + (A.bottom - A.top) * 0.6,
                e0 = y1 + 34,
                e1 = A.bottom;
            var dx = (x1 - x0) / (K - 1),
                dy = (y1 - y0) / (N - 1);
            var R = st.ranks,
                last = R[R.length - 1];
            var X = function(k) {
                return x1 - (R.length - 1 - k + ph) * dx;
            };
            /* quintile bands */
            ctx.fillStyle = rgba(CY, 0.045);
            ctx.fillRect(x0, y0 - dy / 2, x1 - x0, dy * Q);
            ctx.fillStyle = rgba(RD, 0.045);
            ctx.fillRect(x0, y1 - dy * (Q - 0.5), x1 - x0, dy * Q);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, 0, x1 - x0 + 8, H);
            ctx.clip();
            var draw = function(i, color, width) {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.beginPath();
                var px = X(0),
                    py = y0 + R[0][i] * dy;
                ctx.moveTo(px, py);
                for (var k = 1; k < R.length; k++) {
                    var nx = X(k),
                        ny = y0 + R[k][i] * dy,
                        mx = (px + nx) / 2;
                    ctx.bezierCurveTo(mx, py, mx, ny, nx, ny);
                    px = nx;
                    py = ny;
                }
                ctx.stroke();
            };
            var i;
            for (i = 0; i < N; i++) {
                if (last[i] >= Q && last[i] < N - Q) {
                    draw(i, rgba(SV, 0.13), 1);
                }
            }
            for (i = 0; i < N; i++) {
                if (last[i] >= N - Q) {
                    draw(i, rgba(RD, 0.75), 1.6);
                } else if (last[i] < Q) {
                    draw(i, rgba(CY, 0.85), 1.8);
                }
            }
            ctx.restore();
            /* fade the oldest days out */
            var fade = ctx.createLinearGradient(x0, 0, x0 + dx * 3, 0);
            fade.addColorStop(0, 'rgba(' + BG.join(',') + ',1)');
            fade.addColorStop(1, 'rgba(' + BG.join(',') + ',0)');
            ctx.fillStyle = fade;
            ctx.fillRect(x0 - 2, y0 - 12, dx * 3 + 2, y1 - y0 + 24);
            /* today's book */
            var xr = X(R.length - 1);
            for (i = 0; i < N; i++) {
                var r = last[i];
                ctx.fillStyle = r < Q ? rgba(CY, 1) : r >= N - Q ? rgba(RD, 1) : rgba(SV, 0.35);
                ctx.fillRect(xr - 2, y0 + r * dy - 2, 4, 4);
            }
            ctx.strokeStyle = rgba(SV, 0.25);
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(x1 + 0.5, y0 - 18);
            ctx.lineTo(x1 + 0.5, e1);
            ctx.stroke();
            ctx.setLineDash([]);
            label('LONG Q5', x1 + 12, y0 + dy * (Q - 1) / 2 + 3, rgba(CY, 0.95));
            label('SHORT Q1', x1 + 12, y1 - dy * (Q - 1) / 2 + 3, rgba(RD, 0.95));
            label('REBALANCE', x1 + 12, y0 - 14, rgba(SV, 0.4), 'left', 9);
            label('RANK', x0, y0 - 14, rgba(SV, 0.4), 'left', 9);
            /* market-neutral equity on the same time axis, drawdowns in red */
            var E = st.eq,
                lo = Math.min.apply(null, E),
                hi = Math.max.apply(null, E);
            if (hi - lo < 0.02) {
                hi = lo + 0.02;
            }
            var EY = function(v) {
                return e1 - (v - lo) / (hi - lo) * (e1 - e0);
            };
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, 0, x1 - x0 + 1, H);
            ctx.clip();
            var peak = -1e9,
                k;
            ctx.fillStyle = rgba(RD, 0.1);
            for (k = 0; k < E.length; k++) {
                peak = Math.max(peak, E[k]);
                if (k > 0 && E[k] < peak) {
                    ctx.fillRect(X(k) - dx / 2, EY(peak), dx, EY(E[k]) - EY(peak));
                }
            }
            var gr = ctx.createLinearGradient(0, e0, 0, e1);
            gr.addColorStop(0, rgba(CY, 0.18));
            gr.addColorStop(1, rgba(CY, 0));
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.moveTo(X(0), e1);
            for (k = 0; k < E.length; k++) {
                ctx.lineTo(X(k), EY(E[k]));
            }
            ctx.lineTo(X(E.length - 1), e1);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = rgba(CY, 0.95);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (k = 0; k < E.length; k++) {
                if (k === 0) {
                    ctx.moveTo(X(k), EY(E[k]));
                } else {
                    ctx.lineTo(X(k), EY(E[k]));
                }
            }
            ctx.stroke();
            ctx.restore();
            ctx.fillStyle = fade;
            ctx.fillRect(x0 - 2, e0 - 6, dx * 3 + 2, e1 - e0 + 8);
            ctx.strokeStyle = rgba(SV, 0.12);
            ctx.beginPath();
            ctx.moveTo(x0, e1 + 0.5);
            ctx.lineTo(x1, e1 + 0.5);
            ctx.stroke();
            label('LONG - SHORT EQUITY', x0, e0 - 10, rgba(SV, 0.4), 'left', 9);
            label('DRAWDOWN', x1 + 12, e1 - 4, rgba(RD, 0.7), 'left', 9);
            report(this.cap, 'DAY ' + pad(st.day, 3) + ' // SIMULATED // REBALANCE 00:00 UTC');
        }
    };

    /* ---------------------------------------------------------- */
    /* 3 // THESEUS - scan a donor brain, rebuild the copy           */
    /* ---------------------------------------------------------- */

    /* a 3D donor network, two hemispheres, neurons excitatory or inhibitory (Dale's law).
       Each weight = shared part (the common curriculum) + private part (the donor's life).
       A scan plane sweeps the donor; synapses it passes are measured with noise that shrinks
       as the scan refines, and some are missed. IDENTITY = corr(copy, donor); SIBLING =
       corr(copy, a sibling with the same shared part but another private part). */
    var thes = {
        cap: 'SCAN PLANE // RECONSTRUCTED COPY',
        donor: 0,
        start: function() {
            var n = 96,
                nodes = [],
                edges = [],
                i, j;
            for (i = 0; i < n; i++) {
                var hemi = i % 2 ? 1 : -1,
                    p;
                do {
                    p = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1];
                } while (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > 1);
                nodes.push({
                    x: hemi * (0.1 + Math.abs(p[0]) * 0.5),
                    y: p[1] * 0.62,
                    z: p[2] * 0.8,
                    sign: Math.random() < 0.75 ? 1 : -1
                });
            }
            var key = {};
            var add = function(a, b) {
                var k = a < b ? a + '-' + b : b + '-' + a;
                if (a === b || key[k]) {
                    return;
                }
                key[k] = 1;
                var pre = Math.random() < 0.5 ? a : b,
                    sh = gauss(),
                    pr = gauss(),
                    ps = gauss();
                var sgn = nodes[pre].sign;
                edges.push({
                    a: a,
                    b: b,
                    w: sgn * (0.2 + Math.abs(0.65 * sh + 0.45 * pr) * 0.6),
                    ws: sgn * (0.2 + Math.abs(0.65 * sh + 0.45 * ps) * 0.6),
                    e: gauss(),
                    miss: Math.random() < 0.08
                });
            };
            for (i = 0; i < n; i++) {
                var d = [];
                for (j = 0; j < n; j++) {
                    if (j !== i) {
                        var A = nodes[i],
                            B = nodes[j];
                        d.push([Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z), j]);
                    }
                }
                d.sort(function(p, q) {
                    return p[0] - q[0];
                });
                add(i, d[0][1]);
                add(i, d[1][1]);
                add(i, d[2][1]);
                if (Math.random() < 0.12) {
                    add(i, d[8 + Math.floor(Math.random() * 40)][1]);
                }
            }
            edges.forEach(function(e) {
                e.mx = (nodes[e.a].x + nodes[e.b].x) / 2;
            });
            this.donor += 1;
            state = {
                nodes: nodes,
                edges: edges,
                t0: performance.now()
            };
        },
        rot: function(p) {
            var st = state;
            var x = p[0] * st.c - p[2] * st.s,
                z = p[0] * st.s + p[2] * st.c;
            var y = p[1] * st.ct - z * st.st,
                z2 = p[1] * st.st + z * st.ct;
            var f = 1 / (1 + z2 * 0.28);
            return [x * f, y * f, z2, f];
        },
        frame: function(now) {
            var st = state,
                self = this;
            var T = reduce.matches ? 7.5 : (now - st.t0) / 1000;
            if (T > 10) {
                this.start();
                st = state;
                T = 0;
            }
            var scan = clamp(T / 6, 0, 1),
                sig = 0.75 * Math.pow(1 - scan, 1.3) + 0.12,
                sx = -0.75 + 1.5 * scan;
            var ang = reduce.matches ? 0.5 : now * 0.00016;
            st.c = Math.cos(ang);
            st.s = Math.sin(ang);
            st.ct = Math.cos(0.32);
            st.st = Math.sin(0.32);
            grid();
            var Ar = area();
            var R = Math.min(W * 0.27, (Ar.bottom - Ar.top) * 0.5),
                cy = (Ar.top + Ar.bottom) / 2 + 6,
                lx = W * 0.28,
                rx = W * 0.72;
            var P = st.nodes.map(function(nd) {
                return self.rot([nd.x, nd.y, nd.z]);
            });
            var seen = function(e) {
                return !e.miss && e.mx <= sx;
            };
            var est = function(e) {
                return e.w + e.e * sig * 0.6;
            };
            var edge = function(cx, e, w, alpha, hot) {
                var a = P[e.a],
                    b = P[e.b],
                    m = Math.min(1, Math.abs(w) / 0.9),
                    dep = 0.55 + 0.45 * (1 - (a[2] + b[2] + 2) / 4);
                ctx.strokeStyle = hot ? rgba(SV, 0.9) : rgba(w >= 0 ? CY : RD, ((0.1 + 0.5 * m) * dep * alpha).toFixed(3));
                ctx.lineWidth = 0.5 + 1.1 * m * dep;
                ctx.beginPath();
                ctx.moveTo(cx + a[0] * R, cy + a[1] * R);
                ctx.lineTo(cx + b[0] * R, cy + b[1] * R);
                ctx.stroke();
            };
            /* donor */
            st.edges.forEach(function(e) {
                var hot = scan < 1 && e.mx <= sx && e.mx > sx - 0.06;
                edge(lx, e, e.w, 1, hot);
            });
            /* copy: only what the scan has measured, with measurement noise */
            st.edges.forEach(function(e) {
                if (seen(e)) {
                    edge(rx, e, est(e), 0.95, false);
                }
            });
            P.forEach(function(p, i) {
                var dep = 0.5 + 0.5 * (1 - (p[2] + 1) / 2);
                ctx.fillStyle = st.nodes[i].sign > 0 ? rgba(SV, 0.85 * dep) : rgba(RD, 0.9 * dep);
                var s = 2.6 * p[3];
                ctx.fillRect(lx + p[0] * R - s / 2, cy + p[1] * R - s / 2, s, s);
                ctx.fillStyle = rgba(SV, (st.nodes[i].x <= sx ? 0.7 : 0.18) * dep);
                ctx.fillRect(rx + p[0] * R - s / 2, cy + p[1] * R - s / 2, s, s);
            });
            /* the scan plane through the donor */
            if (scan < 1) {
                var corners = [[sx, -0.62, -0.75], [sx, 0.62, -0.75], [sx, 0.62, 0.75], [sx, -0.62, 0.75]].map(function(q) {
                    return self.rot(q);
                });
                ctx.beginPath();
                corners.forEach(function(q, k) {
                    if (k === 0) {
                        ctx.moveTo(lx + q[0] * R, cy + q[1] * R);
                    } else {
                        ctx.lineTo(lx + q[0] * R, cy + q[1] * R);
                    }
                });
                ctx.closePath();
                ctx.fillStyle = rgba(RD, 0.05);
                ctx.fill();
                ctx.strokeStyle = rgba(RD, 0.6);
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            /* transfer arrow */
            ctx.strokeStyle = rgba(SV, 0.3);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(W * 0.47, cy);
            ctx.lineTo(W * 0.53, cy);
            ctx.moveTo(W * 0.52, cy - 4);
            ctx.lineTo(W * 0.53, cy);
            ctx.lineTo(W * 0.52, cy + 4);
            ctx.stroke();
            label('DONOR ' + pad(this.donor, 2), lx, cy + R * 0.95 + 26, rgba(SV, 0.5), 'center');
            label('COPY', rx, cy + R * 0.95 + 26, rgba(SV, 0.5), 'center');
            /* identity and sibling test */
            var corr = function(fy, fx) {
                var sx2 = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, k = st.edges.length;
                st.edges.forEach(function(e) {
                    var x = fx(e),
                        y = fy(e);
                    sx2 += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
                });
                var cov = sxy / k - sx2 / k * sy / k,
                    vy = syy / k - sy / k * sy / k,
                    vx = sxx / k - sx2 / k * sx2 / k;
                return vy > 1e-9 ? clamp(cov / Math.sqrt(vx * vy), 0, 1) : 0;
            };
            var copyW = function(e) {
                return seen(e) ? est(e) : 0;
            };
            var id = corr(copyW, function(e) {
                return e.w;
            });
            var sib = corr(copyW, function(e) {
                return e.ws;
            });
            /* inset: donor vs copy weights, converging onto the diagonal */
            if (W >= 520) {
                var bs = 112,
                    bx = W - 28 - bs,
                    by = 84;
                ctx.fillStyle = 'rgba(3,7,12,0.72)';
                ctx.fillRect(bx - 12, by - 6, bs + 24, bs + 40);
                ctx.strokeStyle = rgba(SV, 0.1);
                ctx.strokeRect(bx - 12 + 0.5, by - 6 + 0.5, bs + 24, bs + 40);
                label('DONOR vs COPY', bx, by + 10, rgba(SV, 0.5), 'left', 9);
                var oy = by + 22;
                ctx.strokeStyle = rgba(SV, 0.15);
                ctx.strokeRect(bx + 0.5, oy + 0.5, bs, bs);
                ctx.setLineDash([2, 3]);
                ctx.beginPath();
                ctx.moveTo(bx, oy + bs);
                ctx.lineTo(bx + bs, oy);
                ctx.stroke();
                ctx.setLineDash([]);
                st.edges.forEach(function(e) {
                    if (e.mx > sx) {
                        return;
                    }
                    var v = e.miss ? 0 : est(e);
                    var px = bx + (clamp(e.w, -1.1, 1.1) + 1.1) / 2.2 * bs,
                        py = oy + bs - (clamp(v, -1.1, 1.1) + 1.1) / 2.2 * bs;
                    ctx.fillStyle = e.miss ? rgba(RD, 0.9) : rgba(CY, 0.8);
                    ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
                });
            }
            report(this.cap, 'SCAN ' + pad(Math.round(scan * 100), 3) + '% // IDENTITY ' + id.toFixed(2) +
                ' // SIBLING ' + sib.toFixed(2));
        }
    };

    var MODES = [lab, bio, rank, thes];

    /* ---------------------------------------------------------- */
    /* LIFECYCLE                                                   */
    /* ---------------------------------------------------------- */

    function resize() {
        var r = canvas.getBoundingClientRect();
        DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        W = Math.max(1, Math.round(r.width));
        H = Math.max(1, Math.round(r.height));
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        MODES[mode].start();
        draw(performance.now());
    }

    function draw(now) {
        clear();
        MODES[mode].frame(now);
    }

    function loop(now) {
        raf = 0;
        if (!active) {
            return;
        }
        draw(now);
        if (!reduce.matches) {
            raf = window.requestAnimationFrame(loop);
        }
    }

    function kick() {
        if (!raf) {
            raf = window.requestAnimationFrame(loop);
        }
    }

    window.CiyaScope = {
        init: function(el, h) {
            canvas = el;
            ctx = canvas.getContext('2d');
            hooks = h;
            resize();
            var to = 0;
            window.addEventListener('resize', function() {
                window.clearTimeout(to);
                to = window.setTimeout(resize, 120);
            });
            /* the lab visual samples glyphs from the web font: resample once it has loaded */
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(function() {
                    if (mode === 0) {
                        resize();
                    }
                });
            }
        },
        set: function(i) {
            if (i === mode || !MODES[i]) {
                return;
            }
            mode = i;
            lastData = '';
            MODES[mode].start();
            draw(performance.now());
            if (active) {
                kick();
            }
        },
        setActive: function(on) {
            /* coming into view restarts the visual, so it is seen from its first frame */
            if (on && !active && canvas) {
                lastData = '';
                MODES[mode].start();
            }
            active = on;
            if (on) {
                kick();
            }
        },
        caption: function(i) {
            return MODES[i] ? MODES[i].cap : '';
        }
    };
})();
