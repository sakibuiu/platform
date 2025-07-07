import type { AccountUuid, NodeUuid, WorkspaceUuid } from './types'

export type NodeData = Record<string,any>

/**
 * Provide interface for node discovery
 */
export interface NodeDiscovery {
  byWorkspace: (workspace: WorkspaceUuid ) => Promise<NodeUuid>
  byAccount: (account: AccountUuid ) => Promise<NodeUuid>

  list: () => Iterable<NodeUuid>

  stats: (node: NodeUuid) => Promise<NodeData>
}

export interface WorkspaceDiscovery {
  byAccount: (account: AccountUuid) => Promise<WorkspaceUuid[]>

  byWorkspace: (workspace: WorkspaceUuid) => Promise<WorkspaceUuid[]>
}

export interface AccountDiscovery {
  byWorkspace: (workspace: WorkspaceUuid) => Promise<AccountUuid[]>
}