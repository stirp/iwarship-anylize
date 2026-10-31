/**
 * HTML 网页生成模块
 * 生成交互式数据表格网页
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { comparisonNotes } from './gameparams-comparison.js'
import { legacyColumns, legacyAliases, unsupportedColumns, columnCoverage } from './gameparams-legacy-columns.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 生成 HTML 页面
 * @param {Object} data - 各类别数据
 * @param {string} outputPath - 输出路径
 * @param {string} gameVersion - 游戏版本号
 * @returns {boolean}
 */
export function generateHTML(data, outputPath, gameVersion = '', context = {}) {
  try {
    const html = buildHTML(data, gameVersion, context)
    writeFileSync(outputPath, html, 'utf-8')
    console.log(`✅ 网页已生成: ${outputPath}`)
    return true
  } catch (error) {
    console.error(`❌ 网页生成失败: ${error.message}`)
    return false
  }
}

/**
 * 构建完整的 HTML 页面
 * @param {Object} data - 各类别数据
 * @param {string} gameVersion - 游戏版本号
 */
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function scriptJSON(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

const comparisonColumns = {
  船体: ['血量', '引擎溅射防护口径(mm)', '舵机溅射防护口径(mm)', '弹药库溅射防护口径(mm)',
    '水面隐蔽(标准)(km)', '水面隐蔽(最小)(km)', '空中隐蔽(标准)(km)', '空中隐蔽(最小)(km)',
    '烟内开火隐蔽(km)', '最大航速(节)', '换舵时间(s)', '转弯半径(m)'],
  火炮: ['规格', '炮管口径(mm)', '装填时间(s)', 'HE单轮齐射最大伤害', 'HE每分钟标伤', '射程(km)', 'HE标伤',
    'HE穿深(mm)', 'HE点燃几率(%)', 'AP标伤', 'AP单轮齐射最大伤害', 'AP每分钟最大伤害',
    '半穿甲弹标伤', '半穿甲弹单轮齐射最大伤害', '半穿甲弹每分钟最大伤害', 'Sigma系数'],
  副炮: ['规格', '炮管口径(mm)', '装填时间(s)', '射程(km)', 'HE标伤', 'HE单轮齐射最大伤害', 'HE每分钟标伤', 'HE穿深(mm)', 'HE点燃几率(%)'],
  防空: ['近程防空·面板秒伤', '近程防空·命中率(%)', '近程防空·外圈距离(m)',
    '中程防空·面板秒伤', '中程防空·命中率(%)', '中程防空·外圈距离(m)',
    '远程防空·面板秒伤', '远程防空·命中率(%)', '远程防空·外圈距离(m)',
    '远程防空爆炸云·爆炸云伤害', '远程防空爆炸云·内圈爆炸云数', '远程防空爆炸云·外圈爆炸云数', '优先防空扇区冷却(s)']
}

function tableHeaders(category, rows, context) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const identity = ['名字', '等级', '舰种', '配置']
  const legacy = legacyColumns(category).map(key => legacyAliases[category]?.[key] || key)
  const preferred = context.source === 'gameparams' ? comparisonColumns[category] || (legacy.length ? legacy : null) : null
  const ordered = preferred ? [...new Set([...identity, ...preferred, ...keys])].filter(key => keys.includes(key)) : keys
  return ordered.map(key => {
    const reason = context.source === 'gameparams' ? unsupportedColumns[category]?.[key] : null
    const hidden = Boolean(reason) || ['英文名字', '中文名字'].includes(key) ||
      (preferred && ![...identity, ...preferred].includes(key)) ||
      (category === '装甲' && /^(核心区|主炮|防雷|未归类)/.test(key))
    return `<th data-field="${escapeHTML(key)}" data-sortable="true"${rows.some(row => typeof row[key] === 'number') ? ' data-sorter="numericSorter"' : ''}${hidden ? ' data-visible="false"' : ''}${reason ? ` data-title-tooltip="${escapeHTML(reason)}"` : ''}>${escapeHTML(key)}${reason ? '（待核实）' : ''}</th>`
  }).join('')
}

