// Which language the page speaks. It never looks at the IP address and sends nothing: it reads the
// browser's own language list and, once someone picks a language, that choice, kept on this
// device only (localStorage; a private window keeps nothing, and that's fine).
// - The plain address (/) shows the language picked before; else the first in the browser's list
//   that QR has; else English. It moves before anything is drawn.
// - An address with a language in it (/de/) keeps that language, and offers the wanted one in a
//   single line, in that language, which can be closed.
// - The picker lists the languages the browser asks for first.
// The languages and their lines come from the page (written by tools/pages.py).
"use strict";

(() => {
  const KEY = "qr-language";
  const data = JSON.parse(document.getElementById("languages").textContent);
  const known = new Map(data.languages.map((language) => [language.code, language]));

  const remembered = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };
  const remember = (code) => {
    try {
      localStorage.setItem(KEY, code);
    } catch {
      // Storage is off: the choice lasts for this page only.
    }
  };
  const browserOrder = () => {
    const codes = [];
    for (const tag of navigator.languages || [navigator.language]) {
      const code = String(tag).toLowerCase().split("-")[0];
      if (known.has(code) && !codes.includes(code)) codes.push(code);
    }
    return codes;
  };

  const chosen = remembered();
  const wanted = known.has(chosen) ? chosen : browserOrder()[0] || "en";

  if (data.page === "en" && location.pathname === "/" && wanted !== "en") {
    location.replace(known.get(wanted).path);
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("language");
    const list = document.getElementById("language-list");
    for (const code of browserOrder().reverse()) {
      const item = list.querySelector(`[data-language="${code}"]`)?.closest("li");
      if (item) list.prepend(item);
    }

    const open = (yes) => {
      list.hidden = !yes;
      button.setAttribute("aria-expanded", String(yes));
    };
    button.addEventListener("click", () => open(list.hidden));
    document.addEventListener("click", (event) => {
      if (!list.hidden && !event.target.closest(".picker")) open(false);
    });
    list.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      open(false);
      button.focus();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Escape") open(false);
    });
    for (const link of list.querySelectorAll("a[data-language]"))
      link.addEventListener("click", () => remember(link.dataset.language));

    if (wanted === data.page) return;
    const offer = known.get(wanted);
    const also = Object.assign(document.createElement("p"), { className: "also", id: "also", lang: offer.code });
    const link = Object.assign(document.createElement("a"), { href: offer.path, hreflang: offer.code, textContent: offer.alsoIn });
    const close = Object.assign(document.createElement("button"), { type: "button", className: "also-close", textContent: "×" });
    close.setAttribute("aria-label", offer.close);
    link.addEventListener("click", () => remember(offer.code));
    // Closing the line is a choice too: this page's language.
    close.addEventListener("click", () => {
      remember(data.page);
      also.remove();
    });
    also.append(link, close);
    document.querySelector(".masthead").after(also);
  });
})();
