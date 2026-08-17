/**
 * state-store.js (Core Reactive Store - Hardened)
 * 状态与持久化引擎：跨环境沙箱防护 (chrome.storage 与 localStorage 安全容灾)
 */

class StateStore {
  constructor() {
    this.state = {
      theme: 'light',
      journalTheme: 'nature',
      currentDatasetName: 'Pol.txt (实测数据)',
      latestMetrics: null,
      bgConfig: { algo: 'constant', clampZero: true },
      filterConfig: { type: 'gaussian', sigma: 1.2, enableSpline: true },
      fitConfig: { showFit: true, errorType: 'sd' }
    };

    this.listeners = [];
    this.initFromStorage();
  }

  initFromStorage() {
    // 优先从 chrome.storage.local 读取，容灾回退至 localStorage
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['plo_state'], (result) => {
          if (chrome.runtime.lastError) return;
          if (result && result.plo_state) {
            this.state = { ...this.state, ...result.plo_state };
            this.notifyListeners();
          }
        });
      } else if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('plo_state');
        if (saved) {
          this.state = { ...this.state, ...JSON.parse(saved) };
          this.notifyListeners();
        }
      }
    } catch (e) {
      console.warn('存储读取受到沙箱限制，使用内存状态:', e);
    }
  }

  setState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.saveToStorage();
    this.notifyListeners();
  }

  getState() {
    return this.state;
  }

  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try { cb(this.state); } catch (e) { console.error('State listener error:', e); }
    });
  }

  saveToStorage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ plo_state: this.state });
      } else if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('plo_state', JSON.stringify(this.state));
      }
    } catch (e) {
      // 静默沙箱安全异常
    }
  }

  saveLatestMetrics(summary, fitResult) {
    const metrics = {
      timestamp: Date.now(),
      extinctionRatio: summary ? summary.extinctionRatio : '-',
      extinctionDB: summary ? summary.extinctionDB : '-',
      modulation: summary ? summary.modulationPercent : '-',
      rSquared: fitResult ? fitResult.params.rSquaredPercent : '-',
      theta0: fitResult ? fitResult.params.theta0 : '-',
      rmse: fitResult ? fitResult.params.rmse : '-'
    };

    this.setState({ latestMetrics: metrics });

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ latestMetrics: metrics });
      }
    } catch (e) {}
  }
}

if (typeof window !== 'undefined') {
  window.StateStore = StateStore;
}