function coverageHTML(category, rows, context) {
  if (context.source !== 'gameparams') return ''
  const columns = columnCoverage(category, rows)
  if (!columns.length) return ''
  const available = columns.filter(column => column.status === '已提供').length
  const pending = columns.filter(column => column.status === '待核实').length
  return `<details class="mb-2"><summary>旧版列对齐：${available}/${columns.length} 列有值，${pending} 列待核实</summary>
    <p class="small">空值表示当前范围不适用、缺少参数或计算待核实，不表示零。待核实列可从“列”菜单显示。</p>
    <div style="max-height:260px;overflow:auto"><table class="table table-sm"><thead><tr><th>旧版列</th><th>当前列</th><th>状态</th><th>说明</th></tr></thead><tbody>${columns.map(column => `<tr><td>${escapeHTML(column.original)}</td><td>${escapeHTML(column.target)}</td><td>${column.status}</td><td>${escapeHTML(column.reason)}</td></tr>`).join('')}</tbody></table></div></details>`
}

function buildHTML(data, gameVersion = '', context = {}) {
  const categories = Object.keys(data).filter(k => data[k] && data[k].length > 0)
  // 跨类别共享筛选选项，当前类别无匹配记录时仍保留已选条件。
  const filterRows = categories.flatMap(category => data[category])

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>战舰世界数据查看器</title>

    <!-- Bootstrap -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/bootstrap-table.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/extensions/fixed-columns/bootstrap-table-fixed-columns.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/extensions/filter-control/bootstrap-table-filter-control.min.css" rel="stylesheet">

    <style>
        body {
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            border-radius: 10px;
        }
        .header h1 {
            margin: 0;
            font-size: 2rem;
        }
        .header .subtitle {
            opacity: 0.8;
            margin-top: 10px;
        }
        /* 多选筛选样式 */
        .filter-group {
            display: inline-block;
            margin-right: 15px;
        }
        .filter-label {
            font-weight: 500;
            margin-right: 8px;
            color: #495057;
        }
        .filter-options {
            display: inline-flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        .filter-checkbox {
            white-space: nowrap;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.85rem;
            transition: background-color 0.2s;
        }
        .filter-checkbox:hover {
            background-color: #e9ecef;
        }
        .filter-checkbox input {
            margin-right: 3px;
        }

        .category-tabs {
            margin-bottom: 20px;
        }
        .category-tabs .nav-link {
            color: #495057;
            font-weight: 500;
        }
        .category-tabs .nav-link.active {
            background-color: #1a1a2e;
            border-color: #1a1a2e;
            color: white;
        }
        .table-container {
            background: white;
            border-radius: 10px;
            padding: 15px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            position: relative;
        }
        /* 高度调整手柄 */
        .resize-handle {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 8px;
            cursor: ns-resize;
            background: transparent;
            z-index: 100;
        }
        .resize-handle:hover,
        .resize-handle.dragging {
            background: rgba(13, 110, 253, 0.1);
        }
        .resize-handle::after {
            content: '⋮⋮';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            color: #adb5bd;
            font-size: 12px;
            letter-spacing: 2px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #6c757d;
            font-size: 0.9rem;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 15px;
        }
        .stats .stat-item {
            text-align: center;
        }
        .stats .stat-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #0d6efd;
        }
        .stats .stat-label {
            font-size: 0.85rem;
            color: #6c757d;
        }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="header">
            <h1>⚓ 战舰世界数据查看器</h1>
            <div class="subtitle">World of Warships Data Viewer ${gameVersion ? `| 游戏版本: ${escapeHTML(gameVersion)}` : ''} ${context.region ? `| 区域: ${escapeHTML(context.region)}` : ''}</div>
            ${context.note ? `<p>${escapeHTML(context.note)}</p>` : ''}
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-value">${categories.length}</div>
                    <div class="stat-label">数据类别</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${Object.values(data).reduce((sum, arr) => sum + (arr?.length || 0), 0)}</div>
                    <div class="stat-label">总记录数</div>
                </div>
            </div>
        </div>

        <!-- 类别标签 -->
        <ul class="nav nav-tabs category-tabs" id="categoryTabs" role="tablist">
            ${categories.map((cat, i) => `
            <li class="nav-item" role="presentation">
                <button class="nav-link ${i === 0 ? 'active' : ''}"
                        id="${cat}-tab"
                        data-bs-toggle="tab"
                        data-bs-target="#${cat}"
                        type="button"
                        role="tab"
                        aria-selected="${i === 0}">
                    ${cat} <span class="badge bg-secondary">${data[cat]?.length || 0}</span>
                </button>
            </li>
            `).join('')}
        </ul>

        <!-- 数据表格 -->
        <div class="tab-content" id="categoryTabsContent">
            ${categories.map((cat, i) => `
            <div class="tab-pane fade ${i === 0 ? 'show active' : ''}"
                 id="${cat}"
                 role="tabpanel"
                 aria-labelledby="${cat}-tab">
                <div class="table-container" data-table-name="${cat}">
                    ${cat === '装甲' ? '<p class="text-muted">每艘船一行，单位为毫米；最薄/最厚为所有配置中可明确归类的有效参数范围，各层不相加。空白不代表零装甲。核心区、炮塔等更多部位可在“列”菜单中显示。</p>' : ''}
                    <!-- 筛选器 -->
                    <div class="row mb-3 filter-row" data-table="${cat}">
                        <div class="col-auto">
                            <div class="filter-group" data-field="等级">
                                <span class="filter-label">等级:</span>
                                <div class="filter-options">
                                    ${getUniqueValues(filterRows, '等级').sort((a,b)=>Number(a)-Number(b)).map(l => `<label class="filter-checkbox"><input type="checkbox" value="${escapeHTML(l)}"> ${escapeHTML(l)}级</label>`).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <div class="filter-group" data-field="舰种">
                                <span class="filter-label">舰种:</span>
                                <div class="filter-options">
                                    ${getUniqueValues(filterRows, '舰种').map(t => `<label class="filter-checkbox"><input type="checkbox" value="${escapeHTML(t)}"> ${escapeHTML(t)}</label>`).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <div class="filter-group" data-field="国籍" data-alt="国家">
                                <span class="filter-label">国籍:</span>
                                <div class="filter-options">
                                    ${getUniqueValues(filterRows, '国籍').concat(getUniqueValues(filterRows, '国家')).filter((v,i,a)=>a.indexOf(v)===i).sort().map(n => `<label class="filter-checkbox"><input type="checkbox" value="${escapeHTML(n)}"> ${escapeHTML(n)}</label>`).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <div class="filter-group" data-field="类型" data-alt="group">
                                <span class="filter-label">类型:</span>
                                <div class="filter-options">
                                    ${getUniqueValues(filterRows, '类型').concat(getUniqueValues(filterRows, 'group')).filter((v,i,a)=>a.indexOf(v)===i).sort().map(t => `<label class="filter-checkbox"><input type="checkbox" value="${escapeHTML(t)}"> ${escapeHTML(t)}</label>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    ${context.source === 'gameparams' && comparisonNotes[cat] ? `<details class="mb-2"><summary>计算口径与列说明</summary><p class="small text-muted mb-1">${escapeHTML(comparisonNotes[cat])} 更多参数可通过右上角“列”菜单显示。</p></details>` : ''}
                    ${coverageHTML(cat, data[cat], context)}
                    <table id="table-${cat}"
                           data-toggle="table"
                           data-show-columns="true"
                           data-search="true"
                           data-search-align="left"
                           data-show-toggle="true"
                           data-pagination="true"
                           data-page-size="50"
                           data-page-list="[10, 25, 50, 100, All]"
                           data-sortable="true"
                           data-show-export="true"
                           data-export-types="['csv']"
                           data-fixed-columns="true"
                           data-fixed-number="${context.source === 'gameparams' ? 2 : 5}"
                           data-fixed-scroll="true">
                        <thead>
                            <tr>
                                ${cat === '装甲' && context.viewerLinks && data[cat].some(row => context.viewerLinks[row['编号']]) ? '<th data-field="__armorViewer" data-formatter="armorLinkFormatter">3D 装甲</th>' : ''}
                                ${tableHeaders(cat, data[cat], context)}
                            </tr>
                        </thead>
                    </table>
                </div>
            </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>数据来源: ${escapeHTML(context.source || 'iwarship.net')} | 生成时间: ${new Date().toLocaleString('zh-CN')}</p>
        </div>
    </div>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/bootstrap-table.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/locale/bootstrap-table-zh-CN.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/extensions/fixed-columns/bootstrap-table-fixed-columns.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/extensions/filter-control/bootstrap-table-filter-control.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/tableexport.jquery.plugin@1.10.23/tableExport.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/extensions/export/bootstrap-table-export.min.js"></script>

    <script>
        // 存储表格数据
        const tableData = {};
        function numericSorter(a, b) {
            if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
            if (b === null || b === undefined || b === '') return -1;
            return Number(a) - Number(b);
        }
        const armorViewerLinks = ${scriptJSON(context.viewerLinks || {})};
        function armorLinkFormatter(value, row) {
            const href = armorViewerLinks[row['编号']];
            if (!href) return '';
            const link = document.createElement('a');
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = '查看 3D 装甲 ↗';
            return link.outerHTML;
        }

        // 跨类别共享的筛选和搜索状态 key
        const GLOBAL_FILTER_KEY = 'tableFilters_v2_global';
        const GLOBAL_SEARCH_KEY = 'tableSearch_global';

        // 为每个表格加载数据
        ${categories.map(cat => `
        tableData['${cat}'] = ${scriptJSON(data[cat])};
        $('#table-${cat}').bootstrapTable({
            data: tableData['${cat}'],
            escape: true,
            // 设置高度以启用固定表头
            height: 500,
            // 固定左侧列
            fixedColumns: true,
            fixedNumber: ${context.source === 'gameparams' ? 2 : 5},
            // 显示按钮文字
            showButtonText: true,
            // 按钮文字
            formatSearch: function() { return '搜索...'; },
            formatToggle: function() { return '卡片/表格'; },
            formatColumns: function() { return '列'; },
            formatExport: function() { return '导出CSV'; },
            formatClearSearch: function() { return '清除搜索'; },
            formatPaginationSwitch: function() { return '分页'; },
            formatPaginationSwitchDown: function() { return '隐藏分页'; },
            formatPaginationSwitchUp: function() { return '显示分页'; },
            formatRefresh: function() { return '刷新'; },
            formatFullscreen: function() { return '全屏'; },
            formatColumn: function() { return '列'; }
        });
        `).join('')}

        // 表格高度调整功能（全局统一）
        const GLOBAL_HEIGHT_KEY = 'tableHeight_global';

        // 初始化所有表格高度
        const savedGlobalHeight = localStorage.getItem(GLOBAL_HEIGHT_KEY);
        const initialHeight = savedGlobalHeight ? parseInt(savedGlobalHeight, 10) : 500;

        // 更新所有表格高度
        function updateAllTablesHeight(height) {
            document.querySelectorAll('.table-container').forEach(container => {
                const tableName = container.dataset.tableName;
                const tableId = 'table-' + tableName;
                $('#' + tableId).bootstrapTable('resetView', { height: height });
            });
        }

        // 页面加载时应用保存的高度
        if (savedGlobalHeight && initialHeight >= 200 && initialHeight <= 1200) {
            setTimeout(() => updateAllTablesHeight(initialHeight), 100);
        }

        // 为每个表格添加拖拽功能（统一控制所有表格）
        let isDragging = false;
        let startY = 0;
        let startHeight = initialHeight;

        document.querySelectorAll('.table-container').forEach(container => {
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            handle.title = '拖拽调整表格高度';
            container.appendChild(handle);

            handle.addEventListener('mousedown', function(e) {
                isDragging = true;
                startY = e.clientY;
                // 获取当前表格的高度作为起始高度
                const tableName = container.dataset.tableName;
                const table = $('#table-' + tableName).bootstrapTable('getOptions');
                startHeight = table.height || initialHeight;
                handle.classList.add('dragging');
                document.body.style.cursor = 'ns-resize';
                e.preventDefault();
            });
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            const delta = e.clientY - startY;
            let newHeight = startHeight + delta;
            newHeight = Math.max(200, Math.min(1200, newHeight));
            updateAllTablesHeight(newHeight);
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                document.querySelectorAll('.resize-handle').forEach(h => h.classList.remove('dragging'));
                document.body.style.cursor = '';
                // 保存全局高度
                const firstContainer = document.querySelector('.table-container');
                if (firstContainer) {
                    const tableName = firstContainer.dataset.tableName;
                    const table = $('#table-' + tableName).bootstrapTable('getOptions');
                    localStorage.setItem(GLOBAL_HEIGHT_KEY, table.height);
                }
            }
        });

        // 加载全局筛选状态
        function loadGlobalFilters() {
            const saved = localStorage.getItem(GLOBAL_FILTER_KEY);
            return saved ? JSON.parse(saved) : {};
        }

        // 保存全局筛选状态
        function saveGlobalFilters(filters) {
            localStorage.setItem(GLOBAL_FILTER_KEY, JSON.stringify(filters));
        }

        // 多条件筛选（多选checkbox）+ 跨类别记忆
        document.querySelectorAll('.filter-row').forEach(row => {
            const tableId = row.dataset.table;
            const filterGroups = row.querySelectorAll('.filter-group');

            function applyFilter(save = true) {
                const filters = {};
                filterGroups.forEach(group => {
                    const field = group.dataset.field;
                    const alt = group.dataset.alt;
                    const checkboxes = group.querySelectorAll('input[type="checkbox"]:checked');
                    const values = Array.from(checkboxes).map(cb => cb.value);
                    if (values.length > 0) {
                        filters[field] = { values: values, alt: alt };
                    }
                });

                // 保存到全局存储（跨类别共享）
                if (save) saveGlobalFilters(filters);

                // 同时保存到当前表格的 localStorage
                localStorage.setItem('tableFilters_v2_' + tableId, JSON.stringify(filters));

                const filtered = tableData[tableId].filter(item => {
                    for (const [field, {values, alt}] of Object.entries(filters)) {
                        const fieldValue = item[field] || (alt ? item[alt] : null);
                        // 多选：只要匹配其中一个值就通过
                        if (!values.includes(String(fieldValue))) return false;
                    }
                    return true;
                });

                $('#table-' + tableId).bootstrapTable('load', filtered);
            }

            // 绑定 checkbox 事件
            filterGroups.forEach(group => {
                group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', () => applyFilter());
                });
            });

            // 页面加载后应用保存的筛选状态
            const globalFilters = loadGlobalFilters();
            const localFilters = JSON.parse(localStorage.getItem('tableFilters_v2_' + tableId) || '{}');
            const savedFilters = localStorage.getItem(GLOBAL_FILTER_KEY) !== null ? globalFilters : localFilters;

            let hasSavedFilters = false;
            filterGroups.forEach(group => {
                const field = group.dataset.field;
                if (savedFilters[field] && savedFilters[field].values) {
                    const values = savedFilters[field].values;
                    group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        if (values.includes(cb.value)) {
                            cb.checked = true;
                            hasSavedFilters = true;
                        }
                    });
                }
            });
            if (hasSavedFilters) {
                applyFilter(false);
            }

            // 监听标签切换事件，切换时恢复全局筛选和搜索状态
            const tabEl = document.querySelector('#' + tableId.replace('table-', '') + '-tab');
            if (tabEl) {
                tabEl.addEventListener('shown.bs.tab', function() {
                    // 1. 恢复搜索框状态
                    const savedSearch = localStorage.getItem(GLOBAL_SEARCH_KEY);
                    const searchInput = document.querySelector('#' + tableId + ' .search-input');
                    if (searchInput && savedSearch !== undefined) {
                        searchInput.value = savedSearch;
                        // 触发搜索过滤
                        const event = new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 });
                        searchInput.dispatchEvent(event);
                    }

                    // 2. 恢复筛选 checkbox 状态
                    const globalFilters = loadGlobalFilters();
                    filterGroups.forEach(group => {
                        const field = group.dataset.field;
                        const values = globalFilters[field]?.values || [];
                        group.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                            cb.checked = values.includes(cb.value);
                        });
                    });
                    applyFilter(false);
                });
            }

            // 监听搜索框事件并保存到全局存储
            const searchInput = document.querySelector('#' + tableId + ' .search-input');
            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    localStorage.setItem(GLOBAL_SEARCH_KEY, this.value);
                });
            }

            // 页面加载后恢复搜索状态（等待表格加载完成）
            const savedSearch = localStorage.getItem(GLOBAL_SEARCH_KEY);
            if (savedSearch) {
                // 等待表格初始化完成后再应用搜索
                setTimeout(function() {
                    const searchInput = document.querySelector('#' + tableId + ' .search-input');
                    if (searchInput) {
                        searchInput.value = savedSearch;
                        // 触发 keyup 事件让 bootstrap-table 感知搜索
                        const event = new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13 });
                        searchInput.dispatchEvent(event);
                    }
                }, 500);
            }
        });
    </script>
