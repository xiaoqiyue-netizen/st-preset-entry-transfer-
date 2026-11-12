const EXTENSION_ID = 'preset-entry-transfer';
const GLOBAL_CHARACTER_ID = 100000;
const RESERVED_PROMPT_IDS = new Set([
    'main', 'nsfw', 'jailbreak', 'enhanceDefinitions',
    'dialogueExamples', 'chatHistory', 'worldInfoAfter', 'worldInfoBefore',
    'charDescription', 'charPersonality', 'scenario', 'personaDescription',
    'worldInfoBefore', 'worldInfoAfter', 'auxiliaryPrompt', 'postHistoryInstructions',
]);

let sourcePreset = null;
let targetPreset = null;
let sourceFileName = '';
let targetFileName = '';

function notify(message, kind = 'info') {
    if (window.toastr && typeof window.toastr[kind] === 'function') {
        window.toastr[kind](message);
    } else {
        console[kind === 'error' ? 'error' : 'log'](`[${EXTENSION_ID}] ${message}`);
    }
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getPromptOrder(preset) {
    if (!Array.isArray(preset.prompt_order)) return null;
    return preset.prompt_order.find(entry => Number(entry.character_id) === GLOBAL_CHARACTER_ID) || null;
}

function getCandidatePrompts(preset) {
    if (!preset || !Array.isArray(preset.prompts)) return [];
    return preset.prompts.filter(prompt =>
        prompt &&
        typeof prompt === 'object' &&
        typeof prompt.identifier === 'string' &&
        prompt.identifier.trim() &&
        prompt.marker !== true &&
        !RESERVED_PROMPT_IDS.has(prompt.identifier)
    );
}

function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('没有选择文件。'));
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(String(reader.result));
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('文件内容不是有效的预设 JSON 对象。');
                }
                resolve(parsed);
            } catch (error) {
                reject(new Error(`无法解析 ${file.name}：${error.message}`));
            }
        };
        reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
        reader.readAsText(file, 'utf-8');
    });
}

function setStatus(root, message, kind = '') {
    const status = root.querySelector('#pet-status');
    status.textContent = message;
    status.dataset.kind = kind;
}

function renderPromptList(root) {
    const list = root.querySelector('#pet-prompt-list');
    list.replaceChildren();

    const prompts = getCandidatePrompts(sourcePreset);
    if (!prompts.length) {
        list.textContent = '没有找到可选择的自定义提示词条目。请确认上传的是 Chat Completion 预设 JSON。';
        return;
    }

    const sourceOrder = getPromptOrder(sourcePreset)?.order || [];
    const orderMap = new Map(sourceOrder.map(item => [item.identifier, item]));
    for (const prompt of prompts) {
        const label = document.createElement('label');
        label.className = 'pet-prompt-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = prompt.identifier;
        checkbox.checked = true;

        const details = document.createElement('span');
        details.className = 'pet-prompt-details';

        const title = document.createElement('strong');
        title.textContent = prompt.name || prompt.identifier;

        const id = document.createElement('small');
        id.textContent = `标识符：${prompt.identifier}`;

        const state = document.createElement('small');
        const orderItem = orderMap.get(prompt.identifier);
        state.textContent = orderItem
            ? `来源状态：${orderItem.enabled ? '启用' : '关闭'}`
            : '来源顺序中没有该条目记录（复制时将默认启用）';

        details.append(title, id, state);
        label.append(checkbox, details);
        list.append(label);
    }
}

function selectedIds(root) {
    return [...root.querySelectorAll('#pet-prompt-list input[type="checkbox"]:checked')]
        .map(input => input.value);
}

