/*
 * Apps Script google.script.run 相容轉接器
 * 放在 GitHub Pages 的 FinalExam.html 同一資料夾。
 * 部署 Cloudflare Worker 後，將下方網址換成實際的 Worker URL。
 */
(function () {
  'use strict';

  var BACKEND_API_URL = 'https://senior-cognitive-backend.e141316.workers.dev';

  function createRunner(successHandler, failureHandler, userObject) {
    var runnerCore = {
      withSuccessHandler: function (handler) {
        return createRunner(typeof handler === 'function' ? handler : null, failureHandler, userObject);
      },
      withFailureHandler: function (handler) {
        return createRunner(successHandler, typeof handler === 'function' ? handler : null, userObject);
      },
      withUserObject: function (object) {
        return createRunner(successHandler, failureHandler, object);
      }
    };

    return new Proxy(runnerCore, {
      get: function (target, property) {
        if (property === 'then') return undefined;
        if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
        if (typeof property !== 'string' || property.charAt(0) === '_') return undefined;

        return function () {
          var args = Array.prototype.slice.call(arguments);
          if (!BACKEND_API_URL || BACKEND_API_URL.indexOf('YOUR-WORKER-NAME') !== -1) {
            var setupError = new Error('尚未設定 Cloudflare Worker API 網址。');
            if (failureHandler) failureHandler(setupError, userObject);
            else console.error(setupError);
            return runnerCore;
          }

          fetch(BACKEND_API_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: property, args: args })
          })
            .then(function (response) {
              return response.text().then(function (text) {
                var data;
                try { data = JSON.parse(text); }
                catch (error) { throw new Error('後臺回應不是有效 JSON。'); }
                if (!response.ok || (data && data.__transportError)) {
                  throw new Error(String(data && data.message || ('後臺連線失敗（HTTP ' + response.status + '）。')));
                }
                return data;
              });
            })
            .then(function (result) {
              if (successHandler) successHandler(result, userObject);
            })
            .catch(function (error) {
              if (failureHandler) failureHandler(error, userObject);
              else console.error('Apps Script backend bridge failed:', error);
            });

          return runnerCore;
        };
      }
    });
  }

  // 在 GitHub Pages 補上 google.script.run 的相容介面，
  // 讓原本 FinalExam.html 中的呼叫鏈可沿用，不改動測驗畫面和評分流程。
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createRunner(null, null, null);
})();
