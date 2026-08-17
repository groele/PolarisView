/**
 * extension-bridge.js - 浏览器扩展环境适配桥接器
 */

class ExtensionBridge {
  static isExtensionEnv() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  }

  /**
   * 检查是否有通过 Popup 暂存的剪贴板数据
   */
  static checkPendingClipboard(callback) {
    if (this.isExtensionEnv() && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['pendingClipboardData'], (result) => {
        if (result.pendingClipboardData) {
          callback(result.pendingClipboardData);
          chrome.storage.local.remove('pendingClipboardData');
        }
      });
    } else if (typeof localStorage !== 'undefined') {
      const pending = localStorage.getItem('pendingClipboardData');
      if (pending) {
        callback(pending);
        localStorage.removeItem('pendingClipboardData');
      }
    }
  }

  /**
   * 通知后台 Service Worker 或 Popup 更新
   */
  static notifyStateUpdate(summary, fitResult) {
    if (this.isExtensionEnv()) {
      chrome.storage.local.set({
        lastAnalysisSummary: summary,
        lastFitResult: fitResult
      }).catch(() => {});
    }
  }
}

if (typeof window !== 'undefined') {
  window.ExtensionBridge = ExtensionBridge;
}
