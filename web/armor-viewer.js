import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { decodeModel, comparePlate, plateVisible, plateZone, thicknessColor, zoneNames, zoneColors, defaultBands, MAX_MODEL_BYTES } from './armor-format.js'
import { createShipDataLoader, unpackModel } from './armor-data.js'
import { prepareToolkitAppearance } from './toolkit-appearance.js'

const config = JSON.parse(document.getElementById('viewer-config').textContent)
const $ = id => document.getElementById(id)
const viewport = $('viewport')
const loadShipData = createShipDataLoader(document, window)
const state = { root: null, armor: null, armorMeshes: [], appearance: [], parameters: [], selected: null,
  zones: new Set(), hidden: new Set(), sequence: 0, controller: null, entry: null, bounds: null }
let renderer, scene, camera, controls, grid, selectionOutline, frame

function status(title, message, error = false, idle = false) {
  $('load-panel').hidden = false
  $('load-panel').classList.toggle('error', error)
  $('load-panel').classList.toggle('waiting', idle)
  $('load-title').textContent = title
  $('load-message').textContent = message
  $('retry').hidden = !error || idle
  $('choose-local').hidden = !error && !idle
  $('scene-state').textContent = error ? '加载失败' : title
  viewport.dataset.state = idle ? 'waiting' : error ? 'error' : 'loading'
}

function invalidate() {
  if (!renderer || frame) return
  frame = requestAnimationFrame(() => {
    frame = null
    controls.update()
    renderer.render(scene, camera)
  })
}

function initializeScene() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    viewport.appendChild(renderer.domElement)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10000)
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.09
    controls.addEventListener('change', invalidate)
    scene.add(new THREE.HemisphereLight(0xe0f2ff, 0x58646c, 2.4))
    const key = new THREE.DirectionalLight(0xfff4e5, 2.2)
    key.position.set(12, 20, 8)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xc0e5ff, 1.3)
    fill.position.set(-12, 4, -8)
    scene.add(fill)
    new ResizeObserver(() => {
      const { width, height } = viewport.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      invalidate()
    }).observe(viewport)
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault()
      status('图形上下文已丢失', '请重新加载页面，或关闭其他占用显存的页面后重试。', true)
    })
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let down
    renderer.domElement.addEventListener('pointerdown', event => { down = { x: event.clientX, y: event.clientY, button: event.button } })
    renderer.domElement.addEventListener('pointerup', event => {
      if (!down || down.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(state.armorMeshes.filter(mesh => mesh.visible), false)[0]
      selectPlate(hit?.object || null)
    })
    return true
  } catch (error) {
    status('无法启动 3D 视图', `需要支持 WebGL 2 的浏览器。${error.message}`, true)
    return false
  }
}

function disposeObject(object) {
  const geometries = new Set(), materials = new Set(), textures = new Set()
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry)
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!material) continue
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) { texture.dispose(); texture.image?.close?.() }
}

function clearModel() {
  selectPlate(null)
  if (state.root) { scene.remove(state.root); disposeObject(state.root) }
  if (grid) { scene.remove(grid); disposeObject(grid); grid = null }
  state.root = null
  state.armor = null
  state.armorMeshes = []
  state.appearance = []
  $('appearance').disabled = true
  $('opacity').disabled = true
  $('appearance-note').hidden = true
  state.bounds = null
  viewport.dataset.plateCount = '0'
  viewport.dataset.visiblePlates = '0'
  viewport.dataset.appearanceCount = '0'
  state.hidden.clear()
  $('zones').replaceChildren()
  $('legend').replaceChildren()
  $('visible-count').textContent = ''
  $('model-config').textContent = ''
  $('model-notice').textContent = ''
  $('zones-all').disabled = true
  $('restore-plates').disabled = true
  $('hidden-count').textContent = ''
  details($('model-stats'), { 状态: '加载中' })
  invalidate()
}

