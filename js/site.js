/* FAM Towing — quote funnel, call tracking, popups */
(() => {
  'use strict';

  const CFG = {
    tel: '+14706002326',
    towbook: 'https://public.towbook.com/66Q6',
    // Optional: paste a form endpoint (Formspree, Basin, etc.) to ALSO get every
    // quote request by email. Leave blank and requests go out by text message.
    formEndpoint: '',
    // Google listing for FAM Towing LLC.
    placeId: 'ChIJ1QdDAAGt9YgRkrMPEdow3hk',
    // Optional: a Google Maps JavaScript API key (Places API enabled, restricted to
    // famtowing.com). When set, the newest Google reviews load live on the page.
    mapsKey: ''
  };

  document.documentElement.classList.add('js');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  // Pushes to dataLayer so Google Tag Manager / GA4 can count calls and quotes.
  const track = (event, data) => {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event }, data || {})); } catch (e) { /* ignore */ }
  };

  let engaged = false;

  /* ---------- Call + text click tracking ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.startsWith('tel:')) { engaged = true; track('call_click', { placement: a.dataset.loc || 'page' }); }
    else if (href.startsWith('sms:')) { engaged = true; track('text_click', { placement: a.dataset.loc || 'page' }); }
  });

  /* ---------- Header + nav ---------- */
  const hdr = $('.hdr');
  const floatCall = $('.float-call');
  const onScroll = () => {
    const y = window.scrollY;
    if (hdr) hdr.classList.toggle('scrolled', y > 10);
    if (floatCall) floatCall.classList.toggle('show', y > 560);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = $('.nav-toggle');
  const nav = $('#site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  /* ---------- Scroll-position fallback (in case IntersectionObserver is throttled) ---------- */
  const onView = [];   // [element, callback, marginPx]
  let ticking = false;
  const checkView = () => {
    ticking = false;
    const h = window.innerHeight;
    for (let i = onView.length - 1; i >= 0; i--) {
      const [el, cb, m] = onView[i];
      const r = el.getBoundingClientRect();
      if (r.top < h + m && r.bottom > -m) { onView.splice(i, 1); cb(); }
    }
  };
  const watch = (el, cb, m) => { onView.push([el, cb, m || 0]); };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(checkView); } }, { passive: true });
  window.addEventListener('load', checkView);
  setTimeout(checkView, 300);

  /* ---------- Reveal on scroll ---------- */
  const rev = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    rev.forEach((el) => io.observe(el));
    rev.forEach((el) => watch(el, () => el.classList.add('in'), -40));
  } else {
    rev.forEach((el) => el.classList.add('in'));
  }

  /* ---------- Dialog helpers ---------- */
  const openDialog = (d) => {
    if (!d) return;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  };
  const closeDialog = (d) => {
    if (!d || !d.open) return;
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  };
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); });
    $$('[data-close]', d).forEach((b) => b.addEventListener('click', () => closeDialog(d)));
  });

  /* ---------- Quote funnel ---------- */
  const quote = $('#quote');
  if (quote) {
    const form = $('form', quote);
    const steps = $$('.q-step', quote);
    const bar = $('.q-progress i', quote);
    const geoBtn = $('.q-geo', quote);
    const geoStatus = $('.q-geo-status', quote);
    const field = (n) => form.elements.namedItem(n);
    const val = (n) => ((field(n) && field(n).value) || '').trim();
    const checked = (n) => !!(field(n) && field(n).checked);
    const state = { service: '', vehicle: '', miles: '', area: '', coords: null };
    const P = window.FAM_PRICING || null;
    let priced = null;
    let cur = 0;

    const show = (i) => {
      cur = Math.max(0, Math.min(i, steps.length - 1));
      steps.forEach((s, n) => { s.hidden = n !== cur; });
      bar.style.width = Math.round(((cur + 1) / steps.length) * 100) + '%';
      const isTow = state.service === 'Tow';
      $('.q-dest', quote).hidden = !isTow;
      $('.q-tow', quote).hidden = !isTow;
      if (steps[cur].dataset.step === 'price') renderPrice();
      quote.scrollTop = 0;
      const h = $('h2', steps[cur]);
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    };
    const err = (msg) => { const e = $('.q-err', steps[cur]); if (e) e.textContent = msg || ''; };
    const setPick = (group, value) => {
      state[group] = value;
      $$('[data-pick="' + group + '"]', quote).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
    };
    const reset = () => {
      form.reset();
      state.coords = null;
      setPick('service', '');
      setPick('vehicle', '');
      setPick('miles', '');
      setPick('area', '');
      priced = null;
      geoStatus.textContent = '';
      geoStatus.classList.remove('ok');
      $$('.q-err', quote).forEach((e) => { e.textContent = ''; });
      $('.q-sent', quote).textContent = '';
      cur = 0;
    };
    const validate = () => {
      const step = steps[cur].dataset.step;
      err('');
      if (step === 'where' && !state.coords && !val('location')) {
        err('Tap "Use my location" or type where you are.');
        field('location').focus();
        return false;
      }
      if (step === 'where' && !state.coords && !state.area) {
        err('Pick the area you\u2019re in (or tap \u201cUse my current location\u201d) so we can price the drive to you.');
        return false;
      }
      if (step === 'where' && state.service === 'Tow' && !state.miles) {
        err('Pick about how far it\u2019s going so we can price it.');
        return false;
      }
      if (step === 'who' && val('phone').replace(/\D/g, '').length < 10) {
        err('We need a callback number (10 digits) in case the text doesn’t go through.');
        field('phone').focus();
        return false;
      }
      return true;
    };

    $$('[data-pick]', quote).forEach((b) => b.addEventListener('click', () => {
      setPick(b.dataset.pick, b.dataset.value);
      track('quote_step', { step: b.dataset.pick, value: b.dataset.value });
      if (b.dataset.pick === 'service') setTimeout(() => show(cur + 1), 150);
      else err('');
    }));
    $$('.q-back', quote).forEach((b) => b.addEventListener('click', () => show(cur - 1)));
    $$('.q-next', quote).forEach((b) => b.addEventListener('click', () => { if (validate()) show(cur + 1); }));

    if (geoBtn) {
      geoBtn.addEventListener('click', () => {
        if (!('geolocation' in navigator)) {
          geoStatus.textContent = 'Your browser can’t share location. Type it below instead.';
          return;
        }
        geoStatus.classList.remove('ok');
        geoStatus.textContent = 'Finding you…';
        geoBtn.disabled = true;
        navigator.geolocation.getCurrentPosition((p) => {
          state.coords = { lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) };
          const ft = Math.round(p.coords.accuracy * 3.28);
          geoStatus.textContent = 'Got you. Location pinned (within about ' + ft.toLocaleString() + ' ft).';
          geoStatus.classList.add('ok');
          geoBtn.disabled = false;
          err('');
        }, () => {
          geoStatus.textContent = 'Couldn’t get your location. Type an address, cross streets or highway exit below.';
          geoBtn.disabled = false;
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      });
    }

    const phone = field('phone');
    if (phone) {
      phone.addEventListener('input', () => {
        const d = phone.value.replace(/\D/g, '').replace(/^1/, '').slice(0, 10);
        phone.value = d.length > 6 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6)
          : d.length > 3 ? '(' + d.slice(0, 3) + ') ' + d.slice(3) : d;
      });
    }

    /* ----- instant price: hook-up + drive to you (en route) + loaded miles ----- */
    const money = (n) => '$' + Math.round(n).toLocaleString();
    const money2 = (n) => '$' + Number(n).toFixed(2).replace(/\.00$/, '');
    const radio = (n) => { const r = form.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : ''; };
    const roadMilesFromBase = () => {
      if (state.coords && P && P.base) {
        const R = 3958.8, rad = Math.PI / 180;
        const dLat = (state.coords.lat - P.base.lat) * rad, dLng = (state.coords.lng - P.base.lng) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(P.base.lat * rad) * Math.cos(state.coords.lat * rad) * Math.sin(dLng / 2) ** 2;
        return { mi: Math.round(2 * R * Math.asin(Math.sqrt(a)) * (P.base.road_factor || 1.25)), how: 'from your GPS location' };
      }
      if (state.area && P && P.areas && P.areas[state.area] !== undefined) return { mi: P.areas[state.area], how: 'from ' + state.area };
      return null;
    };
    const computePrice = () => {
      if (!P) return { call: true, why: 'Call for your price.' };
      const svc = P.services[state.service];
      if (!svc) return { call: true, why: 'Tell dispatch what the car is doing and they\u2019ll price it on the spot.' };
      if (state.vehicle === 'Tesla / EV' && state.service === 'Fuel delivery') return { call: true, why: 'Electric cars can\u2019t be refueled on the roadside. Call and we\u2019ll get it to a charger.' };
      if ((P.call_for_price || []).indexOf(state.vehicle) !== -1) return { call: true, why: (P.call_reason && P.call_reason[state.vehicle]) || 'This vehicle is priced by dispatch. One quick call.' };
      const M = P.medium || {};
      const isMed = (M.vehicles || []).indexOf(state.vehicle) !== -1;
      if (isMed && (M.no_service || []).indexOf(state.service) !== -1) return { call: true, why: 'Medium-duty lockouts are priced by dispatch. One quick call.' };
      const base = isMed ? (state.service === 'Tow' ? M.tow_base : M.road_base) : svc.base;
      const label = isMed && state.service === 'Tow' ? M.tow_label : svc.label + (isMed ? ' (medium duty)' : '');
      const lines = [[label, money(base)]];
      let lo = base, hi = base, note = '';
      const er = Object.assign({}, P.enroute || {}, isMed && M.enroute_per_mile ? { per_mile: M.enroute_per_mile } : {});
      const d = roadMilesFromBase();
      if (!d) return { call: true, why: 'We couldn\u2019t tell how far you are from our yard. One quick call and you\u2019ll have your price.' };
      const paid = Math.max(0, d.mi - (er.free_miles || 0));
      if (paid > 0) {
        const c = paid * (er.per_mile || 0);
        lines.push(['Drive to you (~' + d.mi + ' mi ' + d.how + ', first ' + er.free_miles + ' free, then ' + money2(er.per_mile) + '/mi)', money(c)]);
        lo += c; hi += c;
      } else {
        lines.push(['Drive to you (within ' + er.free_miles + ' free miles)', '$0']);
      }
      if (state.service === 'Tow') {
        let [a, b] = (state.miles || '0-5').split('-').map(Number);
        if (a < 0) { a = 0; b = 10; note = 'Priced for up to 10 loaded miles. Dispatch confirms the exact distance.'; }
        if (b > P.max_auto_miles) return { call: true, why: 'Long-distance tows get a custom price. One quick call.' };
        const inc = svc.included_miles || 0, per = svc.per_mile || 0;
        const xa = Math.max(0, a - inc) * per, xb = Math.max(0, b - inc) * per;
        lines.push(['To your drop-off (about ' + a + '\u2013' + b + ' mi, first ' + inc + ' free, then ' + money2(per) + '/mi)', xb === 0 ? '$0' : (xa === xb ? money(xb) : money(xa) + '\u2013' + money(xb))]);
        lo += xa; hi += xb;
        if (radio('rolls') === 'No') { lines.push(['Doesn\u2019t roll/steer (dollies or go-jacks)', 'dispatch confirms']); note = 'Dollies or go-jacks can add to the price. Dispatch confirms before rolling.'; }
        if (radio('keys') === 'No') { lines.push(['No key (steering/park lock may need go-jacks)', 'dispatch confirms']); note = 'Without a key the car may need go-jacks or skates to load. Dispatch confirms before rolling.'; }
      }
      if (checked('military')) lines.push(['Military discount', 'applied by dispatch']);
      return { lo: Math.round(lo), hi: Math.round(hi), lines, note };
    };
    const renderPrice = () => {
      priced = computePrice();
      const amt = $('.price-amt', quote), sub = $('.price-sub', quote), ul = $('.price-lines', quote);
      $('.q-price-lbl', quote).textContent = state.service ? state.service + (state.vehicle ? ' \u00b7 ' + state.vehicle : '') : 'Your job';
      ul.textContent = '';
      const svcInfo = P && P.services[state.service];
      const badge = $('.price-sample', quote);
      if (badge) badge.hidden = !!priced.call || !!(svcInfo && svcInfo.confirmed);
      amt.classList.toggle('call', !!priced.call);
      if (priced.call) {
        amt.textContent = 'Quick call for price';
        sub.textContent = priced.why;
      } else {
        amt.textContent = priced.lo === priced.hi ? money(priced.lo) : money(priced.lo) + '\u2013' + money(priced.hi);
        sub.textContent = priced.note || (priced.lo === priced.hi ? 'Your cash price. Nothing hidden.' : 'Your cash price range. Dispatch confirms the exact miles.');
        priced.lines.forEach(([k, v]) => {
          const li = document.createElement('li');
          const a = document.createElement('span'); a.textContent = k;
          const b = document.createElement('b'); b.textContent = v;
          li.append(a, b); ul.appendChild(li);
        });
      }
      track('quote_price_shown', { service: state.service, price: priced.call ? 'call' : priced.lo + '-' + priced.hi });
    };

    const buildMessage = () => {
      const lines = ['FAM Towing request'];
      if (checked('unsafe')) lines.push('URGENT: stopped in an unsafe spot');
      lines.push('Service: ' + (state.service || 'Not sure yet'));
      const veh = [state.vehicle, val('vehicleDetail')].filter(Boolean).join(' - ');
      if (veh) lines.push('Vehicle: ' + veh);
      if (val('location')) lines.push('Location: ' + val('location'));
      if (state.coords) lines.push('GPS: https://maps.google.com/?q=' + state.coords.lat + ',' + state.coords.lng);
      if (state.area) lines.push('Area: ' + state.area);
      if (state.service === 'Tow') {
        if (val('dest')) lines.push('Tow to: ' + val('dest'));
        if (state.miles) lines.push('Loaded distance: ' + (state.miles.charAt(0) === '-' ? 'not sure' : state.miles.replace('-', '\u2013') + ' mi'));
        lines.push('Keys: ' + (radio('keys') || '?') + ' | Rolls/steers: ' + (radio('rolls') || '?') + ' | AWD/4x4: ' + (radio('awd') || '?'));
      }
      if (priced && !priced.call) lines.push('Price shown online: ' + (priced.lo === priced.hi ? money(priced.lo) : money(priced.lo) + '\u2013' + money(priced.hi)));
      if (val('custName')) lines.push('Name: ' + val('custName'));
      lines.push('Callback: ' + val('phone'));
      if (checked('military')) lines.push('Military discount: yes');
      return lines.join('\n');
    };

    const finish = () => {
      const msg = buildMessage();
      $('.q-summary', quote).textContent = msg;
      $('.q-sms', quote).href = 'sms:' + CFG.tel + '?&body=' + encodeURIComponent(msg);
      const copy = $('.q-copy', quote);
      if (copy) copy.textContent = 'Copy request';
      show(steps.length - 1);
      engaged = true;
      track('quote_submit', { service: state.service || 'unknown' });
      if (CFG.formEndpoint) {
        const st = $('.q-sent', quote);
        st.textContent = 'Sending to dispatch…';
        fetch(CFG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: 'Website tow request: ' + (state.service || 'not sure'),
            service: state.service, name: val('custName'), phone: val('phone'), message: msg
          })
        }).then((r) => {
          st.textContent = r.ok ? 'Sent. Dispatch will call you back. Text or call below to move even faster.'
            : 'Couldn’t send online. Tap “Text this to dispatch” below.';
        }).catch(() => { st.textContent = 'Couldn’t send online. Tap “Text this to dispatch” below.'; });
      }
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;
      if (steps[cur].dataset.step === 'who') finish();
      else if (steps[cur].dataset.step !== 'done') show(cur + 1);
    });

    const copyBtn = $('.q-copy', quote);
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('.q-summary', quote).textContent); copyBtn.textContent = 'Copied'; }
        catch (e) { copyBtn.textContent = 'Select the text above to copy it'; }
      });
    }

    const openQuote = (service) => {
      if (steps[cur].dataset.step === 'done') reset();
      closeDialog($('#stay'));
      openDialog(quote);
      if (service) { setPick('service', service); show(1); } else show(cur);
      engaged = true;
      track('quote_open', { service: service || '' });
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-quote]');
      if (!b) return;
      e.preventDefault();
      openQuote(b.dataset.service || '');
    });
    if (location.hash === '#quote' || $('[data-autoquote]')) openQuote('');
  }

  /* ---------- "Before you go" popup ---------- */
  const stay = $('#stay');
  if (stay && !session.get('fam_stay')) {
    const start = Date.now();
    const fire = () => {
      if (session.get('fam_stay') || engaged || $('dialog[open]')) return;
      session.set('fam_stay', '1');
      openDialog(stay);
      track('exit_popup_view');
    };
    // Desktop only: fires when the mouse heads for the tab bar / close button.
    // Never on phones, where someone may be stranded and just needs the number.
    document.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget && e.clientY <= 0 && Date.now() - start > 8000) fire();
    });
  }

  /* ---------- Photo lightbox ---------- */
  const lb = $('#lb');
  const shots = $$('[data-shot]');
  if (lb && shots.length) {
    const img = $('img', lb);
    const cap = $('.lb-cap', lb);
    const sub = $('.lb-sub', lb);
    let at = 0;
    const go = (i) => {
      at = (i + shots.length) % shots.length;
      const s = shots[at];
      img.src = s.dataset.shot;
      img.alt = s.dataset.alt || '';
      cap.textContent = s.dataset.cap || '';
      sub.textContent = (at + 1) + ' of ' + shots.length;
    };
    shots.forEach((s, i) => s.addEventListener('click', () => { go(i); openDialog(lb); track('photo_open', { photo: s.dataset.cap || '' }); }));
    $('.lb-prev', lb).addEventListener('click', () => go(at - 1));
    $('.lb-next', lb).addEventListener('click', () => go(at + 1));
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(at - 1);
      if (e.key === 'ArrowRight') go(at + 1);
    });
    let sx = null;
    lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) go(at + (dx < 0 ? 1 : -1));
      sx = null;
    });
  }

  /* ---------- Live Google reviews (only when a Maps key is set) ---------- */
  const revBox = $('#g-reviews');
  if (revBox && CFG.mapsKey && 'IntersectionObserver' in window) {
    const stars = (n) => '★★★★★'.slice(0, Math.round(n || 5));
    const load = async () => {
      try {
        await new Promise((res, rej) => {
          window.__famMapsReady = res;
          const s = document.createElement('script');
          s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(CFG.mapsKey) + '&v=weekly&loading=async&callback=__famMapsReady';
          s.async = true;
          s.onerror = rej;
          document.head.appendChild(s);
        });
        const { Place } = await google.maps.importLibrary('places');
        const place = new Place({ id: CFG.placeId });
        await place.fetchFields({ fields: ['rating', 'userRatingCount', 'reviews'] });
        const list = (place.reviews || []).slice(0, 6);
        if (place.rating) $$('[data-g-rating]').forEach((el) => { el.textContent = place.rating.toFixed(1); });
        if (place.userRatingCount) $$('[data-g-count]').forEach((el) => { el.textContent = place.userRatingCount; });
        if (!list.length) return;
        revBox.textContent = '';
        list.forEach((r) => {
          const card = document.createElement('article');
          card.className = 'rev';
          const st = document.createElement('span');
          st.className = 'stars';
          st.setAttribute('aria-label', (r.rating || 5) + ' out of 5 stars');
          st.textContent = stars(r.rating);
          const p = document.createElement('p');
          const txt = (r.text || '').trim();
          p.textContent = txt.length > 280 ? txt.slice(0, 277).trimEnd() + '…' : txt;
          const who = document.createElement('div');
          who.className = 'rev-who';
          const a = r.authorAttribution || {};
          if (a.photoURI) { const im = document.createElement('img'); im.src = a.photoURI; im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; who.appendChild(im); }
          const nm = document.createElement(a.uri ? 'a' : 'span');
          nm.textContent = a.displayName || 'Google user';
          if (a.uri) { nm.href = a.uri; nm.target = '_blank'; nm.rel = 'noopener'; }
          who.appendChild(nm);
          if (r.relativePublishTimeDescription) who.appendChild(document.createTextNode(' · ' + r.relativePublishTimeDescription + ' on Google'));
          card.append(st, p, who);
          revBox.appendChild(card);
        });
        const note = document.createElement('p');
        note.className = 'rev-note';
        note.textContent = 'Reviews load live from Google.';
        revBox.appendChild(note);
      } catch (e) { /* keep the built-in summary */ }
    };
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '400px' });
    io.observe(revBox);
  }
  /* ---------- Leave-a-review flow (on site -> Google / Facebook) ---------- */
  const rv = $('#review');
  if (rv) {
    const rsteps = $$('.rv-step', rv);
    const rbar = $('.q-progress i', rv);
    const txt = $('textarea[name="rvtext"]', rv);
    let rating = 0, rcur = 0;
    const rshow = (i) => {
      rcur = Math.max(0, Math.min(i, rsteps.length - 1));
      rsteps.forEach((s, n) => { s.hidden = n !== rcur; });
      rbar.style.width = Math.round(((rcur + 1) / rsteps.length) * 100) + '%';
      $('.rv-sorry', rv).hidden = !(rating && rating <= 3);
      const rt = $('.rv-text', rv); if (rt) rt.textContent = (txt.value || '').trim() || 'Add a few words on the last step, or write it straight on Google.';
      const h = $('h2', rsteps[rcur]); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    };
    const copyReview = async () => {
      const out = $('.rv-copied', rv);
      const t = (txt.value || '').trim();
      if (!t) { out.textContent = ''; return; }
      try { await navigator.clipboard.writeText(t); out.textContent = 'Review copied. Just paste it on Google.'; }
      catch (e) { out.textContent = 'Press and hold your review above to copy it, then paste it on Google.'; out.classList.add('warn'); }
    };
    $$('.rv-star', rv).forEach((b) => {
      b.addEventListener('mouseenter', () => $$('.rv-star', rv).forEach((x) => x.classList.toggle('on', +x.dataset.star <= +b.dataset.star)));
      b.addEventListener('mouseleave', () => $$('.rv-star', rv).forEach((x) => x.classList.toggle('on', +x.dataset.star <= rating)));
      b.addEventListener('click', () => {
        rating = +b.dataset.star;
        $$('.rv-star', rv).forEach((x) => { x.classList.toggle('on', +x.dataset.star <= rating); x.setAttribute('aria-checked', String(x === b)); });
        track('review_rating', { rating });
        setTimeout(() => rshow(1), 220);
      });
    });
    $$('.rv-chips .chip', rv).forEach((c) => c.addEventListener('click', () => {
      const line = c.dataset.line;
      const on = c.getAttribute('aria-pressed') !== 'true';
      c.setAttribute('aria-pressed', String(on));
      let t = txt.value.trim();
      t = on ? (t ? t + ' ' : '') + line : t.replace(line, '').replace(/\s{2,}/g, ' ').trim();
      txt.value = t;
    }));
    $('.rv-back', rv).addEventListener('click', () => rshow(0));
    $('.rv-copy', rv).addEventListener('click', copyReview);
    $('.rv-next', rv).addEventListener('click', () => { copyReview(); rshow(2); track('review_written', { rating }); });
    $('.rv-google', rv).addEventListener('click', () => { copyReview(); track('review_google_click', { rating }); });
    $('.rv-fb', rv).addEventListener('click', () => { copyReview(); track('review_facebook_click', { rating }); });
    const openReview = () => { closeDialog($('#stay')); openDialog(rv); rshow(rcur === 2 ? 2 : (rating ? 1 : 0)); engaged = true; };
    document.addEventListener('click', (e) => { const b = e.target.closest('[data-review]'); if (!b) return; e.preventDefault(); openReview(); });
    if (location.hash === '#review' || $('[data-autoreview]')) openReview();
  }

  /* ---------- Instagram posts: load Instagram's embed script only when scrolled near ---------- */
  const ig = $('[data-ig]');
  if (ig) {
    let igLoaded = false;
    const loadIG = () => {
      if (igLoaded) return;
      igLoaded = true;
      if (window.instgrm) { window.instgrm.Embeds.process(); return; }
      const sc = document.createElement('script');
      sc.src = 'https://www.instagram.com/embed.js';
      sc.async = true;
      document.body.appendChild(sc);
    };
    watch(ig, loadIG, 600);
    checkView();
  }
})();
