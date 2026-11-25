/*
 * 高齡駕駛認知測驗：瀏覽器原生語音輸入
 * - Web Speech API：SpeechRecognition / webkitSpeechRecognition
 * - 預設語系 zh-TW；無 API Key、無本專案後端呼叫
 * - 支援第一關文字題（生肖、星期、地點）與第二關圖卡回想輸入
 */
(function () {
  'use strict';

  var DEFAULT_RECOGNITION_LANG = 'zh-TW';
  var activeSession = null;
  var observer = null;
  var diagnostics = [];

  function getRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function logDiagnostic(phase, detail) {
    var record = { time: new Date().toISOString(), phase: phase, detail: detail || '' };
    diagnostics.push(record);
    if (diagnostics.length > 100) diagnostics.shift();
    try { console.info('[SpeechInput診斷]', record); } catch (error) {}
    try { window.__speechInputDiagnostics = diagnostics.slice(); } catch (error) {}
  }

  function getRecognitionLanguage() {
    var state = null;
    try { state = typeof window.__getCognitiveExamState === 'function' ? window.__getCognitiveExamState() : window.examState; } catch (error) {}
    var selected = state && state.language ? String(state.language) : DEFAULT_RECOGNITION_LANG;
    if (selected === 'nan-TW' || selected === 'hak-TW') return selected;
    // 純文字呈現模式仍可使用麥克風，辨識語言採國語預設。
    return DEFAULT_RECOGNITION_LANG;
  }

  var TEXT = {
    start: '使用語音輸入',
    stop: '停止錄音',
    listening: '正在聆聽，請開始說話。',
    stopping: '正在整理辨識結果…',
    draft: '即時辨識：',
    success: '已辨識文字，請確認內容。',
    noSpeech: '沒有偵測到聲音，請靠近麥克風再說一次。',
    denied: '尚未取得麥克風或語音辨識權限。請允許此網站使用麥克風後再試。',
    noMic: '找不到可用的麥克風，請確認裝置已連接並允許使用。',
    network: '瀏覽器語音辨識服務目前無法連線。請確認網路後再試，或改用文字輸入。',
    language: '目前瀏覽器不支援繁體中文語音辨識，請改用文字輸入。',
    unavailableIOS: '此瀏覽器目前無法使用網頁語音辨識。請點選輸入框，再使用 iPhone／iPad 鍵盤上的麥克風聽寫。',
    unavailable: '此瀏覽器不支援網頁語音辨識。請改用最新版 Chrome 或 Edge，或直接輸入文字。',
    empty: '尚未取得完整辨識文字，請再說一次。',
    generic: '語音辨識暫時無法使用，請再試一次或改用文字輸入。'
  };

  var TRANSLATIONS = {
    '使用語音輸入': ['Use voice input', '音声入力を使用', '음성 입력 사용'],
    '停止錄音': ['Stop recording', '録音を停止', '녹음 중지'],
    '正在聆聽，請開始說話。': ['Listening. Please start speaking.', '聞き取り中です。話してください。', '듣고 있습니다. 말씀해 주세요.'],
    '正在整理辨識結果…': ['Finalizing speech recognition…', '音声認識結果を確定しています…', '음성 인식 결과를 정리하고 있습니다…'],
    '即時辨識：': ['Live draft: ', '認識中：', '실시간 인식: '],
    '已辨識並加入文字，請確認內容。': ['Recognized text added. Please review it.', '認識したテキストを追加しました。内容を確認してください。', '인식한 텍스트를 추가했습니다. 내용을 확인해 주세요.'],
    '沒有偵測到聲音，請靠近麥克風再說一次。': ['No speech was detected. Move closer to the microphone and try again.', '音声を検出できませんでした。マイクに近づいてもう一度お試しください。', '음성이 감지되지 않았습니다. 마이크에 가까이 대고 다시 말씀해 주세요.'],
    '尚未取得麥克風或語音辨識權限。請允許此網站使用麥克風後再試。': ['Microphone or speech recognition permission was not granted. Allow access and try again.', 'マイクまたは音声認識の許可がありません。サイトでの使用を許可してから再試行してください。', '마이크 또는 음성 인식 권한이 없습니다. 사이트의 마이크 사용을 허용한 후 다시 시도해 주세요.'],
    '找不到可用的麥克風，請確認裝置已連接並允許使用。': ['No microphone was found. Check that one is connected and permitted.', '使用できるマイクが見つかりません。接続と使用許可を確認してください。', '사용 가능한 마이크가 없습니다. 연결 상태와 사용 권한을 확인해 주세요.'],
    '瀏覽器語音辨識服務目前無法連線。請確認網路後再試，或改用文字輸入。': ['The browser speech recognition service is unavailable. Check your connection or type your answer.', 'ブラウザーの音声認識サービスに接続できません。ネットワークを確認するか、文字で入力してください。', '브라우저 음성 인식 서비스에 연결할 수 없습니다. 네트워크를 확인하거나 문자로 입력해 주세요.'],
    '目前瀏覽器不支援繁體中文語音辨識，請改用文字輸入。': ['This browser does not support Traditional Chinese speech recognition. Please type your answer.', 'このブラウザーは繁体字中国語の音声認識に対応していません。文字で入力してください。', '이 브라우저는 중국어 번체 음성 인식을 지원하지 않습니다. 문자로 입력해 주세요.'],
    '此瀏覽器目前無法使用網頁語音辨識。請點選輸入框，再使用 iPhone／iPad 鍵盤上的麥克風聽寫。': ['Web speech recognition is unavailable here. Tap the field and use the microphone on the iPhone/iPad keyboard to dictate.', 'このブラウザーでは音声認識を利用できません。入力欄をタップし、iPhone／iPad キーボードのマイクで音声入力してください。', '이 브라우저에서는 웹 음성 인식을 사용할 수 없습니다. 입력란을 누른 뒤 iPhone/iPad 키보드의 마이크로 받아쓰기해 주세요.'],
    '此瀏覽器不支援網頁語音辨識。請改用最新版 Chrome 或 Edge，或直接輸入文字。': ['This browser does not support Web Speech recognition. Use the latest Chrome or Edge, or type your answer.', 'このブラウザーはWeb音声認識に対応していません。最新版のChromeまたはEdgeを使用するか、文字で入力してください。', '이 브라우저는 웹 음성 인식을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용하거나 문자로 입력해 주세요.'],
    '尚未取得完整辨識文字，請再說一次。': ['No complete speech result was received. Please try again.', '音声を完全に認識できませんでした。もう一度お試しください。', '완전한 음성 인식 결과를 받지 못했습니다. 다시 말씀해 주세요.'],
    '語音辨識暫時無法使用，請再試一次或改用文字輸入。': ['Speech recognition is temporarily unavailable. Try again or type your answer.', '音声認識を一時的に利用できません。もう一度試すか、文字で入力してください。', '음성 인식을 일시적으로 사용할 수 없습니다. 다시 시도하거나 문자로 입력해 주세요.'],
    '語音輸入不可用': ['Voice input unavailable', '音声入力は利用できません', '음성 입력을 사용할 수 없습니다'],
    '目前無法使用網頁語音辨識，請點選鍵盤上的麥克風說出答案，或直接輸入文字。': ['Web speech recognition is unavailable. Tap the keyboard microphone to dictate, or type your answer.', 'Web音声認識を利用できません。キーボードのマイクで入力するか、直接入力してください。', '웹 음성 인식을 사용할 수 없습니다. 키보드 마이크로 말하거나 직접 입력해 주세요.'],
    '語音輸入需要使用 HTTPS 網址開啟，請從正式網站進入。': ['Voice input requires HTTPS. Open the secure website URL.', '音声入力にはHTTPSが必要です。安全なサイトURLから開いてください。', '음성 입력은 HTTPS가 필요합니다. 보안 웹사이트 주소로 접속해 주세요.'],
    '已停止另一個錄音，請再點一次開始。': ['The previous recording was stopped. Tap again to start.', '前の録音を停止しました。もう一度タップして開始してください。', '이전 녹음을 중지했습니다. 다시 눌러 시작해 주세요.']
  };

  function addTranslations() {
    try {
      var dict = window.EXAM_TEXT_TRANSLATIONS;
      if (dict) {
        Object.keys(TRANSLATIONS).forEach(function (key) {
          dict[key] = TRANSLATIONS[key];
        });
      }
    } catch (error) {
      // Translation is optional; Traditional Chinese remains the default.
    }
  }

  function tr(value) {
    try {
      if (typeof window.translateExamDisplayText === 'function') {
        return window.translateExamDisplayText(value);
      }
    } catch (error) {}
    return value;
  }

  function isIOSDevice() {
    var ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);
  }

  function isRestrictedIOSContainer() {
    if (!isIOSDevice()) return false;
    var ua = navigator.userAgent || '';
    if (navigator.standalone === true) return true;
    if (/(Line\/|FBAN|FBAV|Instagram|MicroMessenger|GSA\/|SafariViewService)/i.test(ua)) return true;
    var hasSafariToken = /Safari\//i.test(ua);
    var hasKnownBrowserToken = /(CriOS\/|FxiOS\/|EdgiOS\/|OPiOS\/)/i.test(ua);
    return /AppleWebKit/i.test(ua) && !hasSafariToken && !hasKnownBrowserToken;
  }

  function isSecureEnough() {
    return window.isSecureContext === true ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function createMicSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path1 = document.createElementNS(ns, 'rect');
    path1.setAttribute('x', '9'); path1.setAttribute('y', '2');
    path1.setAttribute('width', '6'); path1.setAttribute('height', '12');
    path1.setAttribute('rx', '3');
    var path2 = document.createElementNS(ns, 'path');
    path2.setAttribute('d', 'M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8');
    svg.appendChild(path1); svg.appendChild(path2);
    return svg;
  }

  function injectStyles() {
    if (document.getElementById('native-speech-input-styles')) return;
    var style = document.createElement('style');
    style.id = 'native-speech-input-styles';
    style.textContent = [
      '.native-speech-tools{display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;margin:10px 0 4px;}',
      '.native-speech-button{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:10px 18px;border:2px solid #4F7058;border-radius:999px;background:#EAF0E7;color:#35473C;font:inherit;font-size:calc(18px * var(--font-scale,1));font-weight:800;line-height:1.3;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
      '.native-speech-button svg{width:22px;height:22px;flex:0 0 22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}',
      '.native-speech-button:focus-visible{outline:3px solid #B7CDB9;outline-offset:3px;}',
      '.native-speech-button.is-recording{background:#FFF3EB;border-color:#A6632B;color:#8A4D27;}',
      '.native-speech-button.is-recording .native-speech-dot{display:inline-block;}',
      '.native-speech-dot{display:none;width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#A6632B;animation:nativeSpeechPulse 1.2s ease-in-out infinite;}',
      '.native-speech-button:disabled{opacity:.62;cursor:not-allowed;}',
      '.native-speech-status{min-height:1.45em;margin:0;color:#6E8075;font-size:calc(15px * var(--font-scale,1));font-weight:600;line-height:1.5;overflow-wrap:anywhere;}',
      '.native-speech-status.is-error{color:#8A4D27;}',
      '.native-speech-status.is-draft{color:#35473C;font-weight:800;}',
      '@keyframes nativeSpeechPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.38;transform:scale(.78)}}',
      '@media(max-width:600px){.native-speech-button{width:100%;min-height:56px;font-size:calc(19px * var(--font-scale,1));}.native-speech-tools{margin-top:8px;}}',
      '@media(prefers-reduced-motion:reduce){.native-speech-dot{animation:none;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function createTools(id) {
    var wrapper = document.createElement('div');
    wrapper.className = 'native-speech-tools';
    wrapper.id = id;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'native-speech-button';
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', tr(TEXT.start));
    button.appendChild(createMicSvg());

    var dot = document.createElement('span');
    dot.className = 'native-speech-dot';
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);

    var label = document.createElement('span');
    label.className = 'native-speech-label';
    label.textContent = tr(TEXT.start);
    button.appendChild(label);

    var status = document.createElement('p');
    status.className = 'native-speech-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    wrapper.appendChild(button);
    wrapper.appendChild(status);
    button.addEventListener('click', function () {
      handleButtonClick(wrapper);
    });
    return wrapper;
  }

  function setStatus(wrapper, message, kind) {
    if (!wrapper) return;
    var status = wrapper.querySelector('.native-speech-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-draft', kind === 'draft');
  }

  function setButtonState(wrapper, recording) {
    if (!wrapper) return;
    var button = wrapper.querySelector('.native-speech-button');
    var label = wrapper.querySelector('.native-speech-label');
    if (!button || !label) return;
    button.classList.toggle('is-recording', !!recording);
    button.setAttribute('aria-pressed', recording ? 'true' : 'false');
    button.setAttribute('aria-label', tr(recording ? TEXT.stop : TEXT.start));
    label.textContent = tr(recording ? TEXT.stop : TEXT.start);
  }

  function getErrorMessage(errorCode) {
    switch (errorCode) {
      case 'not-allowed':
      case 'service-not-allowed':
        return TEXT.denied;
      case 'no-speech':
        return TEXT.noSpeech;
      case 'audio-capture':
        return TEXT.noMic;
      case 'network':
        return TEXT.network;
      case 'language-not-supported':
        return TEXT.language;
      case 'aborted':
        return '';
      default:
        return TEXT.generic;
    }
  }

  function dispatchInput(input) {
    var event;
    try {
      event = new Event('input', { bubbles: true });
    } catch (error) {
      event = document.createEvent('Event');
      event.initEvent('input', true, false);
    }
    input.dispatchEvent(event);
  }

  function appendText(existing, spoken) {
    var base = String(existing == null ? '' : existing);
    var addition = String(spoken == null ? '' : spoken).trim();
    if (!addition) return base;
    if (!base) return addition;
    if (/\s$/.test(base)) return base + addition;
    if (/^[，。！？、；：,.!?;:）)】」』]/.test(addition)) return base + addition;
    var baseEndsCjk = /[\u3400-\u9FFF\uF900-\uFAFF]$/.test(base);
    var additionStartsCjk = /^[\u3400-\u9FFF\uF900-\uFAFF]/.test(addition);
    return base + (baseEndsCjk && additionStartsCjk ? '' : ' ') + addition;
  }

  function clearSessionUI(session) {
    if (!session || !session.wrapper) return;
    setButtonState(session.wrapper, false);
  }

  function stopSession(session, discard) {
    if (!session || !session.recognition) return;
    if (discard) session.discard = true;
    clearSessionTimers(session);
    session.manualStop = !discard;
    if (!discard) setStatus(session.wrapper, tr(TEXT.stopping));
    try {
      if (discard && typeof session.recognition.abort === 'function') {
        session.recognition.abort();
      } else {
        session.recognition.stop();
      }
    } catch (error) {
      if (activeSession === session) activeSession = null;
      clearSessionUI(session);
    }
  }

  function commitSession(session) {
    if (!session || session.discard) return;
    var recognized = String(session.finalText || '').trim();
    if (!recognized) {
      setStatus(session.wrapper, tr(session.errorMessage || TEXT.empty), 'error');
      return;
    }

    var input = session.input;
    if (!input || !document.documentElement.contains(input)) return;
    // Read the current value at commit time, so text entered while listening is also preserved.
    input.value = appendText(input.value, recognized);
    dispatchInput(input);
    try {
      if (input.type === 'text' && typeof input.setSelectionRange === 'function') {
        var end = input.value.length;
        input.setSelectionRange(end, end);
      }
    } catch (error) {}
    setStatus(session.wrapper, tr(TEXT.success));
  }

  function clearSessionTimers(session) {
    if (!session) return;
    ['startupTimer', 'audioTimer', 'speechTimer', 'resultTimer'].forEach(function (key) {
      if (session[key]) { clearTimeout(session[key]); session[key] = null; }
    });
  }

  function focusKeyboardFallback(input, wrapper, reason) {
    var message = '目前無法使用網頁語音辨識，請點選鍵盤上的麥克風說出答案，或直接輸入文字。';
    if (/not-allowed|service-not-allowed|NotAllowedError/i.test(String(reason || ''))) {
      message = '網站尚未取得麥克風或語音辨識權限。請檢查 iPhone 的網站麥克風權限；也可以點選輸入框，使用鍵盤上的麥克風聽寫。';
    } else if (/language-not-supported|語言/i.test(String(reason || ''))) {
      message = '目前瀏覽器不支援所選的語音辨識語言，請改用 iPhone 鍵盤聽寫或直接輸入文字。';
    } else if (/network/i.test(String(reason || ''))) {
      message = '瀏覽器語音辨識服務目前無法連線，請確認網路，或改用 iPhone 鍵盤聽寫及文字輸入。';
    }
    logDiagnostic('IOS_KEYBOARD_FALLBACK', reason || '網頁辨識不可用');
    setButtonState(wrapper, false);
    setStatus(wrapper, tr(message), 'error');
    if (input && document.documentElement.contains(input) && !input.disabled && !input.readOnly) {
      try { input.focus({ preventScroll: false }); } catch (error) { try { input.focus(); } catch (ignore) {} }
    }
  }

  function startRecognition(input, wrapper) {
    var isIOS = isIOSDevice();
    var SpeechRecognitionCtor = getRecognitionCtor();
    logDiagnostic('CLICK', 'iOS=' + isIOS + ', secure=' + isSecureEnough() + ', api=' + (SpeechRecognitionCtor ? 'present' : 'missing') + ', restrictedContainer=' + isRestrictedIOSContainer());

    if (isIOS && isRestrictedIOSContainer()) {
      logDiagnostic('A_RESTRICTED_IOS_CONTAINER', '主畫面網頁 App 或 App 內建瀏覽器／WKWebView');
      focusKeyboardFallback(input, wrapper, 'iOS 受限瀏覽器環境');
      return;
    }
    if (!isSecureEnough()) {
      logDiagnostic('A_SECURE_CONTEXT_FAIL', location.href);
      if (isIOS) focusKeyboardFallback(input, wrapper, '非 HTTPS 或非安全環境');
      else setStatus(wrapper, tr('語音輸入需要使用 HTTPS 網址開啟，請從正式網站進入。'), 'error');
      return;
    }
    if (!SpeechRecognitionCtor) {
      logDiagnostic('A_API_MISSING', 'SpeechRecognition 與 webkitSpeechRecognition 均不存在');
      if (isIOS) focusKeyboardFallback(input, wrapper, '此 iOS 環境沒有可用的 Web Speech API');
      else setStatus(wrapper, tr(TEXT.unavailable), 'error');
      return;
    }
    if (activeSession) {
      if (activeSession.wrapper === wrapper) stopSession(activeSession, false);
      else { stopSession(activeSession, true); setStatus(wrapper, tr('已停止另一個錄音，請再點一次開始。')); }
      return;
    }

    var recognition;
    try {
      recognition = new SpeechRecognitionCtor();
      logDiagnostic('B_CONSTRUCTOR_OK', '辨識物件建立成功');
    } catch (error) {
      logDiagnostic('B_CONSTRUCTOR_FAIL', (error && error.name || 'Error') + ': ' + (error && error.message || error));
      if (isIOS) focusKeyboardFallback(input, wrapper, '建立辨識物件失敗');
      else setStatus(wrapper, tr(TEXT.generic), 'error');
      return;
    }

    var lang = getRecognitionLanguage();
    var session = { recognition: recognition, input: input, wrapper: wrapper, finalText: '', interimText: '',
      errorMessage: '', manualStop: false, discard: false, lang: lang, gotStart: false, gotAudio: false,
      gotSpeech: false, gotResult: false, errorCode: '', startupTimer: null, audioTimer: null,
      speechTimer: null, resultTimer: null };
    try {
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      logDiagnostic('C_LANGUAGE_SET', lang);
    } catch (error) { logDiagnostic('C_LANGUAGE_SET_FAIL', String(error && error.message || error)); }

    recognition.onstart = function () {
      if (activeSession !== session) return;
      session.gotStart = true;
      if (session.startupTimer) { clearTimeout(session.startupTimer); session.startupTimer = null; }
      logDiagnostic('START_EVENT', '辨識服務回報 onstart');
      setButtonState(wrapper, true); setStatus(wrapper, tr(TEXT.listening));
      session.audioTimer = setTimeout(function () {
        if (activeSession !== session || session.gotAudio) return;
        logDiagnostic('D_NO_AUDIOSTART', 'onstart 後 8 秒未收到 audiostart');
        stopSession(session, true);
        if (isIOS) focusKeyboardFallback(input, wrapper, '辨識啟動後沒有 audio 音訊事件');
        else setStatus(wrapper, tr(TEXT.generic), 'error');
      }, 8000);
    };
    recognition.onaudiostart = function () {
      if (activeSession !== session) return;
      session.gotAudio = true;
      if (session.audioTimer) { clearTimeout(session.audioTimer); session.audioTimer = null; }
      logDiagnostic('D_AUDIOSTART', '已收到音訊開始事件');
      session.speechTimer = setTimeout(function () {
        if (activeSession !== session || session.gotSpeech) return;
        logDiagnostic('E_NO_SPEECHSTART', '收到 audiostart，12 秒內沒有 speechstart');
        stopSession(session, true);
        if (isIOS) focusKeyboardFallback(input, wrapper, '有音訊但沒有偵測到語音');
        else setStatus(wrapper, tr(TEXT.noSpeech), 'error');
      }, 12000);
    };
    recognition.onspeechstart = function () {
      if (activeSession !== session) return;
      session.gotSpeech = true;
      if (session.speechTimer) { clearTimeout(session.speechTimer); session.speechTimer = null; }
      logDiagnostic('E_SPEECHSTART', '已收到語音開始事件');
      session.resultTimer = setTimeout(function () {
        if (activeSession !== session || session.gotResult) return;
        logDiagnostic('F_NO_RESULT', '收到 speechstart，20 秒內沒有 result');
        stopSession(session, true);
        if (isIOS) focusKeyboardFallback(input, wrapper, '已偵測到說話，但沒有辨識結果');
        else setStatus(wrapper, tr(TEXT.empty), 'error');
      }, 20000);
    };
    recognition.onresult = function (event) {
      if (activeSession !== session) return;
      session.gotResult = true;
      if (session.resultTimer) { clearTimeout(session.resultTimer); session.resultTimer = null; }
      var finalParts = [], interimParts = [];
      for (var i = 0; i < event.results.length; i++) {
        var item = event.results[i];
        var phrase = item && item[0] ? String(item[0].transcript || '') : '';
        if (!phrase) continue;
        if (item.isFinal) finalParts.push(phrase); else interimParts.push(phrase);
      }
      session.finalText = finalParts.join('').trim();
      session.interimText = interimParts.join('').trim();
      logDiagnostic('F_RESULT', '收到 result；final=' + !!session.finalText + '；lang=' + session.lang);
      if (session.interimText) setStatus(wrapper, tr(TEXT.draft) + session.interimText, 'draft');
      else if (session.finalText) setStatus(wrapper, tr(TEXT.stopping));
    };
    recognition.onspeechend = function () { logDiagnostic('SPEECH_END', '收到 onspeechend'); try { recognition.stop(); } catch (error) {} };
    recognition.onerror = function (event) {
      if (activeSession !== session) return;
      session.errorCode = event && event.error ? String(event.error) : 'unknown';
      session.errorMessage = getErrorMessage(session.errorCode);
      logDiagnostic('ERROR_EVENT', session.errorCode + (event && event.message ? ': ' + event.message : ''));
      if (session.errorCode === 'language-not-supported') logDiagnostic('C_LANGUAGE_UNSUPPORTED', session.lang);
      if (session.errorMessage) setStatus(wrapper, tr(session.errorMessage), 'error');
    };
    recognition.onend = function () {
      if (activeSession === session) activeSession = null;
      clearSessionTimers(session); clearSessionUI(session);
      logDiagnostic('END_EVENT', 'audio=' + session.gotAudio + ', speech=' + session.gotSpeech + ', result=' + session.gotResult + ', error=' + (session.errorCode || 'none'));
      if (session.discard) return;
      if (session.finalText) {
        commitSession(session);
        var confirmed = input && input.value.indexOf(session.finalText) !== -1;
        logDiagnostic(confirmed ? 'G_INPUT_WRITE_OK' : 'G_INPUT_WRITE_FAIL', '輸入框寫入確認=' + confirmed);
        if (!confirmed && isIOS) focusKeyboardFallback(input, wrapper, '辨識結果未能寫入輸入框');
      } else if (isIOS && !session.manualStop) {
        focusKeyboardFallback(input, wrapper, session.errorCode || (!session.gotAudio ? '未取得音訊事件' : (!session.gotSpeech ? '未偵測到語音' : '沒有辨識結果')));
      } else if (!session.errorCode && !session.manualStop) setStatus(wrapper, tr(TEXT.empty), 'error');
    };

    // TTS 與語音辨識不可同時占用音訊工作階段；如前一段播放尚未結束，先停止播放。
    try {
      var audioState = typeof window.__getExamAudioPlaybackState === 'function' ? window.__getExamAudioPlaybackState() : null;
      if (audioState && audioState.playing) {
        logDiagnostic('TTS_CONFLICT', JSON.stringify({ synthesis: audioState.synthesis, globalAudio: audioState.globalAudio, hakkaAudio: audioState.hakkaAudio }));
        if (typeof audioState.stop === 'function') audioState.stop();
      } else logDiagnostic('TTS_IDLE', audioState ? JSON.stringify(audioState) : '未提供主程式音訊狀態');
    } catch (error) { logDiagnostic('TTS_STATE_CHECK_FAIL', String(error && error.message || error)); }

    activeSession = session;
    setButtonState(wrapper, true); setStatus(wrapper, tr(TEXT.listening));
    try {
      recognition.start();
      logDiagnostic('C_START_CALL_RETURNED', 'start() 同步返回；仍須等待 onstart/audio/result 確認');
    } catch (error) {
      activeSession = null; clearSessionTimers(session); clearSessionUI(session);
      var name = error && error.name ? error.name : 'Error';
      logDiagnostic('C_START_THROW', name + ': ' + (error && error.message || error));
      if (isIOS) focusKeyboardFallback(input, wrapper, 'recognition.start() 同步失敗：' + name);
      else setStatus(wrapper, tr(name === 'NotAllowedError' ? TEXT.denied : TEXT.generic), 'error');
      return;
    }
    session.startupTimer = setTimeout(function () {
      if (activeSession !== session || session.gotStart) return;
      logDiagnostic('C_NO_START_EVENT', 'start() 返回後 8 秒未收到 onstart');
      stopSession(session, true);
      if (isIOS) focusKeyboardFallback(input, wrapper, 'start() 已呼叫但辨識服務沒有啟動');
      else setStatus(wrapper, tr(TEXT.generic), 'error');
    }, 8000);
  }

  function handleButtonClick(wrapper) {
    var inputId = wrapper.getAttribute('data-input-id');
    var input = inputId ? document.getElementById(inputId) : null;
    if (!input) return;
    if (activeSession && activeSession.wrapper === wrapper) {
      stopSession(activeSession, false);
      return;
    }
    startRecognition(input, wrapper);
  }

  function ensureWrapper(id, input, anchor) {
    if (!input || !anchor || !anchor.parentNode) return null;
    var wrapper = document.getElementById(id);
    if (!wrapper) wrapper = createTools(id);
    wrapper.setAttribute('data-input-id', input.id);
    if (wrapper.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement('afterend', wrapper);
    }
    return wrapper;
  }

  function isP1VoiceQuestion() {
    var state = window.examState;
    if (!state || !state.p1 || !Array.isArray(state.p1.questions)) return false;
    var question = state.p1.questions[state.p1.currentIndex];
    if (!question) return false;
    return question.type === 'q4' || question.isQ5 === true ||
      (question.type === 'q1' && state.p1.currentMode === 'zodiac');
  }

  function canUseInput(input) {
    if (!input || input.disabled || input.readOnly) return false;
    if (String(input.type || '').toLowerCase() !== 'text') return false;
    if (input.style && input.style.display === 'none') return false;
    return true;
  }

  function setWrapperVisible(wrapper, visible) {
    if (!wrapper) return;
    wrapper.hidden = !visible;
    wrapper.style.display = visible ? 'flex' : 'none';
  }

  function syncControls() {
    var p1Input = document.getElementById('p1-answer-input');
    var p1Control = document.getElementById('p1-answer-control');
    var p1Group = document.getElementById('p1-input-group');
    var p1Wrapper = ensureWrapper('p1-native-speech-tools', p1Input, p1Control);
    var p1GroupVisible = !!(p1Group && p1Group.style.display !== 'none');
    var p1Visible = document.body.getAttribute('data-step') === 'step-p1' &&
      p1GroupVisible && isP1VoiceQuestion() && canUseInput(p1Input);
    if (p1Wrapper) {
      setWrapperVisible(p1Wrapper, p1Visible);
      configureSupport(p1Wrapper);
    }

    var p2Input = document.getElementById('p2-recall-input');
    var p2Entry = p2Input ? p2Input.closest('.p2-recall-entry') : null;
    var p2Wrapper = ensureWrapper('p2-native-speech-tools', p2Input, p2Entry);
    var p2Visible = document.body.getAttribute('data-step') === 'step-p2-sop5' &&
      canUseInput(p2Input);
    if (p2Wrapper) {
      setWrapperVisible(p2Wrapper, p2Visible);
      configureSupport(p2Wrapper);
    }

    if (activeSession) {
      var currentStep = document.body.getAttribute('data-step');
      var stillInTargetStep = activeSession.input.id === 'p1-answer-input'
        ? currentStep === 'step-p1'
        : currentStep === 'step-p2-sop5';
      if (!stillInTargetStep) stopSession(activeSession, true);
    }
  }

  function configureSupport(wrapper) {
    if (!wrapper) return;
    var button = wrapper.querySelector('.native-speech-button');
    if (!button) return;
    var supported = !!getRecognitionCtor() && isSecureEnough();
    button.disabled = !supported && !isIOSDevice();
    button.title = tr(supported ? TEXT.start : (isIOSDevice() ? TEXT.unavailableIOS : TEXT.unavailable));
    var label = wrapper.querySelector('.native-speech-label');
    if (label && !activeSession) label.textContent = tr(supported || isIOSDevice() ? TEXT.start : '語音輸入不可用');
    if (!supported && !isIOSDevice()) {
      setStatus(wrapper, tr(!isSecureEnough() ? '語音輸入需要使用 HTTPS 網址開啟，請從正式網站進入。' : TEXT.unavailable), 'error');
    } else if (supported && !activeSession) setStatus(wrapper, '');
  }

  function init() {
    addTranslations();
    injectStyles();
    syncControls();

    var bodyObserver = new MutationObserver(function () {
      syncControls();
    });
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-step'],
      childList: true,
      subtree: false
    });

    var p1Group = document.getElementById('p1-input-group');
    if (p1Group) {
      observer = new MutationObserver(function () { syncControls(); });
      observer.observe(p1Group, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['type', 'readonly', 'disabled', 'style', 'class']
      });
    }

    var p2Entry = document.querySelector('#step-p2-sop5 .p2-recall-entry');
    if (p2Entry) {
      var p2Observer = new MutationObserver(function () { syncControls(); });
      p2Observer.observe(p2Entry, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['type', 'readonly', 'disabled', 'style', 'class']
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && activeSession) stopSession(activeSession, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