function fitCamera(view = 'perspective') {
  if (!state.bounds) return
  const center = state.bounds.getCenter(new THREE.Vector3())
  const radius = state.bounds.getBoundingSphere(new THREE.Sphere()).radius
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.12
  const directions = { perspective: [1, 0.52, 0.55], side: [1, 0.03, 0], top: [0, 1, 0.0001], front: [0, 0.03, 1] }
  camera.up.set(0, 1, 0)
  camera.position.copy(center).add(new THREE.Vector3(...directions[view]).normalize().multiplyScalar(distance))
  camera.near = Math.max(radius / 1000, 0.001)
  camera.far = radius * 100
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.minDistance = radius * 0.08
  controls.maxDistance = distance * 5
  controls.update()
  invalidate()
}

function details(element, values) {
  element.replaceChildren()
  for (const [label, value] of Object.entries(values)) {
    const dt = document.createElement('dt'), dd = document.createElement('dd')
    dt.textContent = label
    dd.textContent = value ?? '未标注'
    element.append(dt, dd)
  }
}

function selectPlate(mesh) {
  if (selectionOutline) { scene?.remove(selectionOutline); disposeObject(selectionOutline); selectionOutline = null }
  state.selected = mesh
  $('selection').hidden = !mesh
  $('selection-empty').hidden = Boolean(mesh)
  if (mesh) {
    const plate = mesh.userData.plate
    $('plate-thickness').textContent = Number.isFinite(plate.thickness_mm) ? plate.thickness_mm : '未知'
    $('plate-zone').textContent = zoneNames[plateZone(plate)] || plateZone(plate)
    details($('plate-details'), { 材质: plate.material_name || plate.material, 层号: plate.layer,
      ...(plate.source_mesh ? { 模型部件: plate.source_mesh } : {}),
      部件: plate.source === 'mount' ? plate.mount?.component : state.armor.ship.hull_component,
      挂载点: plate.mount?.hp || '舰体', '游戏默认显示': plate.hidden_in_viewer ? '隐藏' : '显示' })
    const comparison = comparePlate(plate, state.armor, state.parameters)
    $('comparison').textContent = comparison.text
    $('comparison').dataset.status = comparison.status
    selectionOutline = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20),
      new THREE.LineBasicMaterial({ color: 0xb6fff0, transparent: true, opacity: 0.95, depthTest: false }))
    selectionOutline.matrixAutoUpdate = false
    selectionOutline.matrix.copy(mesh.matrixWorld)
    selectionOutline.renderOrder = 100
    scene.add(selectionOutline)
  }
  invalidate()
}

function buildZoneControls() {
  const counts = new Map()
  for (const mesh of state.armorMeshes) {
    const zone = plateZone(mesh.userData.plate)
    counts.set(zone, (counts.get(zone) || 0) + 1)
  }
  state.zones = new Set(counts.keys())
  $('zones').replaceChildren()
  for (const [zone, count] of counts) {
    const label = document.createElement('label')
    label.className = 'zone-row'
    const input = document.createElement('input')
    input.type = 'checkbox'; input.checked = true; input.dataset.zone = zone
    input.addEventListener('change', () => { input.checked ? state.zones.add(zone) : state.zones.delete(zone); updateDisplay() })
    const swatch = document.createElement('span'); swatch.className = 'zone-swatch'; swatch.style.background = zoneColors[zone] || '#aaa'
    const title = document.createElement('span'); title.textContent = zoneNames[zone] || zone
    const counter = document.createElement('span'); counter.className = 'count'; counter.textContent = count
    label.append(input, swatch, title, counter)
    $('zones').append(label)
  }
  $('zones-all').disabled = !counts.size
}

