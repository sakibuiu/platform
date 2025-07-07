import type { NodeData, NodeDiscovery } from '../api/discovery'
import type { NodeWorker, WorkerFactory, WorkerManager } from '../api/node'
import type { AccountUuid, NodeUuid, WorkspaceUuid } from '../api/types'

export class WorkerManagerImpl implements WorkerManager {
  workers: Record<NodeUuid, NodeWorker|Promise<NodeWorker>> = {}
  constructor(private readonly nodeFactory: WorkerFactory, readonly discover: NodeDiscovery) {}

  async node(node: NodeUuid): Promise<NodeWorker> {
    let wrk = this.workers[node]
    if(wrk instanceof Promise) {
      wrk = await wrk
    }
    if (wrk == null) {
      wrk = this.nodeFactory(node)
      this.workers[node] = wrk
      wrk = await wrk
    }
    return wrk
  }
  async close(): Promise<void> {
    await Promise.all(Object.values(this.workers).map(wrk => wrk instanceof Promise ? wrk : wrk.close()))
    this.workers = {}
  }

  byAccount: (account: AccountUuid) => Promise<NodeUuid> = async (account) => {
    return this.discover.byAccount(account)
  }
  byWorkspace: (workspace: WorkspaceUuid) => Promise<NodeUuid> = async (workspace) => {
    return this.discover.byWorkspace(workspace)
  }
  list: () => Iterable<NodeUuid> = () => {
    return this.discover.list()
  }
  stats: (node: NodeUuid) => Promise<NodeData> = async (node) => {
    return this.discover.stats(node)
  }
}