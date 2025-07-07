import type { ClientBroadcast } from '../api/client'
import type { WorkspaceDiscovery } from '../api/discovery'
import type { NodeWorker, WorkerManager, WorkspaceFactory, WorkspaceWorker } from '../api/node'
import type { AskOptions, Request, RequestAkn, Response, ResponseValue } from '../api/request'
import type { AccountUuid, NodeUuid, WorkspaceUuid } from '../api/types'

export class NodeWorkerImpl implements NodeWorker {
  workspaces: Record<WorkspaceUuid, WorkspaceWorker | Promise<WorkspaceWorker>> = {}
  constructor(
    readonly _id: NodeUuid,
    readonly workspaceFactory: WorkspaceFactory,
    readonly workspaceDiscovery: WorkspaceDiscovery,
    readonly manager: WorkerManager,
    readonly clients: ClientBroadcast
  ) {}

  async workspace(workspaceId: WorkspaceUuid): Promise<WorkspaceWorker> {
    let wrk = this.workspaces[workspaceId]
    if (wrk instanceof Promise) {
      wrk = await wrk
    }
    if (wrk == null) {
      wrk = this.workspaceFactory(workspaceId)
      this.workspaces[workspaceId] = wrk
      wrk = await wrk
    }
    return wrk
  }

  async ask<T, V>(req: Request<T>, options?: AskOptions): Promise<RequestAkn> {
    const result: RequestAkn = {
      workspaces: {}
    }
    const workspaces = options?.workspace ?? (await this.workspaceDiscovery.byAccount(req.account))

    const byNode = await this.groupWorkspaces(workspaces)

    let promises: Promise<void>[] = []
    for (const [node, _workspaces] of byNode.entries()) {      
      const workspaces = _workspaces.filter(ws => !req.workspaces[ws])
      if( workspaces.length === 0) {
        continue
      } 

      if (node === this._id) {
        for( const ws of workspaces) {
          req.workspaces[ws] = this._id
          result.workspaces[ws] = this._id
        }
        void this.askLocal(req, workspaces).catch((err) => {
          console.error('failed to ask local workspaces', err)
        })
      } else {
        const wrk = await this.manager.node(node)
        promises.push(this.askTo(req, wrk, workspaces, result))      
      }
    }
    await Promise.all(promises)
    return result
  }
  private async groupWorkspaces(workspaces: WorkspaceUuid[]): Promise<Map<NodeUuid, WorkspaceUuid[]>> {
    const byNode: Map<NodeUuid, WorkspaceUuid[]> = new Map()
    for (const workspace of workspaces) {
      const node = await this.manager.byWorkspace(workspace)
      byNode.set(node, (byNode.get(node) ?? []).concat(workspace))
    }

    const selfWorkspace = byNode.get(this._id) ?? []

    // For self workspaces we need to resolve child workspaces.
    if (selfWorkspace.length > 0) {
      for (const ws of selfWorkspace) {
        const childWs = await this.workspaceDiscovery.byWorkspace(ws)
        for (const cws of childWs) {
          const node = await this.manager.byWorkspace(cws)
          byNode.set(node, (byNode.get(node) ?? []).concat(cws))
        }
      }
    }
    return byNode
  }

  async askTo<T, V>(req: Request<T>, wrk: NodeWorker, workspaces: WorkspaceUuid[], result: RequestAkn): Promise<void> {
    const response = await wrk.ask<T, V>( req, { workspace: workspaces } )
    if (Object.entries(response.workspaces).length > 0) {
      for (const [ws, nodeId] of Object.entries(response.workspaces)) {
        result.workspaces[ws as WorkspaceUuid] = nodeId
        req.workspaces[ws as WorkspaceUuid] = nodeId
      }
    }
  }

  async askLocal<T, V>(req: Request<T>, workspaces: WorkspaceUuid[]): Promise<void> {
    const targetNode = await this.manager.byAccount(req.account)
    const target = await this.manager.node(targetNode)
    for (const ws of workspaces) {
      const worker = await this.workspace(ws)
      const data = await worker.ask<T, V>(req)
      await target.broadcast([
        {
          _id: req._id,
          account: req.account,
          workspaceId: ws,
          nodeId: this._id,
          data
        }
      ])
    }
  }

  async modify<T, V>(workspaceId: WorkspaceUuid, req: Request<T>): Promise<ResponseValue<V>> {
    const wrk = await this.workspace(workspaceId)
    return wrk.modify<T, V>(req)
  }

  async broadcast<T>(req: Response<T>[]): Promise<void> {
    for (const response of req) {
      await this.clients.broadcast(response.account, response)
    }
  }

  async ping(accounts: AccountUuid[]): Promise<void> {
    const workspaces: WorkspaceUuid[] = []
    for (const account of accounts) {
      workspaces.push(...(await this.workspaceDiscovery.byAccount(account)))
    }
    const byNode = await this.groupWorkspaces(workspaces)
    for (const [node, workspaces] of byNode.entries()) {
      if (node === this._id) {
        // Ping local workspaces
        for (const ws of workspaces) {
          const wrk = await this.workspace(ws)
          await wrk.ping()
        }
      } else {
        const wrk = await this.manager.node(node)
        await wrk.ping(accounts)
      }
    }
  }

  async close(): Promise<void> {
    for (const wrk of Object.values(this.workspaces)) {
      if (wrk instanceof Promise) {
        await wrk.then((w) => w.close())
      } else {
        await wrk.close()
      }
    }
  }
}
