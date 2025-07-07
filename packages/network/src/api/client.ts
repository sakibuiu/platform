import type { AskOptions, Request, RequestId, Response, ResponseValue } from './request'
import type { AccountUuid, WorkspaceUuid } from './types'

export interface ClientBroadcast {
  broadcast: <T>(account: AccountUuid, response: Response<T>) => Promise<void>
}

export interface Client {
  account: AccountUuid
  sessionId: string // Unique session identifier for the client.

  ask: <T,V> (req: T, options?: AskOptions) => Promise<ResponseValue<V>>

  modify: <T, V> (workspaceId: WorkspaceUuid, req: T) => Promise<ResponseValue<V>>  

  onBroadcast?: <T>(response: Response<T>) => void

  onClose?: () => void
}

/**
 * A Huly Network client, should work at same place as node.
 */
export interface ClientManager {
  // Manage user sessions.
  register: (account: AccountUuid, sessionid: string) => Promise<Client>
  unregister: (sessionid: string) => Promise<void>

  close: () => void
}
