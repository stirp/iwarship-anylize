/** 用离线接口响应验证真实入口，不依赖线上数据变化。 */
import https from 'node:https'
import { EventEmitter } from 'node:events'

https.request = (options, callback) => {
  const request = new EventEmitter()
  request.setTimeout = () => request
  request.end = () => setImmediate(() => {
    const response = new EventEmitter()
    response.statusCode = 200
    response.resume = () => {}
    callback(response)
    let body
    if (options.path === '/wowsdb/index') {
      body = 'var serverVersion = {"ASIA":{"versionId":42,"gameVersion":"test-version"},"EU":{"versionId":43,"gameVersion":"test-eu"}};'
    } else if (options.path.includes('/i18n/')) body = '{"Battleship":"战列舰"}'
    else if (options.path.includes('/ship-name/')) body = '{"PJSB510":{"zh":"敷岛"}}'
    else body = JSON.stringify({ hull: JSON.stringify([
      { index: 'PJSB510', name: 'PJSB510_Shikishima', level: 10, species: 'Battleship', upgrade: { hull: 'A' }, health: 97200 },
      { index: 'OTHER', name: 'Other', upgrade: { hull: 'A' }, health: 100 }
    ]), aircraft: JSON.stringify([
      { index: 'PJSA110', name: 'PJSA110_Hakuryu', upgrade: { air: 'A' }, species: 'AirCarrier', level: 10 }
    ]) })
    response.emit('data', body)
    response.emit('end')
  })
  return request
}
