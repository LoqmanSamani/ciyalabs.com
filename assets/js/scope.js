/*
  Ciya Labs - research scope
  One canvas, three live visuals, one per research line:
    0 BioDreamer    imagined rollouts on a learned energy landscape
    1 HydraTrade    cross-sectional ranking, long the top quintile, short the bottom
    2 Diffusion     reverse diffusion from Gaussian noise to the Ciya mark
  Exposes window.CiyaScope = { init, set, setActive }.
*/

(function() {
    'use strict';

    var CY = '63,214,230';
    var RD = '217,71,58';
    var SV = '228,234,240';
    var BG = [6, 12, 20];

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

    function clamp(v, a, b) {
        return Math.min(b, Math.max(a, v));
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
        ctx.strokeStyle = rgba(SV, 0.035);
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

    /* ---------------------------------------------------------- */
    /* 0 // BIODREAMER - planning in imagination                   */
    /* ---------------------------------------------------------- */

    var WELLS = [
        [0.70, 0.68, 0.16, 1.15], /* goal: deepest basin */
        [0.28, 0.36, 0.12, 0.70],
        [0.36, 0.78, 0.10, 0.55],
        [0.74, 0.30, 0.11, 0.62],
        [0.52, 0.52, 0.22, 0.35]
    ];

    function field(x, y) {
        var f = 0.10 * Math.sin(7 * x + 2) * Math.cos(6 * y - 1),
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

    function bakeLandscape() {
        var gw = Math.max(120, Math.round(W / 2)),
            gh = Math.max(120, Math.round(H / 2));
        var off = document.createElement('canvas');
        off.width = gw;
        off.height = gh;
        var octx = off.getContext('2d');
        var img = octx.createImageData(gw, gh);
        var vals = new Float32Array(gw * gh),
            lo = 1e9,
            hi = -1e9,
            i, j, v;
        for (j = 0; j < gh; j++) {
            for (i = 0; i < gw; i++) {
                v = field(i / gw, j / gh);
                vals[j * gw + i] = v;
                lo = Math.min(lo, v);
                hi = Math.max(hi, v);
            }
        }
        for (i = 0; i < vals.length; i++) {
            v = (vals[i] - lo) / (hi - lo);
            /* thin iso-lines, brighter in the basins; the fill stays near black */
            var band = (v * 11) % 1;
            var line = band < 0.045 ? 1 - band / 0.045 : 0;
            var depth = Math.pow(1 - v, 1.6);
            var a = 0.015 + 0.42 * line * (0.25 + 0.75 * depth);
            var k = i * 4;
            img.data[k] = BG[0] + (63 - BG[0]) * a;
            img.data[k + 1] = BG[1] + (214 - BG[1]) * a + 6 * depth;
            img.data[k + 2] = BG[2] + (230 - BG[2]) * a + 9 * depth;
            img.data[k + 3] = 255;
        }
        octx.putImageData(img, 0, 0);
        return off;
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
        for (s = 0; s < 46; s++) {
            g = gradF(x, y);
            n = Math.hypot(g[0], g[1]) + 0.6;
            temp = noise * (1 - s / 46);
            dx = gx - x;
            dy = gy - y;
            dn = Math.hypot(dx, dy) + 0.05;
            vx = 0.78 * vx - 0.008 * g[0] / n + drive * 0.0056 * dx / dn + temp * gauss() * 0.0045;
            vy = 0.78 * vy - 0.008 * g[1] / n + drive * 0.0056 * dy / dn + temp * gauss() * 0.0045;
            x = clamp(x + vx, 0.03, 0.97);
            y = clamp(y + vy, 0.03, 0.97);
            pts.push([x, y]);
        }
        return pts;
    }

    function newEpisode(st) {
        var sx = 0.12 + Math.random() * 0.25,
            sy = 0.10 + Math.random() * 0.25;
        if (Math.random() < 0.5) {
            sx = 1 - sx;
        }
        st.paths = [];
        for (var r = 0; r < 6; r++) {
            st.paths.push(rollout(sx, sy, 0.6 + Math.random() * 1.2, 0.25 + r / 5 * 1.45));
        }
        var best = 0,
            bv = 1e9;
        st.paths.forEach(function(p, k) {
            var e = p[p.length - 1],
                v = field(e[0], e[1]);
            if (v < bv) {
                bv = v;
                best = k;
            }
        });
        st.best = best;
        st.t0 = performance.now();
    }

    function drawPath(p, upto, color, width, dash) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        for (var i = 0; i <= upto && i < p.length; i++) {
            var x = p[i][0] * W,
                y = p[i][1] * H;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function ring(x, y, r, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    var bio = {
        cap: 'IMAGINED ROLLOUTS ON A LEARNED LANDSCAPE',
        start: function() {
            state = {
                land: bakeLandscape()
            };
            newEpisode(state);
        },
        frame: function(now) {
            var st = state;
            var t = reduce.matches ? 99 : (now - st.t0) / 1000;
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(st.land, 0, 0, W, H);
            var n = st.paths[0].length - 1;
            /* phase 1: imagine six rollouts */
            var grow = clamp(t / 1.6, 0, 1);
            st.paths.forEach(function(p, k) {
                if (k !== st.best || t < 1.9) {
                    drawPath(p, Math.floor(grow * n), rgba(SV, k === st.best && t >= 1.6 ? 0.5 : 0.22), 1, [3, 4]);
                }
            });
            /* phase 2: commit to the best plan, then act */
            var act = clamp((t - 1.9) / 2.4, 0, 1);
            var step = Math.floor(act * n);
            if (t >= 1.9) {
                drawPath(st.paths[st.best], n, rgba(CY, 0.35), 1.2, [2, 3]);
                drawPath(st.paths[st.best], step, rgba(CY, 0.95), 2);
            }
            var goal = WELLS[0];
            var pulse = reduce.matches ? 0 : (now / 1000) % 2 / 2;
            ring(goal[0] * W, goal[1] * H, 10, rgba(RD, 0.9), 1.5);
            ring(goal[0] * W, goal[1] * H, 10 + 26 * pulse, rgba(RD, 0.5 * (1 - pulse)), 1);
            var s0 = st.paths[st.best][0];
            ring(s0[0] * W, s0[1] * H, 5, rgba(SV, 0.7), 1.2);
            var a = st.paths[st.best][t >= 1.9 ? step : 0];
            ctx.fillStyle = rgba(CY, 1);
            ctx.beginPath();
            ctx.arc(a[0] * W, a[1] * H, 4.5, 0, Math.PI * 2);
            ctx.fill();
            report(this.cap, t < 1.9 ? 'IMAGINING // ' + pad(Math.floor(grow * 6), 2) + ' OF 06 ROLLOUTS' :
                'ACTING // STEP ' + pad(step, 2) + ' OF ' + n);
            if (t > 5.4 && !reduce.matches) {
                newEpisode(st);
            }
        }
    };

    /* ---------------------------------------------------------- */
    /* 1 // HYDRATRADE - cross-sectional ranking                   */
    /* ---------------------------------------------------------- */

    var rank = {
        cap: 'CROSS-SECTIONAL RANK // LONG Q5, SHORT Q1',
        start: function() {
            var n = 30,
                assets = [];
            for (var i = 0; i < n; i++) {
                assets.push({
                    s: gauss() * 0.8,
                    x: i
                });
            }
            state = {
                assets: assets,
                day: 1,
                t0: performance.now(),
                order: []
            };
            this.rerank();
            assets.forEach(function(as) {
                as.x = as.r;
            });
        },
        rerank: function() {
            var a = state.assets;
            var idx = a.map(function(_, i) {
                return i;
            });
            idx.sort(function(p, q) {
                return a[p].s - a[q].s;
            });
            idx.forEach(function(ai, r) {
                a[ai].r = r;
            });
        },
        tick: function() {
            state.assets.forEach(function(a) {
                a.s = a.s * 0.82 + gauss() * 0.42;
            });
            state.day += 1;
            this.rerank();
        },
        frame: function(now) {
            var st = state,
                a = st.assets,
                n = a.length;
            if (!reduce.matches && now - st.t0 > 1500) {
                st.t0 = now;
                this.tick();
            }
            grid();
            var left = W * 0.12,
                right = W * 0.88,
                mid = H * 0.52,
                span = H * 0.22;
            var bw = (right - left) / n;
            ctx.strokeStyle = rgba(SV, 0.25);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(left - 10, mid + 0.5);
            ctx.lineTo(right + 10, mid + 0.5);
            ctx.stroke();
            /* quintile bands */
            ctx.fillStyle = rgba(RD, 0.05);
            ctx.fillRect(left, H * 0.2, bw * 6, H * 0.64);
            ctx.fillStyle = rgba(CY, 0.05);
            ctx.fillRect(right - bw * 6, H * 0.2, bw * 6, H * 0.64);
            a.forEach(function(as) {
                as.x += (as.r - as.x) * (reduce.matches ? 1 : 0.12);
                var x = left + as.x * bw + bw * 0.18,
                    h = clamp(as.s, -2.2, 2.2) / 2.2 * span;
                var col = as.r >= n - 6 ? rgba(CY, 0.9) : as.r < 6 ? rgba(RD, 0.85) : rgba(SV, 0.22);
                ctx.fillStyle = col;
                ctx.fillRect(x, h > 0 ? mid - h : mid, bw * 0.64, Math.max(1, Math.abs(h)));
            });
            ctx.font = '500 11px "JetBrains Mono", monospace';
            ctx.fillStyle = rgba(RD, 0.95);
            ctx.fillText('SHORT // Q1', left, H * 0.2 - 12);
            ctx.fillStyle = rgba(CY, 0.95);
            var lt = 'LONG // Q5';
            ctx.fillText(lt, right - ctx.measureText(lt).width, H * 0.2 - 12);
            ctx.fillStyle = rgba(SV, 0.35);
            ctx.fillText('RANK  01', left, H * 0.84 + 22);
            var rt = '30';
            ctx.fillText(rt, right - ctx.measureText(rt).width, H * 0.84 + 22);
            report(this.cap, 'DAY ' + pad(st.day, 3) + ' // REBALANCE 00:00 UTC');
        }
    };

    /* ---------------------------------------------------------- */
    /* 2 // DIFFUSION - noise to the Ciya mark                     */
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

    var diff = {
        cap: 'REVERSE DIFFUSION // NOISE TO STRUCTURE',
        start: function() {
            var segs = [],
                total = 0,
                i;
            for (i = 0; i < MARK.length - 1; i++) {
                var l = Math.hypot(MARK[i + 1][0] - MARK[i][0], MARK[i + 1][1] - MARK[i][1]);
                segs.push(l);
                total += l;
            }
            var N = 760,
                pts = [];
            var scale = Math.min(W * 0.62, H * 0.9) / 102;
            var ox = W / 2 - 51 * scale,
                oy = H * 0.48 - 41 * scale;
            for (i = 0; i < N; i++) {
                var d = Math.random() * total,
                    s = 0;
                while (d > segs[s]) {
                    d -= segs[s];
                    s++;
                }
                var f = d / segs[s];
                var x = MARK[s][0] + (MARK[s + 1][0] - MARK[s][0]) * f;
                var y = MARK[s][1] + (MARK[s + 1][1] - MARK[s][1]) * f;
                pts.push({
                    x0: ox + x * scale + gauss() * 1.6,
                    y0: oy + y * scale + gauss() * 1.6,
                    red: Math.random() < 0.08
                });
            }
            state = {
                pts: pts,
                t0: performance.now(),
                cx: W / 2,
                cy: H * 0.48,
                sig: Math.min(W, H) * 0.3
            };
            this.noise();
        },
        noise: function() {
            state.pts.forEach(function(p) {
                p.ex = gauss();
                p.ey = gauss();
            });
        },
        frame: function(now) {
            var st = state;
            var T = reduce.matches ? 5 : ((now - st.t0) / 1000) % 8.6;
            var t;
            if (T < 4.6) {
                var u = T / 4.6;
                t = 1 - u * u * (3 - 2 * u); /* smoothstep from pure noise to data */
            } else if (T < 6.8) {
                t = 0;
            } else {
                t = (T - 6.8) / 1.8;
            }
            if (!reduce.matches && st.lastT !== undefined && st.lastT > 7.5 && T < 1) {
                this.noise();
            }
            st.lastT = T;
            var abar = Math.pow(Math.cos((t + 0.008) / 1.008 * Math.PI / 2), 2);
            var a = Math.sqrt(abar),
                b = Math.sqrt(1 - abar);
            grid();
            st.pts.forEach(function(p) {
                var x = st.cx + a * (p.x0 - st.cx) + b * p.ex * st.sig;
                var y = st.cy + a * (p.y0 - st.cy) + b * p.ey * st.sig;
                ctx.fillStyle = p.red ? rgba(RD, 0.9) : rgba(CY, 0.35 + 0.55 * a);
                ctx.fillRect(x - 1.1, y - 1.1, 2.2, 2.2);
            });
            var step = Math.round(t * 1000);
            report(this.cap, 't ' + t.toFixed(2) + ' // STEP ' + pad(step, 4) + ' / 1000');
        }
    };

    var MODES = [bio, rank, diff];

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
