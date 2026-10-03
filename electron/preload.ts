import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DesktopAPI } from '../src/types'
const api: DesktopAPI = {
  pick: () => ipcRenderer.invoke('media:pick'),
  drop: (file) => ipcRenderer.invoke('media:open', webUtils.getPathForFile(file)),
  decoder: (...args) => ipcRenderer.invoke('decode:open', ...args),
  next: (id) => ipcRenderer.invoke('decode:next', id),
  close: (id) => ipcRenderer.invoke('decode:close', id),
  exportStart: (...args) => ipcRenderer.invoke('export:open', ...args),
  exportWrite: (...args) => ipcRenderer.invoke('export:write', ...args),
  exportFinish: (...args) => ipcRenderer.invoke('export:finish', ...args),
}
contextBridge.exposeInMainWorld('studio', api)
