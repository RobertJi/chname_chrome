// 弹出窗口脚本
document.addEventListener('DOMContentLoaded', function() {
  const enabledSwitch = document.getElementById('enabled');
  const useDefaultRulesSwitch = document.getElementById('useDefaultRules');
  const rulesContainer = document.getElementById('rulesContainer');
  const addRuleBtn = document.getElementById('addRule');

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
        console.log('无法加载配置文件:', error);
        callback([]);
      });
  }

  // 加载配置
  function loadConfig() {
    chrome.storage.sync.get(['replaceRules', 'enabled', 'useDefaultRules'], function(result) {
      const userRules = result.replaceRules || [];
      const enabled = result.enabled !== false;
      const useDefaultRules = result.useDefaultRules !== false;

      enabledSwitch.checked = enabled;
      useDefaultRulesSwitch.checked = useDefaultRules;
      
      // 加载并显示所有规则（包括配置文件中的默认规则）
      loadDefaultRules(function(defaultRules) {
        const allRules = useDefaultRules 
          ? [...defaultRules, ...userRules]
          : userRules;
        renderRules(allRules, useDefaultRules ? defaultRules.length : 0);
      });
    });
  }

  // 渲染规则列表
  function renderRules(rules, defaultRulesCount) {
    rulesContainer.innerHTML = '';
    defaultRulesCount = defaultRulesCount || 0;

    if (rules.length === 0) {
      rulesContainer.innerHTML = '<div class="empty-state">暂无替换规则，点击下方按钮添加</div>';
      return;
    }

    rules.forEach((rule, index) => {
      const ruleItem = document.createElement('div');
      ruleItem.className = 'rule-item';
      const isDefaultRule = index < defaultRulesCount;
      const readonlyAttr = isDefaultRule ? 'readonly title="这是配置文件中的默认规则（在config.csv中配置）"' : '';
      const readonlyClass = isDefaultRule ? ' readonly' : '';
      ruleItem.innerHTML = `
        <input type="text" class="original-text${readonlyClass}" placeholder="原文本" value="${escapeHtml(rule.original || '')}" data-index="${index}" data-is-default="${isDefaultRule}" ${readonlyAttr}>
        <span class="arrow">→</span>
        <input type="text" class="replacement-text${readonlyClass}" placeholder="替换为" value="${escapeHtml(rule.replacement || '')}" data-index="${index}" data-is-default="${isDefaultRule}" ${readonlyAttr}>
        <button class="btn-remove" data-index="${index}" data-is-default="${isDefaultRule}" ${isDefaultRule ? 'disabled title="默认规则不能删除"' : ''}>删除</button>
      `;
      rulesContainer.appendChild(ruleItem);
      if (isDefaultRule && index === 0) {
        const info = document.createElement('div');
        info.className = 'config-info';
        info.textContent = '灰色背景的规则来自config.json配置文件';
        ruleItem.appendChild(info);
      }
    });

    // 绑定事件
    document.querySelectorAll('.original-text:not(.readonly), .replacement-text:not(.readonly)').forEach(input => {
      input.addEventListener('input', function() {
        const index = parseInt(this.dataset.index);
        const isDefault = this.dataset.isDefault === 'true';
        if (!isDefault) {
          saveRule(index - defaultRulesCount, this.classList.contains('original-text') ? 'original' : 'replacement', this.value);
        }
      });
    });

    document.querySelectorAll('.btn-remove:not([disabled])').forEach(btn => {
      btn.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        const isDefault = this.dataset.isDefault === 'true';
        if (!isDefault) {
          removeRule(index - defaultRulesCount);
        }
      });
    });
  }

  // 保存规则
  function saveRule(index, field, value) {
    chrome.storage.sync.get(['replaceRules'], function(result) {
      const rules = result.replaceRules || [];
      if (!rules[index]) {
        rules[index] = { original: '', replacement: '' };
      }
      rules[index][field] = value;
      chrome.storage.sync.set({ replaceRules: rules }, function() {
        // 通知内容脚本更新
        notifyContentScript();
      });
    });
  }

  // 删除规则
  function removeRule(index) {
    chrome.storage.sync.get(['replaceRules'], function(result) {
      const rules = result.replaceRules || [];
      rules.splice(index, 1);
      chrome.storage.sync.set({ replaceRules: rules }, function() {
        renderRules(rules);
        notifyContentScript();
      });
    });
  }

  // 添加新规则
  addRuleBtn.addEventListener('click', function() {
    chrome.storage.sync.get(['replaceRules'], function(result) {
      const rules = result.replaceRules || [];
      rules.push({ original: '', replacement: '' });
      chrome.storage.sync.set({ replaceRules: rules }, function() {
        renderRules(rules);
        notifyContentScript();
      });
    });
  });

  // 切换启用状态
  enabledSwitch.addEventListener('change', function() {
    chrome.storage.sync.set({ enabled: this.checked }, function() {
      notifyContentScript();
    });
  });

  // 切换使用默认规则
  useDefaultRulesSwitch.addEventListener('change', function() {
    chrome.storage.sync.set({ useDefaultRules: this.checked }, function() {
      loadConfig(); // 重新加载配置以更新显示
      notifyContentScript();
    });
  });

  // 通知内容脚本更新
  function notifyContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'update' });
      }
    });
  }

  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 初始化
  loadConfig();
});

