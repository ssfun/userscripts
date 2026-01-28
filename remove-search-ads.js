// ==UserScript==
// @name             Remove Search ADS
// @description        Google Baidu Sogou Shenma 360 Bing Toutiao Douyin search ad removal, compatible with computers and mobile phones, Google search blocks some content squares
// @author             sfun
// @version            1.0.0
// @match             *://www.google.co.jp/*
// @match             *://www.google.com.hk/*
// @match             *://www.google.com/*
// @match             *://m.baidu.com/*
// @match             *://www.baidu.com/*
// @match             *://m.sm.cn/*
// @match             *://yz.m.sm.cn/*
// @match             *://wap.sogou.com/*
// @match             *://m.sogou.com/*
// @match             *://www.sogou.com/*
// @match             *://www.so.com/*
// @match             *://m.so.com/*
// @match             *://s.cn.bing.net/*
// @match             *://*.bing.com/*
// @match             *://so.toutiao.com/*
// @match             *://so.douyin.com/*
// @grant              GM_addStyle
// @run-at             document-end
// @noframes
// @require            https://cdn.jsdelivr.net/npm/@adguard/extended-css@2.1.1/dist/extended-css.min.js
// @namespace        https://github.com/ssfun/userscripts
// @source            https://github.com/ssfun/userscripts
// @copyright          GPL-3.0
// @license            GPL-3.0
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/remove-search-ads.js
// @updateURL https://github.com/ssfun/userscripts/raw/refs/heads/main/remove-search-ads.js
// ==/UserScript==

