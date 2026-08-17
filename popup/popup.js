/**
 * popup.js - 浏览器插件快捷弹窗控制器
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. 从 Chrome 本地存储加载最新分析指标
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['lastAnalysisSummary', 'lastFitResult', 'currentDatasetName'], (result) => {
      if (result.lastAnalysisSummary) {
        document.getElementById('popupER').textContent = result.lastAnalysisSummary.extinctionRatio || '-';
      }
      if (result.lastFitResult) {
        document.getElementById('popupR2').textContent = `${result.lastFitResult.params.rSquaredPercent}%` || '-';
        document.getElementById('popupTheta').textContent = `${result.lastFitResult.params.theta0}°` || '-';
      }
      if (result.currentDatasetName) {
        document.getElementById('quickDatasetName').textContent = `数据: ${result.currentDatasetName}`;
      }
    });
  }

  // 2. 按钮：打开全屏工作台
  document.getElementById('btnOpenFullDashboard').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    } else {
      window.open('../index.html', '_blank');
    }
  });

  // 3. 按钮：打开侧边停靠栏 (Side Panel)
  document.getElementById('btnOpenSidePanel').addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      }
    } else {
      window.open('../index.html', '_blank');
    }
  });

  // 4. 按钮：从剪贴板读取数据并暂存
  document.getElementById('btnPasteFromClipboard').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length > 0) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ pendingClipboardData: text }, () => {
            if (chrome.tabs) {
              chrome.tabs.create({ url: chrome.runtime.getURL('index.html?source=clipboard') });
            }
          });
        } else {
          localStorage.setItem('pendingClipboardData', text);
          window.open('../index.html?source=clipboard', '_blank');
        }
      } else {
        alert('剪贴板中未检测到有效数据，请先复制数据！');
      }
    } catch (err) {
      alert('请允许剪贴板读取权限，或在全屏工作台中直接粘贴。');
    }
  });
});