function updateDisplay() {
  if (!state.root) return
  const minimum = Number($('min-thickness').value), maximum = Number($('max-thickness').value)
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum) {
    $('filter-error').textContent = '请输入有效范围，最大厚度不能小于最小厚度。'
    return
  }
  $('filter-error').textContent = ''
  const filters = { zones: state.zones, hidden: state.hidden, minimum, maximum, includeHidden: $('include-hidden').checked }
  for (const mesh of state.armorMeshes) {
    const plate = mesh.userData.plate
    mesh.visible = plateVisible(plate, filters)
    mesh.material.wireframe = $('wireframe').checked
    mesh.material.color.set($('color-mode').value === 'zone' ? zoneColors[plateZone(plate)] || '#89939b' : thicknessColor(plate.thickness_mm))
    if (!state.appearance.length) setOpacity(mesh.material)
  }
  for (const mesh of state.appearance) {
    mesh.visible = $('appearance').checked
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      setOpacity(material)
    }
  }
  if (state.selected && !state.selected.visible) selectPlate(null)
  const visible = state.armorMeshes.filter(mesh => mesh.visible).length
  $('visible-count').textContent = state.armorMeshes.length ? `${visible} / ${state.armorMeshes.length} 块装甲` : '外观模型'
  viewport.dataset.visiblePlates = visible
  $('hidden-count').textContent = state.hidden.size ? `已手动隐藏 ${state.hidden.size} 块` : ''
  $('restore-plates').disabled = !state.hidden.size
  buildLegend()
  invalidate()
}

function buildLegend() {
  $('legend').replaceChildren()
  const entries = $('color-mode').value === 'zone'
    ? [...state.zones].map(zone => [zoneNames[zone] || zone, zoneColors[zone] || '#89939b'])
    : defaultBands.map(([limit, color], index) => [Number.isFinite(limit) ? `≤${limit}` : `>${defaultBands[index - 1][0]}`, color])
  for (const [label, color] of entries) {
    const item = document.createElement('div'); item.className = 'legend-item'
    const bar = document.createElement('div'); bar.className = 'legend-color'; bar.style.background = color
    const caption = document.createElement('span'); caption.textContent = label
    item.append(bar, caption); $('legend').append(item)
  }
}

function setOpacity(material) {
  const opacity = Number($('opacity').value)
  const transparent = opacity < 1
  if (material.transparent !== transparent) material.needsUpdate = true
  material.transparent = transparent
  material.opacity = opacity
  material.depthWrite = !transparent
}

function resetFilters() {
  $('min-thickness').value = 0
  $('max-thickness').value = Math.max(1, ...state.armorMeshes.map(mesh => mesh.userData.plate.thickness_mm || 0))
  $('include-hidden').checked = false
  $('wireframe').checked = false
  $('color-mode').value = 'thickness'
  $('appearance').checked = Boolean(state.appearance.length)
  $('opacity').value = state.armor && state.appearance.length ? 0.15 : 1
  $('opacity-value').textContent = `${Math.round(Number($('opacity').value) * 100)}%`
  state.hidden.clear()
  buildZoneControls()
  updateDisplay()
}

