// 服务端和客户端内联同一函数，按用户和中枢目录隔离 socket。
export async function echoSocket(hub, server = false) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const net = await import('node:net')
  const { createHash } = await import('node:crypto')
  const uid = process.getuid()
  const dir = `/tmp/dsh-echo-${uid}`
  fs.mkdirSync(dir, { mode: 0o700, recursive: true })
  const st = fs.lstatSync(dir)
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== uid || (st.mode & 0o077)) throw new Error('ECHO socket 目录归属或权限不安全')
  const key = createHash('sha256').update(fs.realpathSync(hub)).digest('hex').slice(0, 24)
  const socket = process.env.ECHO_PIPE || path.join(dir, `${key}.sock`)
  if (!path.isAbsolute(socket) || Buffer.byteLength(socket) > 100) throw new Error('ECHO_PIPE 必须是长度不超过 100 字节的 Unix socket 绝对路径')
  if (path.dirname(socket) !== dir) throw new Error(`ECHO_PIPE 必须位于 ${dir}`)
  if (server && fs.existsSync(socket)) {
    const old = fs.lstatSync(socket)
    if (!old.isSocket() || old.uid !== uid) throw new Error('拒绝覆盖非本用户的 socket')
    const active = await new Promise((resolve, reject) => {
      const client = net.connect(socket)
      client.once('connect', () => { client.destroy(); resolve(true) })
      client.once('error', (error) => { client.destroy(); ['ECONNREFUSED', 'ENOENT'].includes(error.code) ? resolve(false) : reject(error) })
      client.setTimeout(1000, () => { client.destroy(); reject(new Error('已有 ECHO 服务无响应，未删除 socket')) })
    })
    if (active) throw new Error('此中枢已有 ECHO 服务运行')
    const current = fs.lstatSync(socket, { throwIfNoEntry: false })
    if (current && current.ino === old.ino) fs.unlinkSync(socket)
  }
  return socket
}
