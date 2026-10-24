'use strict'
const $ = (s, c = document) => c.querySelector(s)
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s))
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const nf = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n))

/* ---------- CSRF: получаем токен при загрузке ---------- */
let csrfToken = ''
const loadCsrfToken = async () => {
  try {
    const res = await fetch('api/send-lead.php?action=token', {
      credentials: 'same-origin',
    })
    const data = await res.json()
    if (data.ok && data.token) {
      csrfToken = data.token
      const input = $('#csrfToken')
      if (input) input.value = csrfToken
    }
  } catch (e) {
    // Тихо — форма всё равно отправится, сервер отклонит без токена
    console.warn('CSRF token load failed', e)
  }
}
loadCsrfToken()

/* ---------- Header + bottom bar ---------- */
const header = $('#header')
const bottomBar = $('#bottomBar')
const onScroll = () => {
  const y = scrollY
  header.classList.toggle('is-stuck', y > 8)
  bottomBar.classList.toggle('is-visible', y > 420)
}
addEventListener('scroll', onScroll, { passive: true })
onScroll()

/* ---------- Drawer ---------- */
const burger = $('#burger')
const drawer = $('#drawer')
const overlay = $('#overlay')
const drawerClose = $('#drawerClose')
let lastFocused = null
const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

const openDrawer = () => {
  lastFocused = document.activeElement
  overlay.hidden = false
  drawer.hidden = false
  void drawer.offsetWidth
  overlay.classList.add('is-open')
  drawer.classList.add('is-open')
  drawer.setAttribute('aria-hidden', 'false')
  burger.setAttribute('aria-expanded', 'true')
  document.body.classList.add('is-locked')
  drawerClose.focus()
}
const closeDrawer = () => {
  overlay.classList.remove('is-open')
  drawer.classList.remove('is-open')
  drawer.setAttribute('aria-hidden', 'true')
  burger.setAttribute('aria-expanded', 'false')
  document.body.classList.remove('is-locked')
  const done = () => {
    drawer.hidden = true
    overlay.hidden = true
    drawer.removeEventListener('transitionend', done)
  }
  drawer.addEventListener('transitionend', done)
  if (lastFocused) lastFocused.focus()
}
if (burger)
  burger.addEventListener('click', () =>
    burger.getAttribute('aria-expanded') === 'true'
      ? closeDrawer()
      : openDrawer()
  )
if (drawerClose) drawerClose.addEventListener('click', closeDrawer)
if (overlay) overlay.addEventListener('click', closeDrawer)
$$('[data-drawer-close], .drawer__nav a', drawer).forEach((el) =>
  el.addEventListener('click', closeDrawer)
)
document.addEventListener('keydown', (e) => {
  if (!drawer.classList.contains('is-open')) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeDrawer()
    return
  }
  if (e.key === 'Tab') {
    const items = $$(FOCUSABLE, drawer).filter((el) => el.offsetParent !== null)
    if (!items.length) return
    const first = items[0],
      last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
})

const supportsScrollTimeline = CSS.supports('animation-timeline: view()');

if (!supportsScrollTimeline) {
  const revealEls = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            obs.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.1 }
    );
    revealEls.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
      io.observe(el);
    });
  }
}

/* ---------- Counters ---------- */
const animate = (el) => {
  const target = Number(el.dataset.count) || 0
  const start = performance.now(),
    dur = 1400
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1)
    const eased = 1 - Math.pow(1 - p, 3)
    el.firstChild.nodeValue = nf(target * eased)
    if (p < 1) requestAnimationFrame(step)
    else el.firstChild.nodeValue = nf(target)
  }
  requestAnimationFrame(step)
}
const counters = $$('[data-count]')
if (reduced || !('IntersectionObserver' in window)) {
  counters.forEach((el) => {
    el.firstChild.nodeValue = nf(el.dataset.count)
  })
} else {
  const cio = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animate(e.target)
          obs.unobserve(e.target)
        }
      })
    },
    { threshold: 0.5 }
  )
  counters.forEach((el) => cio.observe(el))
}

/* ---------- Reviews nav ---------- */
const track = $('#reviewsTrack')
const nav = $('#reviewsNav')
if (track && nav) {
  const slides = $$('.review', track)
  slides.forEach((_, i) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('aria-label', `Отзыв ${i + 1}`)
    b.addEventListener('click', () =>
      slides[i].scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        inline: 'start',
        block: 'nearest',
      })
    )
    nav.appendChild(b)
  })
  const dots = $$('button', nav)
  const setActive = (i) =>
    dots.forEach((d, j) => d.setAttribute('aria-current', String(j === i)))
  const rio = new IntersectionObserver(
    (es) => {
      es.forEach((e) => {
        if (e.intersectionRatio > 0.6) setActive(slides.indexOf(e.target))
      })
    },
    { root: track, threshold: [0.6] }
  )
  slides.forEach((s) => rio.observe(s))
  setActive(0)
}

