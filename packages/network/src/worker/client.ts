import { Client, type ClientBroadcast, type ClientManager } from '../api/client'
import type { NodeWorker } from '../api/node'
import type { AskOptions, Request, RequestAkn, RequestId, Response, ResponseValue } from '../api/request'
import type { AccountUuid, WorkspaceUuid } from '../api/types'
import { v4 as uuid } from 'uuid'

interface RequestData<T, V> {
  request: Request<T>
  time: number
  responses: Response<V>[]
  akn: RequestAkn | undefined
  promise: Promise<ResponseValue<V>>

  resolve: (value: ResponseValue<V>) => void
  reject: (err: Error) => void
}
class ClientSessionImpl implements Client {
  requests: Map<RequestId, RequestData<any, any>> = new Map()

  onClose?: () => void
  onBroadcast?: (<T>(response: Response<T>) => void) | undefined

  constructor(
    readonly account: AccountUuid,
    readonly sessionId: string,
    readonly manager: NodeWorker,
    readonly tick: number
  ) {}

  async ask<T, V>(req: T, options?: AskOptions): Promise<ResponseValue<V>> {
    const requestId = uuid() as RequestId
    const request: Request<T> = {
      _id: requestId,
      account: this.account,
      data: req,
      workspaces: {}
    }

    let resolveRequest = (value: ResponseValue<V>) => {}
    let rejectRequest = (err: Error) => {}

    const rdata: RequestData<T, V> = {
      request,
      time: Date.now(),
      akn: undefined,
      responses: [],
      resolve: () => {},
      reject: () => {},
      promise: new Promise<ResponseValue<V>>((resolve, reject) => {
        resolveRequest = resolve as RequestData<T, V>['resolve']
        rejectRequest = reject as RequestData<T, V>['reject']
      })
    }
    this.requests.set(requestId, rdata)
    rdata.resolve = resolveRequest
    rdata.reject = rejectRequest

    rdata.akn = await this.manager.ask(request, options)

    this.checkResponses(rdata, rdata.responses)

    return await rdata.promise
  }

  async modify<T, V>(workspaceId: WorkspaceUuid, req: T): Promise<ResponseValue<V>> {
    const requestId = uuid() as RequestId
    const request: Request<T> = {
      _id: requestId,
      account: this.account,
      data: req,
      workspaces: {}
    }
    return this.manager.modify(workspaceId, request)
  }
  checkResponses(rdata: RequestData<any, any>, responses: Response<any>[]): void {
    for (const response of responses) {
      if (response._id == null) {
        continue
      }
      if (rdata.akn?.workspaces[response.workspaceId] !== undefined) {
        delete rdata.akn.workspaces[response.workspaceId]
      }
    }
    if (rdata.akn !== undefined && Object.keys(rdata.akn.workspaces).length === 0) {
      rdata.resolve({ value: rdata.responses.map((r) => r.data.value), total: rdata.responses.length })
      this.requests.delete(rdata.request._id)
    }
  }

  handleResponse<T>(response: Response<T>): void {
    if (response._id == null) {
      // This is a broadcast response, call the callback if it exists.
      this.onBroadcast?.(response)
      return
    }

    const rdata = this.requests.get(response._id)
    if (rdata == null) {
      console.warn('Response for unknown request', response._id, response)
      return
    }

    rdata.responses.push(response)

    this.checkResponses(rdata, [response])
  }

  close(): void {
    this.onClose?.()
  }

  async checkSession(time: number): Promise<void> {
    for (const [id, rdata] of this.requests.entries()) {
      if (time - rdata.time > 250) {
        // 250 ms
        console.warn('Retry requests for', id, rdata)
        const wsretry = Array.from(Object.keys(rdata.akn?.workspaces??{})) as WorkspaceUuid[]
        if( wsretry.length > 0) {
          await this.manager.ask(rdata.request, { workspace: wsretry })
        }
      }
    }
  }
}

export class ClientManagerImpl implements ClientManager {
  tick: number = 0
  clientTick: number = 0
  ticksPerSecond: number = 20

  clients: Map<string, ClientSessionImpl> = new Map()
  clientsByUuid: Map<AccountUuid, ClientSessionImpl[]> = new Map()
  worker: NodeWorker

  constructor(
    readonly factory: (broadcast: ClientBroadcast) => NodeWorker,
    readonly registerTick: (op: () => Promise<void>) => void
  ) {
    this.worker = this.factory({
      broadcast: async <T>(account: AccountUuid, response: Response<T>) => {
        for (const session of this.clientsByUuid.get(account) ?? []) {
          session.handleResponse(response)
        }
      }
    })
    registerTick(async () => {
      this.tick++
      // Retry failed requests
      const time = Date.now()
      for (const c of this.clients.values()) {
        if (this.tick % c.tick === 0) {
          await c.checkSession(time)
        }
      }
    })
  }

  async register(account: AccountUuid, sessionId: string): Promise<Client> {
    const oldSession = this.clients.get(sessionId)
    oldSession?.close()

    const session = new ClientSessionImpl(account, sessionId, this.worker, ++this.clientTick)
    this.clients.set(sessionId, session)
    this.clientsByUuid.set(account, (this.clientsByUuid.get(account) ?? []).concat(session))
    return session
  }

  unregister(sessionid: string): Promise<void> {
    const session = this.clients.get(sessionid)
    session?.onClose?.()
    this.clients.delete(sessionid)
    if (session !== undefined) {
      this.clientsByUuid.set(
        session.account,
        (this.clientsByUuid.get(session.account) ?? []).filter((it) => it.sessionId !== sessionid)
      )
    }
    return Promise.resolve()
  }

  close(): void {
    for (const session of this.clients.values()) {
      session.close()
    }
  }
}
