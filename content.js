// 文本替换内容脚本
(function() {
  'use strict';

  // 解析CSV文本为规则数组
  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const rules = [];
    
    // 跳过标题行（第一行）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // 跳过空行
      
      // 处理CSV，支持引号内的逗号
      const parts = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim()); // 添加最后一个字段
      
      if (parts.length >= 2) {
        const original = parts[0].replace(/^"|"$/g, ''); // 移除引号
        const replacement = parts[1].replace(/^"|"$/g, ''); // 移除引号
        if (original && replacement) {
          rules.push({ original, replacement });
        }
      }
    }
    
    return rules;
  }

  // 从配置文件加载默认规则
  function loadDefaultRules(callback) {
    fetch(chrome.runtime.getURL('config.csv'))
      .then(response => response.text())
      .then(csvText => {
        const rules = parseCSV(csvText);
        callback(rules);
      })
      .catch(error => {
        console.log('无法加载配置文件，使用空规则:', error);
        callback([]);
      });
  }

  // 从存储中获取替换规则（合并配置文件中的默认规则）
  function getReplaceRules(callback) {
    chrome.storage.sync.get(['replaceRules', 'enabled', 'useDefaultRules'], function(result) {
      const userRules = result.replaceRules || [];
      const useDefaultRules = result.useDefaultRules !== false; // 默认使用配置文件规则
      const enabled = result.enabled !== false;

      if (useDefaultRules) {
        // 合并配置文件中的默认规则和用户自定义规则
        loadDefaultRules(function(defaultRules) {
          // 合并规则：先使用默认规则，然后添加用户自定义规则
          const allRules = [...defaultRules, ...userRules];
          callback(allRules, enabled);
        });
      } else {
        // 只使用用户自定义规则
        callback(userRules, enabled);
      }
    });
  }

  // 执行文本替换
  function replaceText(node, rules, enabled) {
    if (!enabled) return;

    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent;
      let modified = false;

      rules.forEach(rule => {
        if (rule.original && rule.replacement && text.includes(rule.original)) {
          text = text.replace(new RegExp(escapeRegExp(rule.original), 'g'), rule.replacement);
          modified = true;
        }
      });

      if (modified) {
        node.textContent = text;
      }
    } else {
      // 递归处理子节点
      for (let child of node.childNodes) {
        replaceText(child, rules, enabled);
      }
    }
  }

  // 转义正则表达式特殊字符
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 使用MutationObserver监听DOM变化
  function observeChanges(rules, enabled) {
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes.length) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              replaceText(node, rules, enabled);
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 初始化
  function init() {
    getReplaceRules(function(rules, enabled) {
      if (enabled && rules.length > 0) {
        replaceText(document.body, rules, enabled);
        observeChanges(rules, enabled);
      }
    });
  }

  // 监听存储变化，实时更新替换规则
  chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === 'sync' && (changes.replaceRules || changes.enabled)) {
      getReplaceRules(function(rules, enabled) {
        // 重新执行替换
        replaceText(document.body, rules, enabled);
      });
    }
  });

  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'update') {
      getReplaceRules(function(rules, enabled) {
        // 重新执行替换
        replaceText(document.body, rules, enabled);
      });
    }
  });

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

