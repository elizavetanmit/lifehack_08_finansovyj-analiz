(function () {
  'use strict';

  // Кнопка «Скопировать» у промтов. На адресе без https (и при открытии файла) работает запасной способ.
  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  document.querySelectorAll('.prompt').forEach(function (card) {
    var btn = card.querySelector('.copy');
    var text = card.querySelector('.prompt-text');
    if (!btn || !text) return;
    btn.hidden = false;
    btn.setAttribute('aria-live', 'polite');
    var timer;
    btn.addEventListener('click', function () {
      copy(text.textContent).then(function (ok) {
        btn.textContent = ok ? 'Скопировано' : 'Выдели вручную';
        btn.classList.toggle('is-done', ok);
        clearTimeout(timer);
        timer = setTimeout(function () {
          btn.textContent = 'Скопировать';
          btn.classList.remove('is-done');
        }, 2000);
      });
    });
  });

  // Сборка своего промта: ответы подставляются в текст прямо на странице, никуда не отправляются.
  // Без скрипта форма скрыта и виден обычный промт со скобками.
  function plural(raw) {
    var n = parseInt(raw, 10);
    if (String(n) !== raw) return raw;
    return n + (n % 10 === 1 && n % 100 !== 11 ? ' человека' : ' человек');
  }

  function answer(form, key) {
    var inputs = form.querySelectorAll('[name="' + key + '"]');
    var values = [];
    inputs.forEach(function (input) {
      if ((input.type === 'radio' || input.type === 'checkbox') && !input.checked) return;
      var value = input.type === 'checkbox' && inputs.length === 1 ? input.value : input.value.trim();
      if (value) values.push(value);
    });
    return values.join(', ');
  }

  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  document.querySelectorAll('form[data-gen]').forEach(function (form) {
    var card = form.nextElementSibling;
    var pre = card.querySelector('.prompt-text');
    var status = form.querySelector('.gen-status');
    form.hidden = false;
    card.hidden = true;
    card.querySelector('.prompt-label').textContent = 'Твой промт';

    var steps = form.querySelectorAll('.gen-step');
    if (steps.length) {
      var total = form.querySelector('.gen-progress');
      var recount = function () {
        var all = 0, done = 0;
        steps.forEach(function (step) {
          var fields = step.querySelectorAll('input[type="text"], textarea');
          var n = 0;
          fields.forEach(function (el) { if (el.value.trim()) n++; });
          all += fields.length; done += n;
          step.querySelector('.gen-count').textContent = n + ' из ' + fields.length;
        });
        total.textContent = 'Заполнено ' + done + ' из ' + all + '. Можно пропускать пункты: пустые места останутся в промте.';
      };
      form.addEventListener('input', recount);
      recount();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var missing = 0;
      pre.querySelectorAll('[data-slot]').forEach(function (slot) {
        var value = answer(form, slot.dataset.slot);
        if (value && slot.dataset.fmt === 'people') value = plural(value);
        slot.textContent = value || slot.dataset.empty;
        slot.classList.toggle('is-filled', Boolean(value) || 'optional' in slot.dataset);
        if (!value && !('optional' in slot.dataset)) missing++;
      });
      status.textContent = missing
        ? 'Промт готов. Пустые поля (' + missing + ') остались в тексте в скобках, их можно дописать в чате с ИИ.'
        : 'Промт готов, скопируй его.';
      card.hidden = false;
      card.scrollIntoView({ behavior: motion, block: 'start' });
      pre.focus({ preventScroll: true });
    });
  });

  // Форма заявки: без скрипта отправляется обычным способом, со скриптом остаётся на странице.
  var lead = document.getElementById('lead');
  if (lead) {
    var leadStatus = document.getElementById('lead-status');
    var say = function (text, bad) {
      leadStatus.textContent = text;
      leadStatus.classList.toggle('is-error', Boolean(bad));
    };
    var f = lead.elements;
    // Обязательные поля: ошибка пишется под самим полем, курсор переходит на первое незаполненное.
    var rules = [
      { field: f.name, ok: function () { return f.name.value.trim(); }, text: 'Напишите, как к вам обращаться.' },
      { field: f.contact, ok: function () { return f.contact.value.trim(); }, text: 'Напишите мессенджер, почту или телефон, чтобы я могла ответить.' },
      { field: f.consent, ok: function () { return f.consent.checked; }, text: 'Отметьте согласие, без него я не могу принять заявку.' }
    ];
    var mark = function (rule, bad) {
      var err = document.getElementById(rule.field.getAttribute('aria-describedby').split(' ').pop());
      if (bad) { rule.field.setAttribute('aria-invalid', 'true'); err.textContent = rule.text; err.hidden = false; }
      else { rule.field.removeAttribute('aria-invalid'); err.textContent = ''; err.hidden = true; }
    };
    rules.forEach(function (rule) {
      var clear = function () {
        if (rule.field.getAttribute('aria-invalid') === 'true' && rule.ok()) {
          mark(rule, false);
          if (rules.every(function (r) { return r.ok(); })) say('');
        }
      };
      rule.field.addEventListener('input', clear);
      rule.field.addEventListener('change', clear);
    });
    lead.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null;
      rules.forEach(function (rule) {
        var bad = !rule.ok();
        mark(rule, bad);
        if (bad && !first) first = rule.field;
      });
      if (first) { say('Не все обязательные поля заполнены, подсказки стоят под ними.', true); first.focus(); return; }
      var button = lead.querySelector('button[type="submit"]');
      button.disabled = true;
      say('Отправляю…');
      fetch(lead.action, { method: 'POST', body: new FormData(lead), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return { ok: false, message: '' }; }); })
        .then(function (data) {
          if (data.ok) { lead.reset(); say(data.message); }
          else say(data.message || 'Не получилось отправить. Напишите мне по ссылке под формой.', true);
        })
        .catch(function () { say('Не получилось отправить. Напишите мне по ссылке под формой.', true); })
        .then(function () { button.disabled = false; });
    });
  }

  // Вкладки: без скрипта все варианты просто идут подряд.
  var ua = navigator.userAgent;
  var device = /iPhone|iPad|Android/i.test(ua) ? 'phone' : /Mac/i.test(ua) ? 'mac' : 'win';

  document.querySelectorAll('[data-tabs]').forEach(function (box, n) {
    var list = box.querySelector('.tablist');
    var tabs = Array.prototype.slice.call(box.querySelectorAll('.tab'));
    var panels = Array.prototype.slice.call(box.querySelectorAll('.tabpanel'));
    list.hidden = false;
    list.setAttribute('role', 'tablist');
    box.classList.add('is-ready');

    tabs.forEach(function (tab, i) {
      tab.id = 'tab-' + n + '-' + i;
      tab.setAttribute('role', 'tab');
      panels[i].id = 'panel-' + n + '-' + i;
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', tab.id);
      tab.setAttribute('aria-controls', panels[i].id);
    });

    function select(i, focus) {
      tabs.forEach(function (tab, j) {
        var on = i === j;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + tabs.length) % tabs.length, true); }
      });
    });

    var start = tabs.findIndex(function (t) { return t.dataset.tab === device; });
    if (start < 0) start = /Mac/i.test(ua) ? tabs.findIndex(function (t) { return t.dataset.tab === 'mac'; }) : 0;
    select(Math.max(start, 0));
  });

  // Полоска прочитанного сверху страницы.
  var bar = document.querySelector('.progress span');
  if (bar) {
    var queued = false;
    var paint = function () {
      queued = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(window.scrollY / max, 1) : 0) + ')';
    };
    window.addEventListener('scroll', function () {
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  // Подсветка текущего раздела в боковом оглавлении.
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc-side a'));
  if (links.length && 'IntersectionObserver' in window) {
    var map = new Map();
    links.forEach(function (a) {
      var el = document.getElementById(a.getAttribute('href').slice(1));
      if (el) map.set(el, a);
    });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (a) { a.classList.remove('is-current'); });
          map.get(entry.target).classList.add('is-current');
        }
      });
    }, { rootMargin: '-15% 0px -75% 0px' });
    map.forEach(function (_, el) { observer.observe(el); });
  }

  // На телефоне оглавление закрывается после выбора раздела.
  var mobile = document.querySelector('.toc-mobile');
  if (mobile) {
    mobile.addEventListener('click', function (e) {
      if (e.target.closest('a')) mobile.open = false;
    });
  }
})();