async function loadModel(file) {
  if (!renderer) return
  const id = $('ship').value
  const entry = config.ships[id]
  if (!entry) { status('没有可用舰船', '本批次没有该舰船，请重新选择。', true); return }
  const sequence = ++state.sequence
  state.controller?.abort()
  state.controller = new AbortController()
  const signal = AbortSignal.any([state.controller.signal, AbortSignal.timeout(120000)])
  state.entry = entry
  state.parameters = []
  clearModel()
  $('ship-name').textContent = entry.name
  $('model-source').textContent = file ? `本地文件：${file.name}` : '正在读取本地数据包'
  status('正在加载模型', file ? file.name : '正在读取本地舰船数据，无需启动服务。')
  const url = new URL(location.href); url.searchParams.set('ship', id)
  try { history.replaceState(null, '', url) } catch { /* 部分浏览器限制 file:// 的历史记录更新，不影响查看。 */ }
  try {
    let shipData
    try {
      shipData = await loadShipData(id, signal)
    } catch (error) {
      if (!file) throw error
      shipData = { parameters: [] }
    }
    if (sequence !== state.sequence) return
    state.parameters = shipData.parameters || []
    if (!file) {
      $('model-source').textContent = shipData.modelInfo?.source || '未打包模型'
      if (shipData.modelInfo?.fetchedAt) $('model-source').textContent += ` · 缓存于 ${new Date(shipData.modelInfo.fetchedAt).toLocaleString('zh-CN')}`
      if (!shipData.modelBase64) {
        status('请选择本地模型', shipData.modelError
          ? `生成时未能打包模型：${shipData.modelError}。可选择本地 GLB / ZST 或 Toolkit 装甲 JSON。`
          : '此批次采用手动模式，请选择对应舰船的 GLB / ZST 或 Toolkit 装甲 JSON。', false, true)
        details($('model-stats'), { 状态: '等待选择模型' })
        return
      }
    }
    if (file && file.size > MAX_MODEL_BYTES) throw new Error('模型文件超过 100 MiB 限制')
    const bytes = file ? new Uint8Array(await file.arrayBuffer()) : unpackModel(shipData.modelBase64)
    shipData.modelBase64 = null
    if (sequence !== state.sequence) return
    status('正在构建三维视图', '解析网格、装甲厚度与纹理…')
    await new Promise(resolve => requestAnimationFrame(resolve))
    const decoded = decodeModel(bytes, id)
    const gltf = await new GLTFLoader().parseAsync(decoded.buffer, '')
    if (sequence !== state.sequence) { disposeObject(gltf.scene); return }
    state.root = gltf.scene
    state.armor = decoded.armor
    // 通过 glTF 原语关联匹配厚度，不依赖 Three.js 遍历顺序或网格名称。
    gltf.scene.traverse(object => {
      if (!object.isMesh) return
      const association = gltf.parser.associations.get(object)
      const plate = decoded.plateMap.get(`${association?.meshes}:${association?.primitives}`)
      if (plate) {
        object.userData.plate = plate
        object.material = new THREE.MeshStandardMaterial({ color: thicknessColor(plate.thickness_mm), side: THREE.DoubleSide,
          roughness: 0.78, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
        state.armorMeshes.push(object)
      } else state.appearance.push(object)
    })
    if (decoded.armor && !state.armorMeshes.length) throw new Error('装甲网格未能关联到厚度数据')
    let appearanceError = shipData.appearanceError
    if (!file && shipData.appearanceBase64) {
      let appearance
      try {
        if (shipData.appearanceFormat !== 'toolkit-local-z-reflection/v1') throw new Error('不支持的外观坐标格式')
        const visual = decodeModel(unpackModel(shipData.appearanceBase64), id)
        shipData.appearanceBase64 = null
        appearance = await new GLTFLoader().parseAsync(visual.buffer, '')
        if (sequence !== state.sequence) { disposeObject(appearance.scene); return }
        const prepared = prepareToolkitAppearance(appearance)
        gltf.scene.add(appearance.scene)
        state.appearance.push(...prepared.meshes)
      } catch (error) {
        if (appearance) disposeObject(appearance.scene)
        appearanceError = `外观加载失败：${error.message}`
      }
    }
    $('appearance').disabled = !state.appearance.length
    $('appearance-note').hidden = Boolean(state.appearance.length)
    $('appearance-note').textContent = appearanceError || '当前模型仅含装甲，没有舰船外观网格。可调节下方装甲不透明度查看内部。'
    $('opacity').disabled = !state.appearance.length && !state.armorMeshes.length
    const opacityLabel = state.appearance.length ? '外观不透明度' : '装甲不透明度'
    $('opacity-label').textContent = opacityLabel
    $('opacity').setAttribute('aria-label', opacityLabel)
    scene.add(gltf.scene)
    gltf.scene.updateMatrixWorld(true)
    state.bounds = new THREE.Box3()
    for (const mesh of [...state.armorMeshes, ...state.appearance]) state.bounds.expandByObject(mesh)
    if (state.bounds.isEmpty() || !Number.isFinite(state.bounds.getBoundingSphere(new THREE.Sphere()).radius)) throw new Error('模型几何范围无效')
    const extent = state.bounds.getSize(new THREE.Vector3()).length()
    grid = new THREE.GridHelper(extent * 1.6, 40, 0x314c5a, 0x213946)
    grid.position.copy(state.bounds.getCenter(new THREE.Vector3()))
    grid.position.y = state.bounds.min.y - extent * 0.025
    scene.add(grid)
    resetFilters()
    fitCamera()
    const comparisons = state.armorMeshes.map(mesh => comparePlate(mesh.userData.plate, decoded.armor, state.parameters))
    const mismatches = comparisons.filter(result => result.status === 'mismatch').length
    details($('model-stats'), { 装甲板: state.armorMeshes.length, '装甲三角面': decoded.armor?.totals?.triangles ?? '未标注',
      '参数一致': comparisons.filter(result => result.status === 'match').length, '参数差异': mismatches })
    const armorGeometry = shipData.modelInfo?.geometry === 'armor'
    $('model-config').textContent = decoded.armor ? `舰体配置：${decoded.armor.ship.hull_component || '未标注'} · ${decoded.armor.ship.hull_upgrade || shipData.modelInfo?.hullSelection || ''}` : `舰体配置：${shipData.modelInfo?.hullSelection || '未标注（导出器默认）'}`
    $('model-notice').textContent = !decoded.armor ? `此文件没有支持的装甲元数据，仅显示${armorGeometry ? '装甲几何' : '模型几何'}，无法读取装甲厚度。`
      : decoded.armor.origin?.components === 'unavailable' ? 'Toolkit 装甲：保留逐层厚度；原始 JSON 未标注舰船编号和完整组件，请确认文件对应当前舰船。无法与参数逐项对照。'
        : mismatches ? `有 ${mismatches} 块装甲与本批次参数不同，点击查看具体差异。` : '三维厚度来自模型；参数一致不等于模型版本完全一致。'
    $('load-panel').hidden = true
    $('scene-state').textContent = decoded.armor ? '装甲视图 · 点击装甲板' : `${armorGeometry ? '装甲几何' : '模型'}视图 · 无厚度数据`
    viewport.dataset.state = 'ready'
    viewport.dataset.plateCount = state.armorMeshes.length
    viewport.dataset.appearanceCount = state.appearance.length
  } catch (error) {
    if (sequence !== state.sequence) return
    clearModel()
    const message = error.name === 'TimeoutError' ? '读取模型超时，请重试或打开本地模型。' : error.message
    status('模型加载失败', message, true)
    details($('model-stats'), { 状态: '加载失败' })
  }
}

for (const [id, ship] of Object.entries(config.ships)) {
  const option = document.createElement('option'); option.value = id; option.textContent = `${ship.name} · ${id}`; $('ship').append(option)
}
$('dataset').textContent = `${config.source} · ${config.gameVersion} · ${config.region}`
$('ship').addEventListener('change', () => loadModel())
$('local-model').addEventListener('change', event => { const file = event.target.files[0]; if (file) loadModel(file); event.target.value = '' })
$('choose-local').addEventListener('click', () => $('local-model').click())
$('retry').addEventListener('click', () => { if (renderer || initializeScene()) loadModel() })
for (const id of ['color-mode', 'appearance', 'wireframe', 'include-hidden', 'min-thickness', 'max-thickness']) $(id).addEventListener('change', updateDisplay)
$('opacity').addEventListener('input', () => { $('opacity-value').textContent = `${Math.round(Number($('opacity').value) * 100)}%`; updateDisplay() })
$('reset-filters').addEventListener('click', resetFilters)
$('zones-all').addEventListener('click', () => { buildZoneControls(); updateDisplay() })
$('hide-selected').addEventListener('click', () => { if (state.selected) state.hidden.add(state.selected.userData.plate); updateDisplay() })
$('restore-plates').addEventListener('click', () => { state.hidden.clear(); updateDisplay() })
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => fitCamera(button.dataset.view)))
$('reset-camera').addEventListener('click', () => fitCamera())
if (initializeScene()) {
  const requested = new URLSearchParams(location.search).get('ship')
  if (requested && !config.ships[requested]) status('本批次没有这艘舰船', '请使用上方列表选择已生成的舰船。', true)
  else { if (requested) $('ship').value = requested; loadModel() }
}