function downloadJson(object, filename) {
    const blob = new Blob([JSON.stringify(object, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFileName(name) {
    return String(name || 'preset').replace(/\.json$/i, '').replace(/[\\/:*?"<>|]/g, '_');
}

function mergeSelected(root) {
    if (!sourcePreset || !targetPreset) throw new Error('请先分别上传来源预设和目标预设 JSON。');
    const ids = selectedIds(root);
    if (!ids.length) throw new Error('请至少勾选一个要复制的条目。');

    const sourcePrompts = getCandidatePrompts(sourcePreset).filter(prompt => ids.includes(prompt.identifier));
    const merged = deepClone(targetPreset);
    const targetPrompts = Array.isArray(merged.prompts) ? merged.prompts : [];
    const targetIds = new Set(targetPrompts.map(prompt => prompt?.identifier).filter(Boolean));
    const targetNames = new Set(targetPrompts.map(prompt => prompt?.name).filter(Boolean));

    const additions = [];
    const skipped = [];
    for (const prompt of sourcePrompts) {
        if (targetIds.has(prompt.identifier) || (prompt.name && targetNames.has(prompt.name))) {
            skipped.push(prompt.name || prompt.identifier);
            continue;
        }
        additions.push(deepClone(prompt));
        targetIds.add(prompt.identifier);
        if (prompt.name) targetNames.add(prompt.name);
    }

    if (!additions.length) {
        return { merged: null, added: 0, skipped, message: '没有新增条目：所选条目均与目标预设重名或标识符重复。' };
    }

    merged.prompts = [...targetPrompts, ...additions];

    // Preserve global Prompt Manager ordering and enabled/disabled state.
    if (!Array.isArray(merged.prompt_order)) merged.prompt_order = [];
    let targetGlobalOrder = getPromptOrder(merged);
    if (!targetGlobalOrder) {
        targetGlobalOrder = { character_id: GLOBAL_CHARACTER_ID, order: [] };
        merged.prompt_order.push(targetGlobalOrder);
    }
    if (!Array.isArray(targetGlobalOrder.order)) targetGlobalOrder.order = [];

    const sourceOrder = getPromptOrder(sourcePreset)?.order || [];
    const sourceOrderMap = new Map(sourceOrder.map(item => [item.identifier, item]));
    const targetOrderedIds = new Set(targetGlobalOrder.order.map(item => item.identifier));

    for (const prompt of additions) {
        if (targetOrderedIds.has(prompt.identifier)) continue;
        const sourceOrderItem = sourceOrderMap.get(prompt.identifier);
        targetGlobalOrder.order.push(sourceOrderItem
            ? deepClone(sourceOrderItem)
            : { identifier: prompt.identifier, enabled: true });
        targetOrderedIds.add(prompt.identifier);
    }

    return { merged, added: additions.length, skipped, message: `已准备好 ${additions.length} 个新增条目。` };
}

async function createPanel() {
    const host = document.querySelector('#extensions_settings');
    if (!host || document.getElementById(EXTENSION_ID)) return;

    const panel = document.createElement('section');
    panel.id = EXTENSION_ID;
    panel.className = 'extension_settings';
    panel.innerHTML = `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>预设条目转移工具 v0.2.0</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
          <div class="pet-warning">
            <b>安全模式：</b>本版本通过导入/导出 JSON 合并，不会直接改写酒馆服务器上的预设，也不会调用模型 API。
            复制完成后，请将下载的新 JSON 作为一个新预设导入酒馆。
          </div>
          <div class="pet-field">
            <label for="pet-source-file">① 来源预设 JSON（包含要复制的条目）</label>
            <input id="pet-source-file" type="file" accept=".json,application/json">
            <small id="pet-source-name">尚未选择来源文件</small>
          </div>
          <div class="pet-field">
            <label for="pet-target-file">② 目标预设 JSON（要把条目复制进去的预设）</label>
            <input id="pet-target-file" type="file" accept=".json,application/json">
            <small id="pet-target-name">尚未选择目标文件</small>
          </div>
          <div class="pet-actions">
            <button id="pet-read" class="menu_button">读取来源条目</button>
            <button id="pet-select-all" class="menu_button">全选</button>
            <button id="pet-select-none" class="menu_button">取消全选</button>
          </div>
          <div id="pet-prompt-list" class="pet-prompt-list">请先上传两个预设 JSON 文件。</div>
          <div class="pet-actions">
            <button id="pet-export" class="menu_button" disabled>生成合并后的目标预设 JSON</button>
          </div>
          <div id="pet-status" class="pet-status" aria-live="polite">等待上传文件。</div>
          <div class="pet-help">
            <b>使用提示</b>
            <ol>
              <li>先在酒馆的 Prompt Manager 预设管理处分别导出来源预设和目标预设。</li>
              <li>在这里上传两个 JSON，读取并勾选条目。</li>
              <li>生成合并文件后，在酒馆预设管理处导入新 JSON。</li>
              <li>建议先用预设副本测试，确认正常后再作为常用预设。</li>
            </ol>
          </div>
        </div>
      </div>`;

    host.append(panel);
    const sourceInput = panel.querySelector('#pet-source-file');
    const targetInput = panel.querySelector('#pet-target-file');
    const readButton = panel.querySelector('#pet-read');
    const exportButton = panel.querySelector('#pet-export');

    sourceInput.addEventListener('change', async () => {
        sourcePreset = null;
        sourceFileName = sourceInput.files?.[0]?.name || '';
        panel.querySelector('#pet-source-name').textContent = sourceFileName || '尚未选择来源文件';
        exportButton.disabled = true;
    });

    targetInput.addEventListener('change', async () => {
        targetPreset = null;
        targetFileName = targetInput.files?.[0]?.name || '';
        panel.querySelector('#pet-target-name').textContent = targetFileName || '尚未选择目标文件';
        exportButton.disabled = true;
    });

    readButton.addEventListener('click', async () => {
        try {
            sourcePreset = await readJsonFile(sourceInput.files?.[0]);
            targetPreset = await readJsonFile(targetInput.files?.[0]);
            if (!Array.isArray(sourcePreset.prompts)) {
                throw new Error('来源文件中没有 prompts 数组；请确认它是 Chat Completion 预设。');
            }
            if (!Array.isArray(targetPreset.prompts)) {
                throw new Error('目标文件中没有 prompts 数组；请确认它是 Chat Completion 预设。');
            }
            renderPromptList(panel);
            exportButton.disabled = false;
            setStatus(
                panel,
                `读取成功：来源 ${sourceFileName}；目标 ${targetFileName}；找到 ${getCandidatePrompts(sourcePreset).length} 个可选自定义条目。`,
                'success'
            );
        } catch (error) {
            sourcePreset = null;
            targetPreset = null;
            exportButton.disabled = true;
            setStatus(panel, error.message, 'error');
        }
    });

    panel.querySelector('#pet-select-all').addEventListener('click', () => {
        panel.querySelectorAll('#pet-prompt-list input[type="checkbox"]').forEach(input => input.checked = true);
    });
    panel.querySelector('#pet-select-none').addEventListener('click', () => {
        panel.querySelectorAll('#pet-prompt-list input[type="checkbox"]').forEach(input => input.checked = false);
    });

    exportButton.addEventListener('click', () => {
        try {
            const result = mergeSelected(panel);
            if (!result.merged) {
                setStatus(panel, result.message, 'error');
                return;
            }
            const filename = `${safeFileName(targetFileName)}_已复制条目.json`;
            downloadJson(result.merged, filename);
            const skippedText = result.skipped.length
                ? `；跳过 ${result.skipped.length} 个重名条目：${result.skipped.join('、')}`
                : '';
            setStatus(panel, `成功生成文件：新增 ${result.added} 个条目${skippedText}。来源文件未被修改。`, 'success');
            notify(`预设合并文件已生成：新增 ${result.added} 个条目。`, 'success');
        } catch (error) {
            setStatus(panel, error.message, 'error');
            notify(error.message, 'error');
        }
    });
}

function init() {
    const observer = new MutationObserver(() => {
        if (document.querySelector('#extensions_settings') && !document.getElementById(EXTENSION_ID)) {
            createPanel();
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    createPanel();
}

init();