/* ---------- Calculator ---------- */
const calcForm = $('#calcForm')
const calcState = {
  type: 'Косметический',
  rate: 6900,
  area: 55,
  extras: [],
  extrasLabels: [],
}

if (calcForm) {
  const areaInput = $('#area')
  const areaValue = $('#areaValue')
  const totalValue = $('#totalValue')
  const rateHint = $('#rateHint')
  const breakBase = $('#breakBase')
  const breakExtra = $('#breakExtra')
  const breakTotal = $('#breakTotal')

  // Скрытые поля для отправки на сервер
  const hType = $('#calcType')
  const hArea = $('#calcArea')
  const hTotal = $('#calcTotal')
  const hBase = $('#calcBase')
  const hExtra = $('#calcExtra')
  const hExtrasList = $('#calcExtrasList')

  const calc = () => {
    const checkedType = calcForm.querySelector('input[name="type"]:checked')
    const rate = Number(checkedType.value)
    const label = checkedType.dataset.label || ''
    calcState.type = label
    calcState.rate = rate

    const area = Number(areaInput.value)
    calcState.area = area

    const extras = $$('input[name="extra"]:checked', calcForm)
    const extrasPerM2 = extras.reduce((s, cb) => s + Number(cb.value), 0)
    calcState.extrasLabels = Array.from(extras)
      .map((cb) => cb.dataset.label || '')
      .filter(Boolean)

    const base = area * rate
    const extraTotal = area * extrasPerM2
    const total = base + extraTotal

    const pct =
      ((area - Number(areaInput.min)) /
        (Number(areaInput.max) - Number(areaInput.min))) *
      100
    areaInput.style.setProperty('--fill', pct + '%')
    areaValue.textContent = area
    totalValue.textContent = nf(total)
    breakBase.textContent = nf(base) + ' ₽'
    breakExtra.textContent = nf(extraTotal) + ' ₽'
    breakTotal.textContent = nf(total) + ' ₽'

    const n = extras.length
    rateHint.textContent =
      `${nf(rate)} ₽/м² · ${area} м² · ` +
      (n ? `доп. опций: ${n}` : 'без доп. опций')

    // Обновляем скрытые поля
    if (hType) hType.value = calcState.type
    if (hArea) hArea.value = area
    if (hTotal) hTotal.value = total
    if (hBase) hBase.value = base
    if (hExtra) hExtra.value = extraTotal
    if (hExtrasList)
      hExtrasList.value = calcState.extrasLabels.join(', ') || 'нет'
  }

  calcForm.addEventListener('input', calc)
  calcForm.addEventListener('change', calc)
  calc()
}

/* ---------- Кнопка "Зафиксировать цену" — скроллит к форме ---------- */
const calcToLead = $('#calcToLead')
if (calcToLead) {
  calcToLead.addEventListener('click', (e) => {
    e.preventDefault()
    const lead = $('#lead')
    if (!lead) return
    const top =
      lead.getBoundingClientRect().top +
      scrollY -
      (header?.offsetHeight || 0) -
      12
    scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
    // Подсветим форму на секунду
    const form = $('#leadForm')
    if (form) {
      form.animate(
        [
          { boxShadow: '0 0 0 0 rgba(181,203,184,0)' },
          { boxShadow: '0 0 0 6px rgba(181,203,184,.6)' },
          { boxShadow: '0 0 0 0 rgba(181,203,184,0)' },
        ],
        { duration: 1200, easing: 'ease-out' }
      )
    }
  })
}

/* ---------- FAQ accordion ---------- */
const faqItems = $$('.faq__item')
faqItems.forEach((item) =>
  item.addEventListener('toggle', () => {
    if (!item.open) return
    faqItems.forEach((o) => {
      if (o !== item) o.open = false
    })
  })
)

/* ---------- Phone mask ---------- */
const phone = $('#phone')
const fmt = (v) => {
  let d = v.replace(/\D/g, '')
  if (d.startsWith('8')) d = '7' + d.slice(1)
  if (!d.startsWith('7')) d = '7' + d
  d = d.slice(0, 11)
  const p = d.slice(1)
  let out = '+7'
  if (p.length) out += ` (${p.slice(0, 3)}`
  if (p.length >= 3) out += `) ${p.slice(3, 6)}`
  if (p.length >= 6) out += `-${p.slice(6, 8)}`
  if (p.length >= 8) out += `-${p.slice(8, 10)}`
  return out
}
if (phone) {
  phone.addEventListener('focus', () => {
    if (!phone.value) phone.value = '+7 ('
  })
  phone.addEventListener('input', () => {
    const atEnd = phone.selectionStart === phone.value.length
    phone.value = fmt(phone.value)
    if (atEnd) phone.setSelectionRange(phone.value.length, phone.value.length)
  })
  phone.addEventListener('blur', () => {
    if (phone.value.replace(/\D/g, '').length <= 1) phone.value = ''
  })
}

