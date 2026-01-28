// ==UserScript==
// @name              Remove link redirects
// @author            sfun
// @description       Remove redirects from links within web pages, with high accuracy and stability.
// @description:zh-CN 去除网页内链接的重定向，具有高准确性和高稳定性。
// @version           1.0.0
// @namespace         Violentmonkey Scripts
// @grant             GM.xmlHttpRequest
// @match             *://*/*
// @connect           *
// @icon              https://cdn-icons-png.flaticon.com/512/208/208895.png
// @run-at            document-end
// @noframes
// @license           MIT
// @namespace   https://github.com/ssfun
// @author      sfun
// @homepage    https://github.com/ssfun/userscripts
// @homepageURL https://github.com/ssfun/userscripts
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/remove-link-redirects.js
// @updateURL   https://github.com/ssfun/userscripts/raw/refs/heads/main/remove-link-redirects.js
// ==/UserScript==


(() => {
  "use strict";

  /********** 以下为自动跳转部分 **********/
  class AutoJumpApp {
    constructor() {
      this.registeredProvider = void 0;
    }

    /**
     * 注册服务提供者
     * @param providers
     */
    registerProvider() {
      for (const provider of AutoJumpApp.providers) {
        if (
          provider.urlTest instanceof RegExp &&
          !provider.urlTest.test(location.href)
        ) {
          continue;
        }
        if (provider.urlTest === false) {
          continue;
        }
        if (typeof provider.urlTest === "function" && !provider.urlTest()) {
          continue;
        }
        this.registeredProvider = provider;
        break;
      }
      return this;
    }

    /**
     * 启动应用
     * @returns
     * */
    bootstrap() {
      this.registerProvider();
      if (this.registeredProvider) {
        this.registeredProvider.resolveAutoJump();
        return true;
      }
      return false;
    }

    static providers = [
      {
        name: "酷安",
        urlTest: /www\.coolapk\.com\/link\?.*url=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("url")
          );
        },
      },
      {
        name: "CSDN",
        urlTest: /link\.csdn\.net\/\?.*target=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("target")
          );
        },
      },
      {
        name: "腾讯兔小巢",
        urlTest: /support\.qq\.com\/.*link-jump\?jump=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("jump")
          );
        },
      },
      {
        name: "QQ邮箱",
        urlTest: /mail\.qq\.com\/.*gourl=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("gourl")
          );
        },
      },
      {
        name: "印象笔记",
        urlTest: /app\.yinxiang\.com\/OutboundRedirect\.action\?.*dest=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("dest")
          );
        },
      },
      {
        name: "Youtube",
        urlTest: /www\.youtube\.com\/redirect\?.*q=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("q")
          );
        },
      },
      {
        name: "微信开放社区",
        urlTest: /developers\.weixin\.qq\.com\/.*href=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("href")
          );
        },
      },
      {
        name: "51CTO博客",
        urlTest: /blog\.51cto\.com\/transfer\?/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("url")
          );
        },
      },
      {
        name: "QQ",
        urlTest: /c\.pc\.qq\.com.*[?&](?:url|pfurl)=/,
        resolveAutoJump: function () {
          const url = new URL(location.href).searchParams.get("url") || new URL(location.href).searchParams.get("pfurl");
          if (url) {
            let decoded = decodeURIComponent(url);
            decoded = decoded.replace(/\/+$/, "");
            location.href = decoded;
          }
        },
      },
      {
        name: "UrlShare",
        urlTest: /.+\.urlshare\..+\/.*url=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("url")
          );
        },
      },
      {
        name: "腾讯文档",
        urlTest: /docs\.qq\.com\/.*\?url=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("url")
          );
        },
      },
      {
        name: "金山文档",
        urlTest: /www\.kdocs\.cn\/office\/link\?.*target=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("target")
          );
        },
      },
      {
        name: "NodeSeek",
        urlTest: /www\.nodeseek\.com\/jump\?.*to=/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("to")
          );
        },
      },
      {
        name: "新版QQ邮箱",
        urlTest: /wx\.mail\.qq\.com\/xmspamcheck\/xmsafejump\?/,
        resolveAutoJump: function () {
          location.href = decodeURIComponent(
            new URL(location.href).searchParams.get("url")
          );
        },
      },
    ];
  }

  /********** 以下为重定向解析部分 **********/
  class RedirectApp {
    /**
     * 调节providers的顺序
     * 将匹配到的provider放到最前
     * @param provider
     */
    adjustProviderOrderOnce = (function () {
      let executed = false; // 标志变量，用于跟踪函数是否已执行
      return function (provider) {
        if (!executed) {
          const index = this.registeredProviders.indexOf(provider);
          if (index !== -1) {
            this.registeredProviders.splice(index, 1);
            this.registeredProviders.unshift(provider);
          }
          executed = true;
        }
      };
    })();

    /**
     * A 标签是否匹配服务提供者
     * @param element
     * @param provider
     */
    static isMatchProvider(element, provider) {
      if (element.getAttribute(RedirectApp.REDIRECT_COMPLETED)) {
        return false;
      }
      if (
        provider.linkTest instanceof RegExp &&
        !provider.linkTest.test(element.href)
      ) {
        return false;
      }
      if (typeof provider.linkTest === "boolean") {
        return provider.linkTest;
      }
      if (
        typeof provider.linkTest === "function" &&
        !provider.linkTest(element)
      ) {
        return false;
      }
      return true;
    }

    /**
     * 解析完成的标志
     */
    static REDIRECT_COMPLETED = "redirect-completed";

    /**
     * 兜底解析器
     * 用于解析无法解析的链接
     * 通过GM.xmlHttpRequest获取最终链接
     */
    static FallbackResolver = class {
      constructor() {
        this.processedUrls = new Map();
      }

      async resolveRedirect(element) {
        const href = element.href;

        if (!this.processedUrls.has(href)) {
          // 创建一个新的 Promise 并存储在 Map 中
          let resolvePromise;
          const promise = new Promise((resolve) => {
            resolvePromise = resolve;
          });
          this.processedUrls.set(href, promise);

          try {
            const res = await GM.xmlHttpRequest({
              method: "GET",
              url: href,
              anonymous: true,
            });
            if (res.finalUrl) {
              const url = res.finalUrl;
              this.processedUrls.set(href, url);
              element.href = url;
            } else {
              this.processedUrls.delete(href); // 请求失败时删除占位符
            }
          } catch (error) {
            console.error("请求失败:", error);
            this.processedUrls.delete(href); // 请求失败时删除占位符
          } finally {
            resolvePromise(); // 请求完成后解析 Promise
          }
        } else {
          const cachedValue = this.processedUrls.get(href);

          if (cachedValue instanceof Promise) {
            // 如果是 Promise，等待其完成
            await cachedValue;
            element.href = this.processedUrls.get(href);
          } else {
            // 否则直接使用缓存值
            element.href = cachedValue;
          }
        }
      }
    };

    /**
     * 移除链接重定向
     * 首先判断是否可以直接解析链接，如果可以则直接解析
     * 如果不行，则调用fallbackResolver解析
     * @param caller 调用者
     * @param element 链接元素
     * @param realUrl 真实链接
     * @param options 配置项
     * @returns
     * */
    static removeLinkRedirect(caller, element, realUrl, options) {
      element.setAttribute(RedirectApp.REDIRECT_COMPLETED, "true");
      if ((realUrl && element.href !== realUrl) || options?.force) {
        try {
          element.href = decodeURIComponent(realUrl);
        } catch (_) {
          element.href = realUrl;
        }
      } else if (caller) {
        if (!caller.fallbackResolver) {
          caller.fallbackResolver = new RedirectApp.FallbackResolver();
        }
        caller.fallbackResolver.resolveRedirect(element);
      }
    }

    /**
     * 监听URL变化
     * @param operation
     * @returns
     * */
    static monitorUrlChange(operation) {
      function urlChange(event) {
        const destinationUrl = event?.destination?.url || "";
        if (destinationUrl.startsWith("about:blank")) return;
        const href = destinationUrl || location.href;
        if (href !== location.href) {
          operation(href);
        }
      }
      const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      win?.navigation?.addEventListener("navigate", urlChange);
      win.addEventListener("replaceState", urlChange);
      win.addEventListener("pushState", urlChange);
      win.addEventListener("popState", urlChange);
      win.addEventListener("hashchange", urlChange);
    }

    constructor() {
      this.registeredProviders = [];
      this.mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach(this.handleMutation.bind(this));
      });
    }

    /**
     * 处理变动
     * @param mutation
     * @returns
     * */
    handleMutation(mutation) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLAnchorElement) {
            this.handleNode(node);
          } else {
            // 有些网站被observer观察到的是一个div，里面包含了很多a标签
            // 这种情况下，需要对所有的a标签进行处理
            node
              ?.querySelectorAll?.(`a:not([${RedirectApp.REDIRECT_COMPLETED}])`)
              ?.forEach((aNode) => this.handleNode(aNode));
          }
        });
      }
    }

    /**
     * 处理节点
     * @param node
     * @returns
     */
    handleNode(node) {
      for (const provider of this.registeredProviders) {
        if (RedirectApp.isMatchProvider(node, provider)) {
          provider.resolveRedirect(node);
          this.adjustProviderOrderOnce(provider);
          break;
        }
      }
    }

    /**
     * 当页面准备就绪时，进行初始化动作
     * 有一些服务提供者需要在页面准备就绪时进行特殊的初始化操作
     * 比如百度搜索，需要监听URL变化
     * 以及一些情况不需要RediectApp介入
     * 如谷歌搜索需要监听的是href变化，而链接本身没有重定向
     */
    async initProviders() {
      for (const provider of this.registeredProviders) {
        if (provider.onInit) {
          await provider.onInit();
        }
      }
    }

    /**
     * 注册服务提供者
     * @param providers
     */
    registerProviders() {
      for (const provider of RedirectApp.providers) {
        if (provider.urlTest === false) {
          continue;
        }
        if (
          provider.urlTest instanceof RegExp &&
          !provider.urlTest.test(location.href)
        ) {
          continue;
        }
        if (typeof provider.urlTest === "function" && !provider.urlTest()) {
          continue;
        }
        this.registeredProviders.push(provider);
      }
      return this;
    }

    /**
     * 启动应用
     */
    bootstrap() {
      this.registerProviders();

      document.querySelectorAll("a").forEach((element) => {
        this.handleNode(element);
      });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.initProviders());
      } else {
        this.initProviders();
      }

      this.mutationObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    static providers = [
      {
        name: "如有乐享",
        urlTest: /51\.ruyo\.net/,
        linkTest: /\/[^\?]*\?u=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("u")
          );
        },
      },
      {
        name: "Mozilla",
        urlTest: /addons\.mozilla\.org/,
        linkTest: /outgoing\.prod\.mozaws\.net\/v\d\/\w+\/(.*)/,
        resolveRedirect: function (element) {
          let url = void 0;
          const match = this.linkTest.exec(element.href);
          if (match && match[1]) {
            try {
              url = decodeURIComponent(match[1]);
            } catch (_) {
              url = /(http|https)?:\/\//.test(match[1]) ? match[1] : void 0;
            }
          }
          RedirectApp.removeLinkRedirect(this, element, url);
        },
      },
      {
        name: "爱发电",
        urlTest: /afdian\.net/,
        linkTest: /afdian\.net\/link\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "印象笔记",
        urlTest: /(www|app)\.yinxiang\.com/,
        linkTest: true,
        resolveRedirect: function (element) {
          if (element.hasAttribute("data-mce-href")) {
            if (!element.onclick) {
              RedirectApp.removeLinkRedirect(this, element, element.href, {
                force: true,
              });
              element.onclick = function (e) {
                // 阻止事件冒泡, 因为上层元素绑定的click事件会重定向
                e.stopPropagation?.();
                element.setAttribute("target", "_blank");
                window.top
                  ? window.top.open(element.href)
                  : window.open(element.href);
              };
            }
          }
        },
        onInit: async function () {
          const handler = function (e) {
            const dom = e.target;
            const tagName = dom.tagName.toUpperCase();
            switch (tagName) {
              case "A": {
                this.resolveRedirect(dom);
                break;
              }
              case "IFRAME": {
                if (dom.hasAttribute("redirect-link-removed")) {
                  return;
                }
                dom.setAttribute("redirect-link-removed", "true");
                dom.contentWindow.document.addEventListener(
                  "mouseover",
                  handler
                );
                break;
              }
            }
          };
          document.addEventListener("mouseover", handler);
        },
      },
      {
        name: "印象笔记",
        urlTest: /app\.yinxiang\.com/,
        linkTest:
          /(www|app)\.yinxiang\.com\/OutboundRedirect\.action\?dest=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("dest")
          );
        },
      },
      {
        name: "Bing",
        urlTest: /bing\.com/,
        linkTest: /.+\.bing\.com\/ck\/a\?.*&u=a1(.*)&ntb=1/,
        textDecoder: new TextDecoder("utf-8"),
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            this.textDecoder.decode(
              Uint8Array.from(
                Array.from(
                  atob(
                    element.href
                      .split("&u=a1")[1]
                      .split("&ntb=1")[0]
                      .replace(/[-_]/g, (e) => ("-" === e ? "+" : "/"))
                      .replace(/[^A-Za-z0-9\\+\\/]/g, "")
                  )
                ).map((e) => e.charCodeAt(0))
              )
            )
          );
        },
      },
      {
        name: "51CTO博客",
        urlTest: /blog\.51cto\.com/,
        linkTest: true,
        resolveRedirect: function (element) {
          const container = document.querySelector(".article-detail");
          if (container?.contains(element)) {
            if (!element.onclick && element.href) {
              element.onclick = function (e) {
                e.stopPropagation?.();
                const $a = document.createElement("a");
                $a.href = element.href;
                $a.target = element.target;
                $a.click();
              };
            }
          }
        },
      },
      {
        name: "51CTO博客",
        urlTest: /blog\.51cto\.com/,
        linkTest: /blog\.51cto\.com\/.*transfer\?(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "CSDN",
        urlTest: /blog\.csdn\.net/,
        linkTest: true,
        resolveRedirect: function (element) {
          const container = document.querySelector("#content_views");
          if (!container?.contains(element)) {
            return;
          }

          if (!element.onclick && element.origin !== window.location.origin) {
            RedirectApp.removeLinkRedirect(this, element, element.href, {
              force: true,
            });
            element.onclick = function (e) {
              // 阻止事件冒泡, 因为上层元素绑定的click事件会重定向
              e.stopPropagation?.();
              e.preventDefault?.();
              e.stopImmediatePropagation?.();
            };
          }
        },
      },
      {
        name: "知乎日报",
        urlTest: /daily\.zhihu\.com/,
        linkTest: /zhihu\.com\/\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "Google Docs",
        urlTest: /docs\.google\.com/,
        linkTest: /www\.google\.com\/url\?q=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("q")
          );
        },
      },
      {
        name: "Pocket",
        urlTest: /getpocket\.com/,
        linkTest: /getpocket\.com\/redirect\?url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "Gitee",
        urlTest: /gitee\.com/,
        linkTest: /gitee\.com\/link\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "InfoQ",
        urlTest: /infoq\.cn/,
        linkTest: /infoq\.cn\/link\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "掘金",
        urlTest: /juejin\.(im|cn)/,
        linkTest: /link\.juejin\.(im|cn)\/\?target=(.*)/,
        resolveRedirect: function (element) {
          const finalURL = new URL(element.href).searchParams.get("target");
          RedirectApp.removeLinkRedirect(this, element, finalURL);
          if (this.linkTest.test(element.title)) {
            element.title = finalURL;
          }
        },
      },
      {
        name: "QQ邮箱",
        urlTest: /mail\.qq\.com/,
        linkTest: true,
        resolveRedirect: function (element) {
          const container = document.querySelector("#contentDiv");
          if (container?.contains(element)) {
            if (!element.onclick) {
              element.onclick = function (e) {
                // 阻止事件冒泡, 因为上层元素绑定的click事件会重定向
                e.stopPropagation?.();
              };
            }
          }
        },
      },
      {
        name: "QQ邮箱",
        urlTest: /mail\.qq\.com/,
        linkTest: /mail\.qq\.com.+gourl=(.+).*/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("gourl")
          );
        },
      },
      {
        name: "新版QQ邮箱",
        urlTest: () => {
          if (
            /mail\.qq\.com/.test(location.href) ||
            /wx\.mail\.qq\.com/.test(location.href)
          ) {
            return true;
          }
          return false;
        },
        linkTest: /wx\.mail\.qq\.com\/xmspamcheck\/xmsafejump\?/,
        resolveRedirect: function (element) {
          const url = new URL(element.href).searchParams.get("url");
          RedirectApp.removeLinkRedirect(this, element, url);
        },
      },
      {
        name: "OS China",
        urlTest: /oschina\.net/,
        linkTest: /oschina\.net\/action\/GoToLink\?url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "Google Play",
        urlTest: /play\.google\.com/,
        linkTest: function (element) {
          if (/google\.com\/url\?q=(.*)/.test(element.href)) {
            return true;
          } else if (/^\/store\/apps\/details/.test(location.pathname)) {
            return true;
          }
          return false;
        },
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("q")
          );
          const eles = [].slice.call(document.querySelectorAll("a.hrTbp"));
          for (const ele of eles) {
            if (!ele.href || ele.getAttribute(RedirectApp.REDIRECT_COMPLETED)) {
              continue;
            }
            ele.setAttribute(RedirectApp.REDIRECT_COMPLETED, "true");
            ele.setAttribute("target", "_blank");
            ele.addEventListener(
              "click",
              (event) => {
                event.stopPropagation();
              },
              true
            );
          }
        },
      },
      {
        name: "少数派",
        urlTest: /sspai\.com/,
        linkTest: /sspai\.com\/link\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "Steam Community",
        urlTest: /steamcommunity\.com/,
        linkTest: /steamcommunity\.com\/linkfilter\/\?url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "百度贴吧",
        urlTest: /tieba\.baidu\.com/,
        linkTest: /jump\d*\.bdimg\.com/,
        resolveRedirect: function (element) {
          let url = void 0;
          const text = element.innerText || element.textContent || void 0;
          const isUrl = /(http|https)?:\/\//.test(text);
          if (isUrl) {
            try {
              url = decodeURIComponent(text);
            } catch (_) {
              url = text;
            }
          }
          RedirectApp.removeLinkRedirect(this, element, url);
        },
      },
      {
        name: "Twitter",
        urlTest: /(twitter|x)\.com/,
        linkTest: /t\.co\/\w+/,
        resolveRedirect: async function (element) {
          if (/(http|https)?:\/\//.test(element.title)) {
            const url = decodeURIComponent(element.title);
            RedirectApp.removeLinkRedirect(this, element, url);
            return;
          }
          const textContent = element.textContent.replace(/…$/, "");
          if (/(http|https)?:\/\//.test(textContent)) {
            RedirectApp.removeLinkRedirect(this, element, textContent);
            return;
          } else {
            const res = await GM.xmlHttpRequest({
              method: "GET",
              url: "https://" + textContent,
              anonymous: true,
            });
            if (res.status === 200) {
              RedirectApp.removeLinkRedirect(this, element, res.finalUrl);
            } else {
              RedirectApp.removeLinkRedirect(
                this,
                element,
                "http://" + textContent
              );
            }
          }
        },
      },
      {
        name: "微博",
        urlTest: /\.weibo\.(com|cn)/,
        linkTest: function (element) {
          return /t\.cn\/\w+/.test(element.href) || /weibo\.(com|cn)\/sinaurl\?u=/.test(element.href);
        },
        resolveRedirect: function (element) {
          // sinaurl 重定向
          if (/weibo\.(com|cn)\/sinaurl\?u=/.test(element.href)) {
            RedirectApp.removeLinkRedirect(
              this,
              element,
              decodeURIComponent(new URL(element.href).searchParams.get("u"))
            );
            return;
          }
          // t.cn 短链接
          if (!/^(http|https)?:\/\//.test(element.title)) {
            return;
          }
          let url = void 0;
          try {
            url = decodeURIComponent(element.title);
          } catch (_) {}
          RedirectApp.removeLinkRedirect(this, element, url);
        },
      },
      {
        name: "百度搜索",
        urlTest: /www\.baidu\.com/,
        linkTest: /www\.baidu\.com\/link\?url=/,
        unresolvableWebsites: ["nourl.ubs.baidu.com", "lightapp.baidu.com"],
        specialElements: [
          ".cos-row",
          ".c-group-wrapper",
          ".subLink_answer",
          ".subLink_answer ~ a",
          "[class*=catalog-list]",
          "[class*=group-content]",
        ],
        fallbackResolver: new RedirectApp.FallbackResolver(),
        resolveRedirect: async function (element) {
          const url = this.specialElements.some((selector) =>
            element.closest(selector)
          )
            ? void 0
            : element.closest(".c-container[mu]")?.getAttribute("mu");
          if (
            url &&
            url !== "null" &&
            url !== "undefined" &&
            url !== "" &&
            url !== "about:blank" &&
            url !== "javascript:void(0);" &&
            !this.unresolvableWebsites.some((u) => url?.includes(u))
          ) {
            RedirectApp.removeLinkRedirect(this, element, url);
          } else {
            this.fallbackResolver.resolveRedirect(element);
          }
        },
      },
      {
        name: "豆瓣",
        urlTest: /douban\.com/,
        linkTest: /douban\.com\/link2\/?\?url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "Google搜索",
        urlTest: /\w+\.google\./,
        linkTest: true,
        resolveRedirect: function (element) {
          const traceProperties = [
            "ping",
            "data-jsarwt",
            "data-usg",
            "data-ved",
          ];
          // 移除追踪
          for (const property of traceProperties) {
            if (element.getAttribute(property)) {
              element.removeAttribute(property);
            }
          }
          // 移除多余的事件
          if (element.getAttribute("onmousedown")) {
            element.removeAttribute("onmousedown");
          }
          // 尝试去除重定向
          if (element.getAttribute("data-href")) {
            const realUrl = element.getAttribute("data-href");
            RedirectApp.removeLinkRedirect(this, element, realUrl);
          }
          if (element && element.href) {
            const url = new URL(element?.href);
            if (url?.searchParams.get("url")) {
              RedirectApp.removeLinkRedirect(
                this,
                element,
                url.searchParams.get("url")
              );
            }
          }
        },
      },
      {
        name: "简书",
        urlTest: /www\.jianshu\.com/,
        linkTest: function (element) {
          const isLink1 = /links\.jianshu\.com\/go/.test(element.href);
          const isLink2 = /link\.jianshu\.com(\/)?\?t=/.test(element.href);
          const isLink3 = /jianshu\.com\/go-wild\/?\?(.*)url=/.test(
            element.href
          );
          if (isLink1 || isLink2 || isLink3) {
            return true;
          }
          return false;
        },
        resolveRedirect: function (element) {
          const search = new URL(element.href).searchParams;
          RedirectApp.removeLinkRedirect(
            this,
            element,
            search.get("to") || search.get("t") || search.get("url")
          );
        },
        onInit: async function () {
          document
            .querySelectorAll(`a:not([${RedirectApp.REDIRECT_COMPLETED}])`)
            .forEach((element) => {
              if (this.linkTest(element)) {
                this.resolveRedirect(element);
              }
            });
        },
      },
      {
        name: "标志情报局",
        urlTest: /www\.logonews\.cn/,
        linkTest: /link\.logonews\.cn\/\?url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "360搜索",
        urlTest: /www\.so\.com/,
        linkTest: /so\.com\/link\?(.*)/,
        resolveRedirect: function (element) {
          const url =
            element.getAttribute("data-mdurl") ||
            element.getAttribute("e-landurl");
          if (url) {
            RedirectApp.removeLinkRedirect(this, element, url);
          }
          // remove track
          element.removeAttribute("e_href");
          element.removeAttribute("data-res");
        },
      },
      {
        name: "搜狗搜索",
        urlTest: /www\.sogou\.com/,
        linkTest: /www\.sogou\.com\/link\?url=/,
        resolveRedirect: function (element) {
          const vrwrap = element.closest(".vrwrap");
          if (!vrwrap) return;
          const rSech = vrwrap.querySelector(".r-sech[data-url]");
          if (!rSech) return;
          const url = rSech.getAttribute("data-url");
          RedirectApp.removeLinkRedirect(this, element, url);
        },
      },
      {
        name: "Youtube",
        urlTest: /www\.youtube\.com/,
        linkTest: /www\.youtube\.com\/redirect\?.{1,}/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("q")
          );
        },
      },
      {
        name: "知乎",
        urlTest: /www\.zhihu\.com/,
        linkTest: /zhihu\.com\/\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "百度学术",
        urlTest: /xueshu\.baidu\.com/,
        linkTest: /xueshu\.baidu\.com\/s?\?(.*)/,
        resolveRedirect: function (element) {
          const url =
            element.getAttribute("data-link") ||
            element.getAttribute("data-url") ||
            void 0;
          RedirectApp.removeLinkRedirect(
            this,
            element,
            decodeURIComponent(url)
          );
        },
      },
      {
        name: "知乎专栏",
        urlTest: /zhuanlan\.zhihu\.com/,
        linkTest: /link\.zhihu\.com\/\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "力扣",
        urlTest: /leetcode\.(cn|com)/,
        linkTest: /leetcode\.(cn|com)\/link\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "腾讯开发者社区",
        urlTest: /cloud\.tencent\.com/,
        linkTest:
          /cloud\.tencent\.com\/developer\/tools\/blog-entry\?target=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("target")
          );
        },
      },
      {
        name: "酷安",
        urlTest: true,
        linkTest: /www\.coolapk\.com\/link\?url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("url")
          );
        },
      },
      {
        name: "腾讯兔小巢",
        urlTest: /support\.qq\.com/,
        linkTest: /support\.qq\.com\/.*link-jump\?jump=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("jump")
          );
        },
      },
      {
        name: "微信开放社区",
        urlTest: /developers\.weixin\.qq\.com/,
        linkTest: /developers\.weixin\.qq\.com\/.*href=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("href")
          );
        },
      },
      {
        name: "pc6下载站",
        urlTest: /www\.pc6\.com/,
        linkTest: /www\.pc6\.com\/.*\?gourl=(.*)/,
        customDecode: function (encoded) {
          const key = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const len = key.length;
          let d = 0;
          let s = new Array(Math.floor(encoded.length / 3));
          const b = s.length;
          for (let i = 0; i < b; i++) {
            const b1 = key.indexOf(encoded.charAt(d++));
            const b2 = key.indexOf(encoded.charAt(d++));
            const b3 = key.indexOf(encoded.charAt(d++));
            s[i] = b1 * len * len + b2 * len + b3;
          }
          const decoded = String.fromCharCode(...s);
          return decoded;
        },
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            this.customDecode(new URL(element.href).searchParams.get("gourl"))
          );
        },
      },
      {
        name: "QQ",
        urlTest: true,
        linkTest: /c\.pc\.qq\.com.*(?:pfurl|url)=/,
        resolveRedirect: function (element) {
          const params = new URL(element.href).searchParams;
          const url = params.get("pfurl") || params.get("url");
          if (url) {
            RedirectApp.removeLinkRedirect(this, element, decodeURIComponent(url));
          }
        },
      },
      {
        name: "UrlShare",
        urlTest: function () {
          return ![/www\.jun\.la/].some((r) => r.test(location.href));
        },
        linkTest: /.+\.urlshare\..+\/.*url=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            decodeURIComponent(new URL(element.href).searchParams.get("url"))
          );
        },
      },
      {
        name: "PHP中文网",
        urlTest: /www\.php\.cn/,
        linkTest: /www\.php\.cn\/link(.*)/,
        resolveRedirect: async function (element) {
          const res = await GM.xmlHttpRequest({
            method: "GET",
            url: element.href,
            anonymous: true,
          });
          const parser = new DOMParser();
          const doc = parser.parseFromString(res.responseText, "text/html");
          const a = doc.querySelector("a");
          if (a) {
            RedirectApp.removeLinkRedirect(this, element, a.href);
          }
        },
      },
      {
        name: "NodeSeek",
        urlTest: /www\.nodeseek\.com/,
        linkTest: /www\.nodeseek\.com\/jump\?to=(.*)/,
        resolveRedirect: function (element) {
          RedirectApp.removeLinkRedirect(
            this,
            element,
            new URL(element.href).searchParams.get("to")
          );
        },
      },
    ];
  }

  const autoJumpApp = new AutoJumpApp();
  const autoJumpResult = autoJumpApp.bootstrap();
  if (autoJumpResult) return;

  const redirectApp = new RedirectApp();
  redirectApp.bootstrap();
})();
