/*
  Ciya Labs - site script
  Virtual scroll engine and widgets based on the Machina template by TemplateMo
  (https://templatemo.com/tm-632-machina), extended with: section navigation and deep links,
  focus-follow, inner-panel scrolling, the research scope, the products console and lab time.
*/

(function() {
    'use strict';

    /* ---------------------------------------------------------- */
    /* SHARED STATE                                                */
    /* ---------------------------------------------------------- */

    var mqMobile = window.matchMedia('(max-width: 900px)');
    var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));
    var BLOCKS = panels.reduce(function(m, p) {
        return Math.max(m, parseInt(p.getAttribute('data-i'), 10) + 1);
    }, 1);

    /* block index -> section id (the panel that carries the id names the block) */
    var blockIds = [];
    panels.forEach(function(p) {
        if (p.id) {
            blockIds[parseInt(p.getAttribute('data-i'), 10)] = p.id;
        }
    });

    var vh = window.innerHeight;
    var maxScroll = (BLOCKS - 1) * vh;

    var target = 0;
    var current = 0;
    var engineOn = false;
    var activeBlock = -1;
    var interacted = false;

    var hudBar = document.getElementById('hud-bar');
    var hudPct = document.getElementById('hud-pct');
    var hudBlock = document.getElementById('hud-block');
    var hudTotal = document.getElementById('hud-total');
    var hudHint = document.getElementById('hud-hint');
    var arrowUp = document.getElementById('arrow-up');
    var arrowDown = document.getElementById('arrow-down');
    var seam = document.querySelector('.seam');
    var navBtns = Array.prototype.slice.call(document.querySelectorAll('.nav-btn'));
    var hintGone = false;

    function dismissHint() {
        interacted = true;
        if (hintGone || !hudHint) {
            return;
        }
        hintGone = true;
        hudHint.classList.add('hide');
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

    if (hudTotal) {
        hudTotal.textContent = pad(BLOCKS, 2);
    }

    Array.prototype.forEach.call(document.querySelectorAll('.year'), function(el) {
        el.textContent = new Date().getFullYear();
    });

    /* ---------------------------------------------------------- */
    /* ACTIVE BLOCK - nav state, deep link, widgets                */
    /* ---------------------------------------------------------- */

    var blockListeners = [];

    function onBlock(fn) {
        blockListeners.push(fn);
    }

    function setActiveBlock(b) {
        if (b === activeBlock) {
            return;
        }
        activeBlock = b;
        navBtns.forEach(function(btn) {
            var on = parseInt(btn.getAttribute('data-go'), 10) === b;
            btn.classList.toggle('active', on);
            if (on) {
                btn.setAttribute('aria-current', 'true');
                /* on narrow screens the nav scrolls sideways: keep the active label in view */
                var nav = btn.parentNode;
                if (nav && nav.scrollWidth > nav.clientWidth) {
                    nav.scrollTo({
                        left: btn.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2,
                        behavior: mqReduce.matches ? 'auto' : 'smooth'
                    });
                }
            } else {
                btn.removeAttribute('aria-current');
            }
        });
        if (hudBlock) {
            hudBlock.textContent = pad(b + 1, 2);
        }
        if (interacted && window.history && history.replaceState && blockIds[b]) {
            history.replaceState(null, '', b === 0 ? location.pathname + location.search : '#' + blockIds[b]);
        }
        blockListeners.forEach(function(fn) {
            fn(b);
        });
    }

    /* ---------------------------------------------------------- */
    /* VIRTUAL SCROLL ENGINE - inverse twin tracks with lerp       */
    /* ---------------------------------------------------------- */

    function applyTransforms() {
        var i, p, idx, y;
        for (i = 0; i < panels.length; i++) {
            p = panels[i];
            idx = parseInt(p.getAttribute('data-i'), 10);
            if (p.classList.contains('t-left')) {
                y = idx * vh - current; /* left track travels up on scroll down */
            } else {
                y = current - idx * vh; /* right track travels down on scroll down */
            }
            p.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
        }
    }

    function updateHud(ratio) {
        var r = clamp(ratio, 0, 1);
        var pct = Math.round(r * 100);
        if (hudPct) {
            hudPct.textContent = pad(pct, 3) + '%';
        }
        if (hudBar) {
            hudBar.style.transform = 'scaleX(' + r + ')';
        }
        if (seam) {
            seam.style.setProperty('--seam-y', (r * (vh - 56)).toFixed(1) + 'px');
        }
        setActiveBlock(clamp(Math.round(r * (BLOCKS - 1)), 0, BLOCKS - 1));
        if (arrowUp) {
            arrowUp.disabled = target < vh * 0.5;
        }
        if (arrowDown) {
            arrowDown.disabled = target > maxScroll - vh * 0.5;
        }
    }

    var looping = false;

    function engineLoop() {
        if (!engineOn) {
            looping = false;
            return;
        }
        var ease = mqReduce.matches ? 1 : 0.085; /* heavy buttery lerp, instant if reduced */
        current += (target - current) * ease;
        if (Math.abs(target - current) < 0.05) {
            current = target;
        }
        applyTransforms();
        updateHud(maxScroll > 0 ? current / maxScroll : 0);
        window.requestAnimationFrame(engineLoop);
    }

    /* let a panel with overflowing content scroll natively before the engine takes over */
    function scrollableAncestor(el, dir) {
        while (el && el !== document.body) {
            if (el.classList && el.classList.contains('panel-inner')) {
                var canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
                var canUp = el.scrollTop > 0;
                return (dir > 0 && canDown) || (dir < 0 && canUp) ? el : null;
            }
            el = el.parentNode;
        }
        return null;
    }

    function onWheel(e) {
        if (!engineOn) {
            return;
        }
        var d = e.deltaY;
        if (e.deltaMode === 1) {
            d *= 16;
        }
        if (e.deltaMode === 2) {
            d *= vh;
        }
        if (scrollableAncestor(e.target, d)) {
            return;
        }
        e.preventDefault();
        dismissHint();
        target = clamp(target + d, 0, maxScroll);
    }

    var touchY = null;

    function onTouchStart(e) {
        if (!engineOn) {
            return;
        }
        touchY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
        if (!engineOn || touchY === null || c3dDragging) {
            return;
        }
        var y = e.touches[0].clientY;
        if (scrollableAncestor(e.target, touchY - y)) {
            touchY = y;
            return;
        }
        e.preventDefault();
        dismissHint();
        target = clamp(target + (touchY - y) * 1.7, 0, maxScroll);
        touchY = y;
    }

    function onTouchEnd() {
        touchY = null;
    }

    function snapTo(block, instant) {
        target = clamp(block, 0, BLOCKS - 1) * vh;
        if (instant) {
            current = target;
        }
    }

    function arrowStep(dir) {
        if (!engineOn) {
            return;
        }
        dismissHint();
        snapTo(Math.round(target / vh) + dir);
    }

    if (arrowUp) {
        arrowUp.addEventListener('click', function() {
            arrowStep(-1);
        });
    }
    if (arrowDown) {
        arrowDown.addEventListener('click', function() {
            arrowStep(1);
        });
    }

    /* section links: engine snaps, mobile falls back to the native anchor jump */
    Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function(link) {
        link.addEventListener('click', function(e) {
            if (!engineOn) {
                return;
            }
            e.preventDefault();
            dismissHint();
            snapTo(parseInt(link.getAttribute('data-go'), 10));
        });
    });

    function isTyping(el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    function onKey(e) {
        if (!engineOn || isTyping(e.target)) {
            return;
        }
        var navKeys = ['ArrowDown', 'PageDown', ' ', 'ArrowUp', 'PageUp', 'Home', 'End'];
        if (navKeys.indexOf(e.key) !== -1) {
            dismissHint();
        }
        /* space on a focused control activates it instead of scrolling */
        if (e.key === ' ' && e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'A')) {
            return;
        }
        var blk = Math.round(target / vh);
        switch (e.key) {
            case 'ArrowDown':
            case 'PageDown':
            case ' ':
                e.preventDefault();
                snapTo(blk + 1);
                break;
            case 'ArrowUp':
            case 'PageUp':
                e.preventDefault();
                snapTo(blk - 1);
                break;
            case 'Home':
                e.preventDefault();
                snapTo(0);
                break;
            case 'End':
                e.preventDefault();
                snapTo(BLOCKS - 1);
                break;
            case 'ArrowLeft':
                if (activeBlock === 2) {
                    e.preventDefault();
                    c3dStepRot(1);
                }
                break;
            case 'ArrowRight':
                if (activeBlock === 2) {
                    e.preventDefault();
                    c3dStepRot(-1);
                }
                break;
        }
    }

    /* keyboard focus inside another block brings that block into view */
    document.addEventListener('focusin', function(e) {
        if (!engineOn) {
            return;
        }
        var p = e.target.closest ? e.target.closest('.panel') : null;
        if (p) {
            var b = parseInt(p.getAttribute('data-i'), 10);
            if (b !== Math.round(target / vh)) {
                interacted = true;
                snapTo(b, mqReduce.matches);
            }
        }
    });

    function blockFromHash() {
        var id = (location.hash || '').slice(1);
        var b = blockIds.indexOf(id);
        return b < 0 ? 0 : b;
    }

    window.addEventListener('hashchange', function() {
        if (engineOn) {
            snapTo(blockFromHash());
        }
    });

    function startEngine() {
        if (engineOn) {
            return;
        }
        engineOn = true;
        vh = window.innerHeight;
        maxScroll = (BLOCKS - 1) * vh;
        target = clamp(target, 0, maxScroll);
        current = target;
        applyTransforms();
        updateHud(maxScroll > 0 ? current / maxScroll : 0);
        if (!looping) {
            looping = true;
            window.requestAnimationFrame(engineLoop);
        }
    }

    function stopEngine() {
        engineOn = false;
        var i;
        for (i = 0; i < panels.length; i++) {
            panels[i].style.transform = '';
        }
    }

    function setMode() {
        if (mqMobile.matches) {
            stopEngine();
        } else {
            startEngine();
        }
    }

    window.addEventListener('wheel', onWheel, {
        passive: false
    });
    window.addEventListener('touchstart', onTouchStart, {
        passive: true
    });
    window.addEventListener('touchmove', onTouchMove, {
        passive: false
    });
    window.addEventListener('touchend', onTouchEnd, {
        passive: true
    });
    window.addEventListener('keydown', onKey);

    window.addEventListener('resize', function() {
        var blk = Math.round(target / Math.max(vh, 1));
        vh = window.innerHeight;
        maxScroll = (BLOCKS - 1) * vh;
        target = clamp(blk * vh, 0, maxScroll);
        current = target;
        if (engineOn) {
            applyTransforms();
        }
        setMode();
    });

    if (mqMobile.addEventListener) {
        mqMobile.addEventListener('change', setMode);
    }

    /* start on the block named in the URL (#research, #contact, ...) */
    snapTo(blockFromHash(), true);
    setMode();

    /* mobile: native scroll, so track the active section with an observer */
    if ('IntersectionObserver' in window) {
        var secIo = new IntersectionObserver(function(entries) {
            if (engineOn) {
                return;
            }
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    setActiveBlock(parseInt(entry.target.getAttribute('data-i'), 10));
                }
            });
        }, {
            rootMargin: '-45% 0px -45% 0px'
        });
        panels.forEach(function(p) {
            secIo.observe(p);
        });
    }

    /* ---------------------------------------------------------- */
    /* LAB TIME - German time (Europe/Berlin), to the millisecond   */
    /* ---------------------------------------------------------- */

    var clockEl = document.getElementById('live-clock');
    var berlinOffset = 0; /* ms between Berlin wall time and the visitor's wall time */

    function computeOffset() {
        try {
            var now = new Date();
            var parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Berlin',
                hour12: false,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).formatToParts(now).reduce(function(o, p) {
                o[p.type] = p.value;
                return o;
            }, {});
            var berlin = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
            var local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
            berlinOffset = berlin - local;
        } catch (err) {
            berlinOffset = 0;
        }
    }

    function labNow() {
        return new Date(Date.now() + berlinOffset);
    }

    computeOffset();
    window.setInterval(computeOffset, 60000);

    function tickClock() {
        if (clockEl && (activeBlock === 0 || !engineOn)) {
            var d = labNow();
            clockEl.innerHTML = pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' +
                pad(d.getSeconds(), 2) + '<span class="ms">.' + pad(d.getMilliseconds(), 3) + '</span>';
        }
        window.requestAnimationFrame(tickClock);
    }

    window.requestAnimationFrame(tickClock);

    /* ---------------------------------------------------------- */
    /* RESEARCH ACCORDION - drives the scope opposite              */
    /* ---------------------------------------------------------- */

    var accItems = Array.prototype.slice.call(document.querySelectorAll('.acc-item'));
    var scopeEl = document.getElementById('scope');
    var scopeCanvas = document.getElementById('scope-canvas');
    var scopeChip = document.getElementById('scope-chip');
    var scopeCap = document.getElementById('scope-cap');
    var scopeData = document.getElementById('scope-data');
    var blipTimer = null;
    /* scope mode 0 is the lab itself (nothing open); research line k is mode k + 1 */
    var scopeNames = ['CIYA LABS', 'BIODREAMER', 'HYDRATRADE', 'THESEUS'];
    var scopeVisible = false;

    if (window.CiyaScope && scopeCanvas) {
        window.CiyaScope.init(scopeCanvas, {
            onData: function(cap, data) {
                if (scopeCap) {
                    scopeCap.textContent = cap;
                }
                if (scopeData) {
                    scopeData.textContent = data;
                }
            }
        });
    }

    function setScope(i) {
        if (scopeChip) {
            scopeChip.textContent = scopeNames[i] || '';
            if (!mqReduce.matches) {
                scopeChip.classList.add('blip');
                if (blipTimer) {
                    window.clearTimeout(blipTimer);
                }
                blipTimer = window.setTimeout(function() {
                    scopeChip.classList.remove('blip');
                }, 400);
            }
        }
        if (window.CiyaScope) {
            window.CiyaScope.set(i);
        }
    }

    function scopeRun() {
        if (window.CiyaScope) {
            window.CiyaScope.setActive(engineOn ? activeBlock === 1 : scopeVisible);
        }
    }

    onBlock(scopeRun);

    if (scopeEl && 'IntersectionObserver' in window) {
        new IntersectionObserver(function(entries) {
            scopeVisible = entries[0].isIntersecting;
            scopeRun();
        }).observe(scopeEl);
    }

    function setAccHeights() {
        accItems.forEach(function(item) {
            var body = item.querySelector('.acc-body');
            body.style.maxHeight = item.classList.contains('open') ? body.scrollHeight + 'px' : '0px';
        });
    }

    /* home-page shortcuts open their research line */
    Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function(link) {
        link.addEventListener('click', function() {
            var item = accItems[parseInt(link.getAttribute('data-open'), 10)];
            if (item && !item.classList.contains('open')) {
                item.querySelector('.acc-head').click();
            }
        });
    });

    accItems.forEach(function(item, idx) {
        var head = item.querySelector('.acc-head');
        head.addEventListener('click', function() {
            var wasOpen = item.classList.contains('open');
            accItems.forEach(function(other) {
                other.classList.remove('open');
                other.querySelector('.acc-head').setAttribute('aria-expanded', 'false');
            });
            if (!wasOpen) {
                item.classList.add('open');
                head.setAttribute('aria-expanded', 'true');
                setScope(idx + 1);
            } else {
                setScope(0);
            }
            setAccHeights();
        });
    });

    setAccHeights();
    window.addEventListener('resize', setAccHeights);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(setAccHeights);
    }

    /* ---------------------------------------------------------- */
    /* PRODUCTS CONSOLE - illustrative feed of in-house systems    */
    /* ---------------------------------------------------------- */

    var consoleEl = document.getElementById('console-log');
    var CONSOLE_LINES = [
        ['biryar', 'arbitrage <b>retail scan complete</b>, candidates ranked by ROI'],
        ['biryar', 'repricer <b>15-min cycle</b>, drafts queued for approval'],
        ['taxes', 'vat-return <b>quarter computed</b>, dry_run=true, awaiting owner'],
        ['hydra', 'ranker <b>00:00 UTC</b>, universe ranked, 4 sleeves netted'],
        ['biryar', 'clawback <b>ledger reconciled</b> against reimbursements'],
        ['hydra', 'risk <b>exposure within limits</b>, kill switch <i>armed</i>'],
        ['ops', 'model-ops <b>shadow model evaluated</b>, promotion needs owner'],
        ['biryar', 'forecast <b>stock-out projection</b> refreshed per SKU'],
        ['biryar', 'support <b>buyer reply drafted</b>, human sends'],
        ['hydra', 'exec <b>maker orders placed</b>, fills reconciled'],
        ['taxes', 'ledger <b>bank feed imported</b>, rule register applied'],
        ['ops', 'backup <b>daily snapshot</b> written']
    ];
    var MAX_LINES = 12;
    var consoleIdx = 0;
    var consoleTimer = null;

    function consoleLine() {
        if (!consoleEl) {
            return;
        }
        var l = CONSOLE_LINES[consoleIdx % CONSOLE_LINES.length];
        consoleIdx++;
        var d = labNow();
        var li = document.createElement('li');
        li.innerHTML = '<span class="ts">' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' +
            pad(d.getSeconds(), 2) + '</span><span class="sys">' + l[0] + '</span><span class="msg">' + l[1] + '</span>';
        var prev = consoleEl.querySelector('.cursor');
        if (prev) {
            prev.classList.remove('cursor');
        }
        li.classList.add('cursor');
        consoleEl.appendChild(li);
        while (consoleEl.children.length > MAX_LINES) {
            consoleEl.removeChild(consoleEl.firstChild);
        }
    }

    var consoleVisible = false;

    function consoleRun() {
        var on = engineOn ? activeBlock === 2 : consoleVisible;
        if (on && !consoleTimer && !mqReduce.matches) {
            consoleTimer = window.setInterval(consoleLine, 1700);
        } else if (!on && consoleTimer) {
            window.clearInterval(consoleTimer);
            consoleTimer = null;
        }
    }

    if (consoleEl) {
        for (var ci = 0; ci < 8; ci++) {
            consoleLine();
        }
        onBlock(consoleRun);
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function(entries) {
                consoleVisible = entries[0].isIntersecting;
                consoleRun();
            }).observe(consoleEl);
        }
    }

    /* ---------------------------------------------------------- */
    /* 3D KINETIC CAROUSEL - drag, snap, controls, depth cueing    */
    /* ---------------------------------------------------------- */

    var c3d = document.getElementById('c3d');
    var c3dStage = document.getElementById('c3d-stage');
    var c3dStatus = document.getElementById('c3d-status');
    var c3dPrev = document.getElementById('c3d-prev');
    var c3dNext = document.getElementById('c3d-next');
    var c3dPlay = document.getElementById('c3d-play');
    var modBtns = Array.prototype.slice.call(document.querySelectorAll('.mod-btn'));
    var cards = c3d ? Array.prototype.slice.call(c3d.querySelectorAll('.c3d-card')) : [];

    var STEP = 360 / (cards.length || 1);
    /* radius so neighbouring cards keep a gap whatever the card count */
    var RADIUS = Math.round((230 / 2) / Math.tan(Math.PI / (cards.length || 1)) + 34);
    var angle = 0;
    var targetAngle = 0;
    var autoPlay = !mqReduce.matches;
    var hovered = false;
    var c3dDragging = false;
    var dragX = 0;
    var dragDist = 0;
    var frontIdx = -1;

    var modNames = cards.map(function(card) {
        var el = card.querySelector('.c-name');
        return el ? el.textContent.toUpperCase() : '';
    });

    cards.forEach(function(card, i) {
        card.style.transform = 'rotateY(' + (i * STEP) + 'deg) translateZ(' + RADIUS + 'px)';
    });

    function setPlayUI() {
        if (!c3dPlay) {
            return;
        }
        c3dPlay.classList.toggle('playing', autoPlay);
        c3dPlay.setAttribute('aria-pressed', autoPlay ? 'true' : 'false');
        c3dPlay.setAttribute('aria-label', autoPlay ? 'Pause rotation' : 'Resume rotation');
    }

    function pauseAuto() {
        if (!autoPlay) {
            return;
        }
        autoPlay = false;
        setPlayUI();
    }

    function snapAngle() {
        targetAngle = Math.round(targetAngle / STEP) * STEP;
    }

    function currentFront(a) {
        var n = cards.length;
        return ((Math.round(-a / STEP) % n) + n) % n;
    }

    function updateDeck(a) {
        var idx = currentFront(a);
        if (idx === frontIdx) {
            return;
        }
        frontIdx = idx;
        if (c3dStatus) {
            var href = cards[idx].getAttribute('data-href');
            c3dStatus.innerHTML = '<span>P-' + pad(idx + 1, 2) + ' <b>//</b> ' + modNames[idx] + '</span>' +
                (href ? '<a class="ext" href="' + href + '" target="_blank" rel="noopener">Open</a>' : '');
        }
        modBtns.forEach(function(b, k) {
            b.classList.toggle('active', k === idx);
        });
    }

    function focusModule(k) {
        pauseAuto();
        var desired = -k * STEP;
        var turns = Math.round((targetAngle - desired) / 360) * 360;
        targetAngle = turns + desired;
    }

    function c3dStepRot(dir) {
        if (!c3d) {
            return;
        }
        pauseAuto();
        snapAngle();
        targetAngle += dir * STEP;
    }

    /* depth cue on the faces: opacity or filter on the preserve-3d card itself would
       flatten it and break back-face hiding (mirrored text bleeding through) */
    var cardFaces = cards.map(function(card) {
        return Array.prototype.slice.call(card.querySelectorAll('.card-face'));
    });

    function applyDepth() {
        var i, rad, d, t, f;
        for (i = 0; i < cards.length; i++) {
            rad = (i * STEP + angle) * Math.PI / 180;
            d = (Math.cos(rad) + 1) / 2; /* 1 facing viewer, 0 facing away */
            t = (0.3 + 0.7 * d).toFixed(3);
            f = 'brightness(' + (0.55 + 0.45 * d).toFixed(3) + ')';
            cardFaces[i].forEach(function(face) {
                face.style.opacity = t;
                face.style.filter = f;
            });
        }
    }

    function spinLoop() {
        if (c3d && (activeBlock === 2 || !engineOn)) {
            if (autoPlay && !hovered && !c3dDragging && !mqReduce.matches) {
                targetAngle -= 0.26; /* ambient rotation speed */
                angle = targetAngle;
            } else {
                var ease = mqReduce.matches ? 1 : 0.09;
                angle += (targetAngle - angle) * ease;
                if (Math.abs(targetAngle - angle) < 0.01) {
                    angle = targetAngle;
                }
            }
            c3d.style.transform = 'rotateY(' + angle.toFixed(2) + 'deg)';
            applyDepth();
            updateDeck(angle);
        }
        window.requestAnimationFrame(spinLoop);
    }

    if (c3dStage) {
        c3dStage.addEventListener('mouseenter', function() {
            hovered = true;
        });
        c3dStage.addEventListener('mouseleave', function() {
            hovered = false;
        });

        /* pointer drag with snap on release */
        c3dStage.addEventListener('pointerdown', function(e) {
            c3dDragging = true;
            dragX = e.clientX;
            dragDist = 0;
            c3dStage.classList.add('dragging');
            pauseAuto();
            if (c3dStage.setPointerCapture) {
                c3dStage.setPointerCapture(e.pointerId);
            }
        });

        c3dStage.addEventListener('pointermove', function(e) {
            if (!c3dDragging) {
                return;
            }
            var dx = e.clientX - dragX;
            dragX = e.clientX;
            dragDist += Math.abs(dx);
            targetAngle += dx * 0.38;
            angle = targetAngle;
        });

        function endDrag() {
            if (!c3dDragging) {
                return;
            }
            c3dDragging = false;
            c3dStage.classList.remove('dragging');
            snapAngle();
        }

        c3dStage.addEventListener('pointerup', endDrag);
        c3dStage.addEventListener('pointercancel', endDrag);

        /* click a card to bring it to the front, ignored after a real drag */
        cards.forEach(function(card, i) {
            card.addEventListener('click', function() {
                if (dragDist > 6) {
                    return;
                }
                focusModule(i);
            });
        });

        window.requestAnimationFrame(spinLoop);
    }

    if (c3dPrev) {
        c3dPrev.addEventListener('click', function() {
            c3dStepRot(1);
        });
    }
    if (c3dNext) {
        c3dNext.addEventListener('click', function() {
            c3dStepRot(-1);
        });
    }

    if (c3dPlay) {
        c3dPlay.addEventListener('click', function() {
            autoPlay = !autoPlay;
            if (!autoPlay) {
                snapAngle();
            }
            setPlayUI();
        });
    }

    modBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            focusModule(parseInt(btn.getAttribute('data-mod'), 10));
        });
    });

    setPlayUI();

    /* ---------------------------------------------------------- */
    /* VENTURE TABS - instant swap, ember red active state         */
    /* ---------------------------------------------------------- */

    var tabData = {
        samani: {
            label: 'VENTURE // SAMANI VENTURES',
            value: '08 BOTS<br>01 HUMAN',
            sub: '<b>BIRYAR</b> OPERATIONS PLATFORM',
            copy: 'Online retail on Amazon and in our own store. Sourcing, pricing, inventory and customer support run through Biryar, and a human approves every action that moves money.',
            chips: ['AMAZON', 'SHOPIFY', 'RUNS ON BIRYAR'],
            links: [
                ['Visit the store', 'https://dsynq9-bg.myshopify.com/']
            ]
        },
        hydra: {
            label: 'VENTURE // HYDRATRADE',
            value: '00:00<br>UTC',
            sub: '<b>DAILY</b> MARKET-NEUTRAL REBALANCE',
            copy: 'A market-neutral crypto book that ranks a point-in-time universe of coins every day and trades the extremes unattended, behind a risk layer with a global kill switch.',
            chips: ['4 SLEEVES', 'MARKET-NEUTRAL', 'UNATTENDED'],
            links: [
                ['Read the report', 'https://loqmansamani.github.io/reports/crypto/']
            ]
        }
    };

    var tabBtns = Array.prototype.slice.call(document.querySelectorAll('.tab-btn'));
    var kLabel = document.getElementById('kinetic-label');
    var kValue = document.getElementById('kinetic-value');
    var kSub = document.getElementById('kinetic-sub');
    var tabCopy = document.getElementById('tab-copy-text');
    var tabMeta = document.getElementById('tab-meta');
    var tabLinks = document.getElementById('tab-links');

    function renderTab(key) {
        var d = tabData[key];
        if (!d) {
            return;
        }
        kLabel.textContent = d.label;
        kSub.innerHTML = d.sub;
        tabCopy.textContent = d.copy;
        tabMeta.innerHTML = d.chips.map(function(c) {
            return '<span class="tab-chip">' + c + '</span>';
        }).join('');
        tabLinks.innerHTML = d.links.map(function(l) {
            return '<a class="ext" href="' + l[1] + '" target="_blank" rel="noopener">' + l[0] + '</a>';
        }).join('');
        if (mqReduce.matches) {
            kValue.innerHTML = d.value;
            return;
        }
        kValue.classList.add('swap');
        window.setTimeout(function() {
            kValue.innerHTML = d.value;
            kValue.classList.remove('swap');
        }, 180);
    }

    tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (btn.classList.contains('active')) {
                return;
            }
            tabBtns.forEach(function(b) {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            renderTab(btn.getAttribute('data-tab'));
        });
    });

    /* ---------------------------------------------------------- */
    /* SCROLL REVEALS - IntersectionObserver with 3s fallback      */
    /* ---------------------------------------------------------- */

    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('on');
                    io.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.12
        });
        reveals.forEach(function(el) {
            io.observe(el);
        });
    }

    /* fallback for iframe previews and edge cases */
    window.setTimeout(function() {
        reveals.forEach(function(el) {
            el.classList.add('on');
        });
    }, 3000);

})();