/* ---------- Lead form ---------- */
const leadForm = $('#leadForm')
const name = $('#name')
const consent = $('#consent')
const toast = $('#toast')
const toastText = $('#toastText')
let tTimer

const showToast = (msg, isError = false) => {
  toastText.textContent = msg
  toast.style.background = isError ? '#d33' : ''
  toast.style.color = isError ? '#fff' : ''
  toast.classList.add('is-visible')
  clearTimeout(tTimer)
  tTimer = setTimeout(() => toast.classList.remove('is-visible'), 4500)
}
const setErr = (input, msgEl, msg) => {
  input.classList.add('is-error')
  if (msg) msgEl.textContent = msg
  msgEl.style.display = 'block'
}
const clearErr = (input, msgEl) => {
  input.classList.remove('is-error')
  msgEl.style.display = 'none'
}

if (name) name.addEventListener('input', () => clearErr(name, $('#name-msg')))
if (phone)
  phone.addEventListener('input', () => clearErr(phone, $('#phone-msg')))
if (consent)
  consent.addEventListener('change', () => {
    $('#consent-msg').style.display = 'none'
  })

if (leadForm) {
  // Заполняем source_page
  const sourcePage = $('#sourcePage')
  if (sourcePage) sourcePage.value = location.href

  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    // Валидация на клиенте
    let ok = true
    if (!name || name.value.trim().length < 2) {
      if (name) setErr(name, $('#name-msg'), 'Укажите имя (минимум 2 символа)')
      ok = false
    } else {
      clearErr(name, $('#name-msg'))
    }

    const digits = phone ? phone.value.replace(/\D/g, '') : ''
    if (digits.length !== 11) {
      if (phone) setErr(phone, $('#phone-msg'), 'Введите номер полностью')
      ok = false
    } else {
      clearErr(phone, $('#phone-msg'))
    }

    if (!consent || !consent.checked) {
      $('#consent-msg').style.display = 'block'
      ok = false
    }

    if (!ok) return

    // CSRF
    const csrfInput = $('#csrfToken')
    if (!csrfInput || !csrfInput.value) {
      await loadCsrfToken()
    }

    const btn = leadForm.querySelector('button[type="submit"]')
    const orig = btn.innerHTML
    btn.disabled = true
    btn.style.opacity = '.7'
    btn.textContent = 'Отправляем…'

    try {
      const formData = new FormData(leadForm)

      const res = await fetch('api/send-lead.php', {
        method: 'POST',
        body: formData,
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.ok === false) {
        // Обрабатываем ошибки валидации
        if (data.errors) {
          if (data.errors.name && name)
            setErr(name, $('#name-msg'), data.errors.name)
          if (data.errors.phone && phone)
            setErr(phone, $('#phone-msg'), data.errors.phone)
          if (data.errors.consent) $('#consent-msg').style.display = 'block'
        }
        showToast(
          data.error ||
            'Не удалось отправить заявку. Позвоните: +7 915 127-73-73',
          true
        )
        return
      }

      // Успех
      leadForm.reset()
      if (phone) phone.value = ''
      // Пересчитаем калькулятор, чтобы скрытые поля обновились
      calcForm?.dispatchEvent(new Event('input'))
      showToast(data.message || 'Спасибо! Перезвоним в течение 15 минут.')

      // Отправляем событие в Яндекс.Метрику / GA (если подключены)
      if (typeof ym === 'function') {
        try {
          ym(0, 'reachGoal', 'lead_success')
        } catch (_) {}
      }
      if (typeof gtag === 'function') {
        try {
          gtag('event', 'generate_lead', { event_category: 'form' })
        } catch (_) {}
      }
      if (typeof dataLayer !== 'undefined') {
        dataLayer.push({ event: 'lead_success' })
      }
    } catch (err) {
      console.error(err)
      showToast('Ошибка сети. Позвоните: +7 915 127-73-73', true)
    } finally {
      btn.disabled = false
      btn.style.opacity = ''
      btn.innerHTML = orig
    }
  })
}

/* ---------- Smooth anchors ---------- */
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')
    if (!id || id === '#') return
    const t = document.querySelector(id)
    if (!t) return
    e.preventDefault()
    const top =
      t.getBoundingClientRect().top + scrollY - (header?.offsetHeight || 0) - 12
    scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
    t.setAttribute('tabindex', '-1')
    t.focus({ preventScroll: true })
  })
})

/* ---------- Year ---------- */
const yearEl = $('#year')
if (yearEl) yearEl.textContent = new Date().getFullYear()