</body>
</html>`
}

/**
 * 获取表格表头
 */
function getTableHeaders(record) {
  if (!record) return []
  return Object.keys(record)
}

/**
 * 获取某列的唯一值
 */
function getUniqueValues(data, field) {
  const values = new Set()
  for (const row of data) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
      values.add(String(row[field]))
    }
  }
  return [...values].sort()
}

/**
 * 生成独立类别的 HTML 页面
 */
export function generateCategoryHTML(category, records, outputPath) {
  if (!records || records.length === 0) {
    console.log(`⚠️ 无数据可导出: ${category}`)
    return false
  }

  const headers = getTableHeaders(records[0])

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${category} - 战舰世界数据</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/bootstrap-table.min.css">
    <style>
        body { padding: 20px; background: #f5f5f5; }
        .container { max-width: 100%; }
        .table-container { background: white; border-radius: 10px; padding: 15px; position: relative; }
        .table-header-info {
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 12px;
            color: #6c757d;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 4px;
            z-index: 10;
        }
        /* 固定表头 */
        .fixed-table-container {
            height: 600px;
            overflow: auto;
        }
        .fixed-table-container thead th {
            position: sticky;
            top: 0;
            background: #f8f9fa;
            z-index: 10;
        }
        /* 固定首列（名字列） */
        .fixed-table-container tbody td:first-child,
        .fixed-table-container thead th:first-child {
            position: sticky;
            left: 0;
            background: white;
            z-index: 11;
        }
        .fixed-table-container thead th:first-child {
            z-index: 12;
        }
        .fixed-table-container tbody td:first-child {
            border-right: 2px solid #dee2e6;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2 class="mb-4">⚓ ${category}</h2>
        <div class="table-container">
            <div class="table-header-info">数据来源: iwarship.net</div>
            <table id="table"
                   data-toggle="table"
                   data-height="600"
                   data-search="true"
                   data-pagination="true"
                   data-page-size="50"
                   data-sortable="true"
                   data-show-export="true">
                <thead>
                    <tr>
                        ${headers.map(h => `<th data-field="${h}" data-sortable="true">${h}</th>`).join('')}
                    </tr>
                </thead>
            </table>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/bootstrap-table.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/locale/bootstrap-table-zh-CN.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/tableexport.jquery.plugin@1.10.23/tableExport.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap-table@1.22.0/dist/extensions/export/bootstrap-table-export.min.js"></script>
    <script>
        $('#table').bootstrapTable({ data: ${JSON.stringify(records)} });
    </script>
</body>
</html>`

  writeFileSync(outputPath, html, 'utf-8')
  console.log(`✅ ${category}.html 已生成`)
  return true
}
