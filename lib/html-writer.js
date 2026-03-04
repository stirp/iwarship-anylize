/**
 * HTML 网页生成模块
 * 生成交互式数据表格网页
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 生成 HTML 页面
 * @param {Object} data - 各类别数据
 * @param {string} outputPath - 输出路径
 * @param {string} gameVersion - 游戏版本号
 * @returns {boolean}
 */
export function generateHTML(data, outputPath, gameVersion = '') {
  try {
    const html = buildHTML(data, gameVersion)
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
function buildHTML(data, gameVersion = '') {
  const categories = Object.keys(data).filter(k => data[k] && data[k].length > 0)

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
            <div class="subtitle">World of Warships Data Viewer ${gameVersion ? `| 游戏版本: ${gameVersion}` : ''}</div>
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
                    <!-- 筛选器 -->
                    <div class="row mb-3 filter-row" data-table="${cat}">
                        <div class="col-auto">
                            <select class="form-select filter-col" data-field="等级">
                                <option value="">-- 等级 --</option>
                                ${getUniqueValues(data[cat], '等级').sort((a,b)=>Number(a)-Number(b)).map(l => `<option value="${l}">${l}级</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-auto">
                            <select class="form-select filter-col" data-field="舰种">
                                <option value="">-- 舰种 --</option>
                                <option value="战列舰">战列舰</option>
                                <option value="巡洋舰">巡洋舰</option>
                                <option value="驱逐舰">驱逐舰</option>
                                <option value="航空母舰">航空母舰</option>
                                <option value="潜艇">潜艇</option>
                            </select>
                        </div>
                        <div class="col-auto">
                            <select class="form-select filter-col" data-field="国籍" data-alt="国家">
                                <option value="">-- 国籍 --</option>
                                ${getUniqueValues(data[cat], '国籍').concat(getUniqueValues(data[cat], '国家')).filter((v,i,a)=>a.indexOf(v)===i).map(n => `<option value="${n}">${n}</option>`).join('')}
                            </select>
                        </div>
                        <div class="col-auto">
                            <select class="form-select filter-col" data-field="类型" data-alt="group">
                                <option value="">-- 类型 --</option>
                                ${getUniqueValues(data[cat], '类型').concat(getUniqueValues(data[cat], 'group')).filter((v,i,a)=>a.indexOf(v)===i).map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                    </div>
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
                           data-fixed-number="5"
                           data-fixed-scroll="true">
                        <thead>
                            <tr>
                                ${getTableHeaders(data[cat][0]).map(h => `<th data-field="${h}" data-sortable="true">${h}</th>`).join('')}
                            </tr>
                        </thead>
                    </table>
                </div>
            </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>数据来源: iwarship.net | 生成时间: ${new Date().toLocaleString('zh-CN')}</p>
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

        // 为每个表格加载数据
        ${categories.map(cat => `
        tableData['${cat}'] = ${JSON.stringify(data[cat])};
        $('#table-${cat}').bootstrapTable({
            data: tableData['${cat}'],
            // 设置高度以启用固定表头
            height: 500,
            // 固定左侧列
            fixedColumns: true,
            fixedNumber: 5,
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

        // 表格高度调整功能
        document.querySelectorAll('.table-container').forEach(container => {
            const tableName = container.dataset.tableName;
            const tableId = 'table-' + tableName;
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            container.appendChild(handle);

            // 从 localStorage 读取保存的高度
            const savedHeight = localStorage.getItem('tableHeight_' + tableName);
            if (savedHeight) {
                const height = parseInt(savedHeight, 10);
                if (height >= 200 && height <= 1200) {
                    $('#' + tableId).bootstrapTable('resetView', { height: height });
                }
            }

            let isDragging = false;
            let startY = 0;
            let startHeight = 0;

            handle.addEventListener('mousedown', function(e) {
                isDragging = true;
                startY = e.clientY;
                const table = $('#' + tableId).bootstrapTable('getOptions');
                startHeight = table.height || 500;
                handle.classList.add('dragging');
                document.body.style.cursor = 'ns-resize';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function(e) {
                if (!isDragging) return;
                const delta = e.clientY - startY;
                let newHeight = startHeight + delta;
                newHeight = Math.max(200, Math.min(1200, newHeight));
                $('#' + tableId).bootstrapTable('resetView', { height: newHeight });
            });

            document.addEventListener('mouseup', function() {
                if (isDragging) {
                    isDragging = false;
                    handle.classList.remove('dragging');
                    document.body.style.cursor = '';
                    const table = $('#' + tableId).bootstrapTable('getOptions');
                    localStorage.setItem('tableHeight_' + tableName, table.height);
                }
            });
        });

        // 多条件筛选（下拉框）
        document.querySelectorAll('.filter-row').forEach(row => {
            const tableId = row.dataset.table;
            const selects = row.querySelectorAll('.filter-col');

            function applyFilter() {
                const filters = {};
                selects.forEach(sel => {
                    if (sel.value) {
                        filters[sel.dataset.field] = { value: sel.value, alt: sel.dataset.alt };
                    }
                });

                const filtered = tableData[tableId].filter(row => {
                    // 检查下拉筛选（支持主字段和备用字段）
                    for (const [field, {value, alt}] of Object.entries(filters)) {
                        const fieldValue = row[field] || (alt ? row[alt] : null);
                        if (String(fieldValue) !== value) return false;
                    }
                    return true;
                });

                $('#table-' + tableId).bootstrapTable('load', filtered);
            }

            selects.forEach(sel => sel.addEventListener('change', applyFilter));
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