(function (cat) {
  "use strict";

  function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  }

  const userConfig = {
    css: " {display: none !important;width: 0 !important;height: 0 !important;} ",
    timeout: 10000,
    tryCount: 5,
    tryTimeout: 500,
  };
  const defaultRules = `
! 不支持的规则和开头为 ! 的行会忽略
!
! 由于语法限制，此处规则中
! 一个反斜杠需要改成两个，像这样 \\
www.google.com,www.google.com.hk,www.google.co.jp##div.MjjYud:has([href*='%E2%9C%94%EF%B8%8F%E2%96%9B']),div.MjjYud:has([href*='%E3%80%90%E2%9C%94%EF%B8%8F']),div.MjjYud:has([href*='%E2%9E%BF%E3%80%91']),div.MjjYud:has([href*='%E2%8F%AA%29']),div.MjjYud:has([href*='%E2%9A%BD%E3%80%91']),div.MjjYud:has([href*='-%E3%80%90']),div.MjjYud:has([href*='%E2%9C%94%EF%B8%8F'][href*='%E2%98%80%EF%B8%8F']),div.MjjYud:has([href*='-('][href*='%E2%9C%94%EF%B8%8F']),div.MjjYud:has([href*='%E2%9C%94%EF%B8%8F%29']),div.MjjYud:has([href*='-%E2%9C%94%EF%B8%8F']),div.MjjYud:has([href*='%E2%9C%94%EF%B8%8F']),div.MjjYud:has([href*='%E2%9C%85%EF%B8%8F']),div.MjjYud:has([href*='%E2%9E%A1%EF%B8%8F']),div.MjjYud:has([href*='%E2%AD%90']),div.MjjYud:has([href*='%E3%8A%99%EF%B8%8F'])

so.com##.tg-wrap-async
so.com##.res-mediav
so.com##.e_result
so.com##.c-title-tag
so.com##DIV.res-mediav-right
so.com##DIV.inner_left
so.com###so-activity-entry
so.com##DIV.tg-wrap
baidu.com##.ad-wrapper
baidu.com#?#.ec_wise_ad
sogou.com##.pc-brand-wrapper
sogou.com##.ips-overwrite-width
sogou.com##.qb-download-banner-non-share
##DIV[data-text-ad]
##.ad-block
www.baidu.com##.result-op[tpl="right_game_recommend"]
www.baidu.com##div[id$="_canvas"]
www.baidu.com##style[id*="s-m"] + div[id^="m"]
www.baidu.com#?##content_left > div:not([class]) > div[data-placeid]
www.baidu.com#?##content_right > table > tbody > tr > td > div:not(#con-ar):not([class])
www.baidu.com#?#div:not([id]) > style[id^="s-"] + div[id]
www.baidu.com#?##content_left > [style*="important"]
www.baidu.com#?#div[id$="_canvas"]
www.baidu.com#?#.c-container:-abp-has(.t > a[data-landurl])
baidu.com##[class='result c-container new-pmd'][id='1'][tpl='se_com_default'][data-click='{']
baidu.com###content_right > table > tbody > tr > td > div:not(#con-ar):not([class])
baidu.com##.cos-rich-video-player-video
baidu.com##.result-op[tpl='sp_hot_sale']
baidu.com##DIV#relativewords.se-relativewords.c-container.se-relativewords-new.c-bg-color-white
m.sm.cn##DIV.ad-alert-info
##.se-recommend-word-list-container
###se-recommend-word-list-container
##[class*="ball-wrapper"]
baidu.com##DIV#page-copyright.se-page-copyright[style='margin-bottom: 50px;']
baidu.com##DIV[style^='position: fixed; bottom: 0px; left: 0px; z-index: 300; width: 100%; height: 52px; background: rgb(255, 255, 255);']
##[ad_dot_url*="http"]
##.dl-banner-without-logo
##.ad_result
##[class="result c-container new-pmd"][id="1"][tpl="se_com_default"][data-click="{"]
##.biz_sponsor
##.b_algospacing
##[onmousedown*="ad"][h*="Ads"]
cn.bing.com,cn.bing.net##.b_bza_pole
bing.com,cn.bing.net##li:has(a[h$=",Ads"])
bing.com,cn.bing.net##.b_algo:has([tabindex="0"][role="link"])
bing.com,cn.bing.net##.b_algo:has(.b_ads1line)
bing.com,cn.bing.net##.b_ans:has([class^="xm_"][class*="_ansCont"])
bing.com,cn.bing.net##.pa_sb
bing.com,cn.bing.net##.adsMvC
bing.com,cn.bing.net##.pa_sb
bing.com,cn.bing.net##a[h$=",Ads"]
bing.com,cn.bing.net##a[href*="/aclick?ld="]
bing.com,cn.bing.net##.b_algo:has(.rms_img[src*="/th?id=OADD2."][src$="21.2"])
bing.com,cn.bing.net##.b_algo:has(.rms_img[src*="=AdsPlus"])
bing.com,cn.bing.net##li.b_ad
bing.com,cn.bing.net##.ad_sc
so.toutiao.com##DIV[id^='ad_']
so.douyin.com##[class*='h5-ad-']
so.douyin.com##[class^='layout-']
so.douyin.com##X-VIEW.inner.PrimaryBG-light
##[href^='http://yz.m.sm.cn/adclick']
`;

  const CRRE =
      /^(\[\$domain=)?(~?[\w-]+(?:\.[\w-]+)*(?:\.[\w-]+|\.\*)(?:(?:,|\|)~?[\w-]+(?:\.[\w-]+)*(?:\.[\w-]+|\.\*))*)?(?:])?(#@?\$?\??#)([^\s^+].*)/,
    CRFlags = ["##", "#@#", "#?#", "#@?#", "#$#", "#@$#", "#$?#", "#@$?#"],
    styleBoxes = ["genHideCss", "genExtraCss", "spcHideCss", "spcExtraCss"],
    dataBoxes = ["selectors", "extSelectors", "styles", "extStyles"];
  function makeRuleBox() {
    return {
      black: [],
      white: [],
    };
  }
  function domainChecker(domains) {
    const results = [],
      invResults = [],
      currDomain = location.hostname,
      urlSuffix = /\.+?[\w-]+$/.exec(currDomain);
    let totalResult = [0, false],
      black = false,
      white = false,
      match = false;
    domains.forEach((domain) => {
      const invert = domain[0] === "~";
      if (invert) domain = domain.slice(1);
      if (domain.endsWith(".*") && Array.isArray(urlSuffix)) {
        domain = domain.replace(".*", urlSuffix[0]);
      }
      const result = currDomain.endsWith(domain);
      if (invert) {
        if (result) white = true;
        invResults.push([domain.length, !result]);
      } else {
        if (result) black = true;
        results.push([domain.length, result]);
      }
    });
    if (results.length > 0 && !black) {
      match = false;
    } else if (invResults.length > 0 && !white) {
      match = true;
    } else {
      results.forEach((r) => {
        if (r[0] >= totalResult[0] && r[1]) {
          totalResult = r;
        }
      });
      invResults.forEach((r) => {
        if (r[0] >= totalResult[0] && !r[1]) {
          totalResult = r;
        }
      });
      match = totalResult[1];
    }
    return [match, results.length === 0];
  }
  function hasSome(str, arr) {
    return arr.some((word) => str.includes(word));
  }
  function ruleSpliter(rule) {
    const group = rule.match(CRRE);
    if (group) {
      const [, isDomain, place = "*", flag, sel] = group,
        type = CRFlags.indexOf(flag),
        matchResult =
          place === "*"
            ? [true, true]
            : domainChecker(place.split(isDomain ? "|" : ","));
      if (sel && matchResult[0]) {
        return {
          black: type % 2 ? "white" : "black",
          type: Math.floor(type / 2),
          place: (isDomain ? "|" : "") + place,
          generic: matchResult[1],
          sel,
        };
      }
    }
  }
  function ruleLoader(rule) {
    if (
      hasSome(rule, [
        ":matches-path(",
        ":min-text-length(",
        ":watch-attr(",
        ":-abp-properties(",
        ":matches-property(",
      ])
    )
      return;
    // 去掉开头末尾空格
    rule = rule.trim();
    // 如果 #$# 不包含 {} 就排除
    // 可以尽量排除 Snippet Filters
    if (
      /(?:\w|\*|]|^)#\$#/.test(rule) &&
      !/{\s*[a-zA-Z-]+\s*:\s*.+}\s*$/.test(rule)
    )
      return;
    // ## -> #?#
    if (
      /(?:\w|\*|]|^)#@?\$?#/.test(rule) &&
      hasSome(rule, [
        ":has(",
        ":-abp-has(",
        "[-ext-has=",
        ":has-text(",
        ":contains(",
        ":-abp-contains(",
        "[-ext-contains=",
        ":matches-css(",
        "[-ext-matches-css=",
        ":matches-css-before(",
        "[-ext-matches-css-before=",
        ":matches-css-after(",
        "[-ext-matches-css-after=",
        ":matches-attr(",
        ":nth-ancestor(",
        ":upward(",
        ":xpath(",
        ":remove()",
        ":not(",
      ])
    ) {
      rule = rule.replace(/(\w|\*|]|^)#(@?\$?)#/, "$1#$2?#");
    }
    // :style(...) 转换
    // example.com#?##id:style(color: red)
    // example.com#$?##id { color: red }
    if (rule.includes(":style(")) {
      rule = rule
        .replace(/(\w|\*|]|^)#(@?)(\??)#/, "$1#$2$$$3#")
        .replace(/:style\(\s*/, " { ")
        .replace(/\s*\)$/, " }");
    }
    return ruleSpliter(rule);
  }
  function ruleToCss(rule, preset) {
    var _a, _b;
    const isStyle = /}\s*$/.test(rule.sel);
    return [
      `/* ${rule.type}${rule.place} */ ${
        rule.sel + (!isStyle ? preset : "")
      } \n`,
      isStyle
        ? (_b =
            (_a = rule.sel.match(/^(.+?)\s*{\s*[a-zA-Z-]+\s*:\s*.+}\s*$/)) ===
              null || _a === void 0
              ? void 0
              : _a[1]) !== null && _b !== void 0
          ? _b
          : rule.sel
        : rule.sel,
    ];
  }

  const data = {
    disabled: false,
    saved: false,
    update: true,
    updating: false,
    receivedRules: "",
    customRules: defaultRules,
    allRules: "",
    genHideCss: "",
    genExtraCss: "",
    spcHideCss: "",
    spcExtraCss: "",
    selectors: makeRuleBox(),
    extSelectors: makeRuleBox(),
    styles: makeRuleBox(),
    extStyles: makeRuleBox(),
    bRules: [],
    appliedLevel: 0,
    appliedCount: 0,
    isFrame: cat.unsafeWindow.self !== cat.unsafeWindow.top,
    isClean: false,
    mutex: "__lemon__abp__parser__$__",
    preset: getUserConfig("css"),
    timeout: getUserConfig("timeout"),
    xTimeout: 1000,
    tryCount: getUserConfig("tryCount"),
    tryTimeout: getUserConfig("tryTimeout"),
  };
  function getUserConfig(prop) {
    {
      return userConfig[prop];
    }
  }
  function addStyle(css, pass = 0) {
    let el;
    if (pass >= data.tryCount) return;
    if (typeof cat.GM_addStyle == "function") {
      el = cat.GM_addStyle(css);
    } else {
      el = document.createElement("style");
      el.textContent = css;
      document.documentElement.appendChild(el);
    }
    if (typeof el == "object" && (!el || !document.documentElement.contains(el))) {
      setTimeout(() => {
        addStyle(css, pass + 1);
      }, data.tryTimeout);
    }
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      obj[key] = value;
    }
    return obj;
  }
  function canApplyCss(type) {
    return (
      (data.appliedLevel & (type >= 2 ? 2 : 1)) == 0 &&
      data[styleBoxes[type]].length > 0
    );
  }

  function getCustomRules(saveHash) {
    return __awaiter(this, void 0, void 0, function* () {
      return yield Promise.resolve(String(saveHash));
    });
  }
  function initRules(apply) {
    let abpRules = {};
    data.receivedRules = "";
    getCustomRules(true);
    Object.keys(abpRules).forEach((name) => {
      data.receivedRules += "\n" + abpRules[name];
    });
    data.allRules = data.customRules + data.receivedRules;
    if (apply) splitRules();
    return data.receivedRules.length;
  }
  function styleApplyExec(type) {
    if (canApplyCss(type)) {
      const csss = data[styleBoxes[type]];
      new ExtendedCss({
        styleSheet: csss.replaceAll(/\/\*\s*\d.+?\s*\*\//g, ""),
      }).apply();
      if (!(type % 2 == 1)) addStyle(csss);
    }
  }
  function styleApply() {
    for (let type = 0; type < 4; type++) styleApplyExec(type);
  }
  function parseRules() {
    function addRule(rule, exten) {
      const [full, selector] = ruleToCss(rule, data.preset);
      const index = exten + (rule.generic ? 0 : 2);
      const checkResult = ExtendedCss.validate(selector);
      if (checkResult.ok) {
        data[styleBoxes[index]] += full;
        data.appliedCount++;
      }
    }
    styleBoxes.forEach((box) => {
      data[box] = "";
    });
    [data.styles, data.extStyles, data.selectors, data.extSelectors].forEach(
      (r, t) => {
        const sels = new Set();
        r.white.forEach((obj) => !sels.has(obj.sel) && sels.add(obj.sel));
        r.black
          .filter((obj) => !sels.has(obj.sel) && sels.add(obj.sel))
          .forEach((s) => addRule(s, t % 2));
      }
    );
    if (!data.saved) styleApply();
  }
  function splitRules() {
    dataBoxes.forEach((box) => {
      data[box] = makeRuleBox();
    });
    data.allRules.split("\n").forEach((rule) => {
      {
        const ruleObj = ruleLoader(rule);
        if (typeof ruleObj !== "undefined") {
          const whiteList = data[dataBoxes[ruleObj.type]].white;
          if (
            ruleObj.black === "black" &&
            whiteList.some(w => w.sel === ruleObj.sel)
          )
            return;
          data[dataBoxes[ruleObj.type]][ruleObj.black].push(ruleObj);
        }
      }
    });
    parseRules();
  }

  function main() {
    return __awaiter(this, void 0, void 0, function* () {
      yield getCustomRules(false);
      {
        if (initRules(false) === 0) {
          initRules(true);
        }
        splitRules();
      }
    });
  }
  function runOnce(key, func) {
    if (key in cat.unsafeWindow) return Promise.reject();
    cat.unsafeWindow[key] = true;
    return func();
  }
  {
    runOnce(data.mutex, main);
  }
})({
  GM_info: typeof GM_info == "object" ? GM_info : {},
  unsafeWindow: window,
  GM_addStyle: typeof GM_addStyle == "function" ? GM_addStyle : undefined,
});
