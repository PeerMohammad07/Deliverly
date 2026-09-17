(function () {
  "use strict";
  if (window.__deliverlyEtaInit) return;
  window.__deliverlyEtaInit = true;

  var ETA_URL = "/apps/delivery-estimate";
  var GID_RE = /^gid:\/\/shopify\/Product\/\S+$/;
  var NUM_RE = /^\d+$/;
  var cached = { productGid: null, productId: null, handle: null, source: null };
  var etaSeq = 0;
  var activeGid = null;

  function toGid(v) {
    if (typeof v === "number" && isFinite(v)) v = String(Math.floor(v));
    if (typeof v !== "string") return null;
    v = v.trim();
    if (!v) return null;
    if (GID_RE.test(v)) return v;
    if (NUM_RE.test(v)) return "gid://shopify/Product/" + v;
    return null;
  }
  function gidNum(gid) {
    var m = /^gid:\/\/shopify\/Product\/(\d+)\s*$/.exec(gid || "");
    return m ? m[1] : null;
  }
  function parseTag(tag) {
    var d = null;
    try {
      d = JSON.parse((tag && tag.textContent) || "");
    } catch (e) {
      return null;
    }
    var gid = toGid(d && (d.productGid || d.productId));
    if (!gid) return null;
    var num = d && d.productId != null ? String(d.productId).trim() : gidNum(gid);
    if (!NUM_RE.test(num || "")) num = gidNum(gid);
    var h = d && typeof d.handle === "string" ? d.handle.trim() || null : null;
    return { productGid: gid, productId: num, handle: h };
  }
  function readCtx() {
    var tags = document.querySelectorAll("[data-deliverly-product-context]");
    for (var i = 0; i < tags.length; i += 1) {
      var p = parseTag(tags[i]);
      if (p && p.productGid) return p;
    }
    return null;
  }
  function urlHandle() {
    var m = /\/products\/([^/?#]+)/.exec(window.location.pathname || "");
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch (e) {
      return m[1];
    }
  }
  function detect() {
    var ctx = readCtx();
    var uh = urlHandle();
    if (ctx && ctx.productGid) {
      if (uh && ctx.handle && uh !== ctx.handle)
        return { productGid: null, productId: null, handle: uh, source: null };
      return {
        productGid: ctx.productGid,
        productId: ctx.productId,
        handle: ctx.handle || uh,
        source: "liquid",
      };
    }
    return { productGid: null, productId: null, handle: uh, source: null };
  }
  function stamp(host, det) {
    if (!host || !host.setAttribute) return;
    if (det && det.productGid) {
      host.setAttribute("data-deliverly-product-gid", det.productGid);
      if (det.productId) host.setAttribute("data-deliverly-product-id", det.productId);
      else host.removeAttribute("data-deliverly-product-id");
    } else {
      host.removeAttribute("data-deliverly-product-gid");
      host.removeAttribute("data-deliverly-product-id");
    }
  }
  function refresh() {
    var next = detect();
    var changed = next.productGid !== cached.productGid;
    cached = next;
    var host = etaHost();
    if (host && host.isConnected) stamp(host, next);
    if (changed && typeof console !== "undefined" && console.debug)
      console.debug("[deliverly-eta] product detected", next.productGid);
    return next;
  }

  function etaHost() {
    return document.querySelector("[data-deliverly-eta]");
  }
  function setEtaState(host, st) {
    var inner = host ? host.querySelector(".deliverly-eta") : null;
    if (inner) inner.setAttribute("data-deliverly-eta-state", st);
  }
  function showLoading(host) {
    setEtaState(host, "loading");
    var inner = host ? host.querySelector(".deliverly-eta") : null;
    if (inner) inner.setAttribute("hidden", "");
    var d = host ? host.querySelector("[data-deliverly-eta-dates]") : null;
    if (d) d.textContent = "";
  }
  function showMessage(host, msg) {
    setEtaState(host, "ready");
    var inner = host ? host.querySelector(".deliverly-eta") : null;
    if (inner) inner.removeAttribute("hidden");
    var d = host ? host.querySelector("[data-deliverly-eta-dates]") : null;
    if (d) d.textContent = msg;
  }
  function dropFlight() {
    etaSeq += 1;
    activeGid = null;
  }
  function hideEta() {
    dropFlight();
    var host = etaHost();
    if (host) host.remove();
  }
  function loadEta(host, gid) {
    if (activeGid === gid) return;
    var my = (etaSeq += 1);
    activeGid = gid;
    showLoading(host);
    if (typeof fetch === "undefined") {
      hideEta();
      return;
    }
    fetch(ETA_URL + "?productId=" + encodeURIComponent(gid), { cache: "no-store" })
      .then(function (res) {
        if (!res || !res.ok) throw new Error("bad estimate");
        return res.json();
      })
      .then(function (data) {
        if (my !== etaSeq || (cached.productGid || "") !== gid) return;
        activeGid = null;
        var h = etaHost();
        if (!h || !h.isConnected) return;
        if (
          data &&
          data.enabled === true &&
          typeof data.message === "string" &&
          data.message.trim()
        ) {
          stamp(h, cached);
          showMessage(h, data.message);
        } else {
          hideEta();
        }
      })
      .catch(function () {
        if (my !== etaSeq) return;
        hideEta();
      });
  }

  var ROOT_SELECTORS = [
    'main section[id*="Product"]',
    'main section[id*="product"]',
    'main [id*="MainProduct"]',
    "main product-info",
    "main .product__info-container",
    "main .product--information",
    "main [data-product-container]",
    "main",
  ];
  var PRICE_SELECTORS = [
    ".price--large",
    ".price__container",
    "[data-price]",
    ".product-price",
    ".price",
  ];
  var FORM_SELECTORS = [
    'form[action*="/cart/add"]',
    "product-form",
    'form[action*="cart"]',
  ];

  function isProductPage() {
    if (readCtx()) return true;
    return /\/products\/[^/?#]+/.test(window.location.pathname || "");
  }
  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
  }
  function inOverlay(el) {
    return !!el.closest('dialog,[role="dialog"],[aria-modal="true"],cart-drawer,.drawer,.cart-drawer');
  }
  function firstVisible(root, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var nodes;
      try {
        nodes = root.querySelectorAll(selectors[i]);
      } catch (e) {
        continue;
      }
      for (var j = 0; j < nodes.length; j += 1) {
        var el = nodes[j];
        if (isVisible(el) && !inOverlay(el) && !el.closest("[data-deliverly-eta]")) return el;
      }
    }
    return null;
  }
  function findAnchor() {
    for (var i = 0; i < ROOT_SELECTORS.length; i += 1) {
      var root = null;
      try {
        root = document.querySelector(ROOT_SELECTORS[i]);
      } catch (e) {
        continue;
      }
      if (!root || !isVisible(root)) continue;
      var price = firstVisible(root, PRICE_SELECTORS);
      if (price) return { node: price, position: "after" };
      var form = firstVisible(root, FORM_SELECTORS);
      if (form) return { node: form, position: "before" };
      if (ROOT_SELECTORS[i] !== "main") return { node: root, position: "append" };
    }
    return null;
  }
  function buildInstance() {
    var tpl = document.querySelector("template[data-deliverly-eta-template]");
    if (!tpl || !tpl.content) return null;
    var host = document.createElement("div");
    host.setAttribute("data-deliverly-eta", "");
    stamp(host, cached);
    host.appendChild(tpl.content.cloneNode(true));
    showLoading(host);
    return host;
  }
  function place() {
    var existing = etaHost();
    if (existing && existing.isConnected) {
      stamp(existing, cached);
      return true;
    }
    if (existing) existing.remove();
    if (!isProductPage()) return false;
    var anchor = findAnchor();
    if (!anchor) return false;
    var node = buildInstance();
    if (!node || !anchor.node.parentNode) return false;
    if (anchor.position === "after")
      anchor.node.parentNode.insertBefore(node, anchor.node.nextSibling);
    else if (anchor.position === "before")
      anchor.node.parentNode.insertBefore(node, anchor.node);
    else anchor.node.appendChild(node);
    return true;
  }
  function syncEta() {
    refresh();
    var gid = cached.productGid;
    if (!gid || !isProductPage()) {
      hideEta();
      return;
    }
    if (!place()) {
      dropFlight();
      return;
    }
    var host = etaHost();
    if (host) loadEta(host, gid);
  }
  function patchHistory() {
    try {
      ["pushState", "replaceState"].forEach(function (m) {
        if (window.history && window.history[m] && !window.history[m].__deliverlyPatched) {
          var orig = window.history[m];
          var patched = function () {
            var r = orig.apply(this, arguments);
            window.setTimeout(syncEta, 0);
            return r;
          };
          patched.__deliverlyPatched = true;
          window.history[m] = patched;
        }
      });
    } catch (e) {
      if (window.console) console.debug("[deliverly-eta] history patch skipped", e);
    }
  }

  patchHistory();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function onReady() {
      document.removeEventListener("DOMContentLoaded", onReady);
      syncEta();
    });
  } else {
    syncEta();
  }
  document.addEventListener("shopify:section:load", syncEta);
  document.addEventListener("shopify:section:select", syncEta);
  document.addEventListener("shopify:section:deselect", syncEta);
  document.addEventListener("shopify:section:reorder", syncEta);
  window.addEventListener("focus", syncEta);
  window.addEventListener("popstate", syncEta);
})();
