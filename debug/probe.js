// Dan vao Console cua tab chat.google.com. Chi doc DOM, khong sua gi.
(() => {
  const out = [];
  const btn = document.querySelector('[data-gchat-markread]');
  out.push('button found: ' + !!btn);
  if (btn) {
    const chain = [];
    let n = btn;
    for (let i = 0; n && n !== document.body && i < 12; i++, n = n.parentElement) {
      const role = n.getAttribute('role');
      const jsname = n.getAttribute('jsname');
      const aria = n.getAttribute('aria-label');
      chain.push(
        `<${n.tagName.toLowerCase()}${role ? ' role=' + role : ''}${jsname ? ' jsname=' + jsname : ''}${aria ? ' aria="' + aria.slice(0, 40) + '"' : ''}>`,
      );
    }
    out.push('chain: ' + chain.join(' < '));
  }

  const sels = ['[role="list"]', '[role="listitem"]', '[role="row"]', '[role="listbox"]', '[role="option"]', '[jsaction]', 'c-wiz'];
  out.push('counts: ' + sels.map((s) => `${s}=${document.querySelectorAll(s).length}`).join(' '));

  let scroller = btn;
  while (scroller && scroller !== document.body && scroller.scrollHeight <= scroller.clientHeight + 20) {
    scroller = scroller.parentElement;
  }
  if (!scroller || scroller === document.body) {
    out.push('scroller: khong tim thay');
  } else {
    out.push('scroller: ' + scroller.tagName.toLowerCase() + ' children=' + scroller.children.length);
    for (const child of [...scroller.children].slice(0, 3)) {
      const aria = (child.getAttribute('aria-label') || '').slice(0, 60);
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      out.push(`child <${child.tagName.toLowerCase()} role=${child.getAttribute('role')} aria="${aria}" text="${text}">`);
      out.push('html: ' + child.outerHTML.slice(0, 700));
    }
  }

  console.log(out.join('\n'));
  return 'ok, xem output o tren';
})();
