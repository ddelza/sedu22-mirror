// sedu22-mirror 공용 로컬 설정 유틸 (테마 / 장바구니 / 내보내기·불러오기·초기화).
// explore.html, settings.html 양쪽에서 <script src="shared.js"></script>로 불러 쓴다.
// 새로운 로컬 설정값을 추가할 때는 MANAGED_KEYS에 항목만 추가하면
// 설정 페이지의 내보내기/불러오기/초기화가 자동으로 그 값을 포함한다.
(function (global) {
  const THEME_KEY = 'sedu22_theme';
  const CART_KEY = 'sedu22_cart';

  const THEMES = [
    { key: '', name: '클래식 블루', group: 'light' },
    { key: 'forest', name: '포레스트 그린', group: 'light' },
    { key: 'lavender', name: '라벤더', group: 'light' },
    { key: 'slate', name: '슬레이트 그레이', group: 'light' },
    { key: 'dark-navy', name: '다크 네이비', group: 'dark' },
    { key: 'dark-forest', name: '다크 포레스트', group: 'dark' },
    { key: 'dark-plum', name: '다크 플럼', group: 'dark' },
    { key: 'claude', name: 'Claude', group: 'brand' },
    { key: 'notion', name: 'Notion', group: 'brand' },
    { key: 'apple', name: 'Apple', group: 'brand' },
  ];

  // 브랜드 테마 중 구글 폰트가 필요한 것만 등록 (Apple은 시스템 폰트만 사용)
  const THEME_FONTS = {
    claude: 'Nanum+Myeongjo',
    notion: 'Noto+Sans+KR:wght@400;600;700',
  };

  const MANAGED_KEYS = [
    { key: THEME_KEY, label: '화면 테마 설정' },
    { key: CART_KEY, label: '장바구니(담아둔 수업 자료) 목록' },
  ];

  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; }
  }

  function setTheme(key) {
    try { localStorage.setItem(THEME_KEY, key); } catch (e) {}
    if (key) document.documentElement.setAttribute('data-theme', key);
    else document.documentElement.removeAttribute('data-theme');
  }

  // FOUC 방지용: <head> 맨 위에서 동기적으로 이미 data-theme을 세팅해뒀다는 전제 하에,
  // 폰트만 필요하면 비동기로 추가 로드한다. 각 페이지에서 직접 호출한다.
  function loadThemeFontIfNeeded() {
    try {
      const t = getTheme();
      const family = THEME_FONTS[t];
      if (!family) return;
      const pre1 = document.createElement('link');
      pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
      const pre2 = document.createElement('link');
      pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = '';
      const sheet = document.createElement('link');
      sheet.rel = 'stylesheet';
      sheet.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
      document.head.appendChild(pre1);
      document.head.appendChild(pre2);
      document.head.appendChild(sheet);
    } catch (e) {}
  }

  function getCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function setCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
  }

  function isInCart(id) {
    return getCart().some((it) => it.id === id);
  }

  function addToCart(item) {
    const cart = getCart();
    if (cart.some((it) => it.id === item.id)) return cart;
    cart.unshift({
      id: item.id,
      title: item.title || '',
      board: item.board || '',
      created: item.created || '',
      addedAt: new Date().toISOString(),
    });
    setCart(cart);
    return cart;
  }

  function removeFromCart(id) {
    const cart = getCart().filter((it) => it.id !== id);
    setCart(cart);
    return cart;
  }

  function clearCart() {
    setCart([]);
  }

  // ---- 설정 내보내기 / 불러오기 / 초기화 ----
  function exportSettings() {
    const data = { app: 'sedu22-mirror-settings', version: 1, exportedAt: new Date().toISOString(), values: {} };
    for (const { key } of MANAGED_KEYS) {
      try {
        const v = localStorage.getItem(key);
        if (v !== null) data.values[key] = v;
      } catch (e) {}
    }
    return data;
  }

  function importSettings(data) {
    if (!data || typeof data !== 'object' || !data.values) {
      throw new Error('올바른 설정 파일이 아닙니다.');
    }
    const known = MANAGED_KEYS.map((m) => m.key);
    for (const key of Object.keys(data.values)) {
      if (!known.includes(key)) continue; // 알 수 없는 키는 무시
      try { localStorage.setItem(key, data.values[key]); } catch (e) {}
    }
  }

  function resetSettings() {
    for (const { key } of MANAGED_KEYS) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
  }

  global.Sedu22Local = {
    THEME_KEY, CART_KEY, THEMES, MANAGED_KEYS,
    getTheme, setTheme, loadThemeFontIfNeeded,
    getCart, setCart, isInCart, addToCart, removeFromCart, clearCart,
    exportSettings, importSettings, resetSettings,
  };
})(window);
