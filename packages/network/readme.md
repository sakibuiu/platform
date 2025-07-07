# Huly virtual network

## Account -> Workspace mapping

AccoundDB is responsible to mapping AccountUuid -> to WorkspaceUuid[] available for accessing.

## Account -> Node mapping

AccountUuid -> hash -> DHT -> NodeId.

Simple solution could be a `hash(AccountUuid -> PersonalWs) % nodes.length`

## Workspace -> Workspace mapping

Workspace could aggregate content from sub-workspaces and allow unified access to all of them.

## Workspace

## Execution

A set of execution operations are possible.

Map AccountUuid -> PersonalId -> NodeId to select a one single node per user-account for every operation.

### Map/Reduce Request

0. Request with RequestId
1. AccountUuid -> PersonalId -> NodeId
2. Post request to NodeId.
   2.1 Personal Node: List of workspace -> NodeIds.
   2.2 Personal Node: Post request to requried nodes to map/reduce for query.
   3.1 Node: check if workspace up, up if required.
   3.2 Node: Perform request to workspace.
   3.3 Node: Perform Request to child workpaces if has ones, hold while up. Subscribe to workspace changes.
   3.4 Node: Perform map/reduce for child workspace info based on query.
   2.3 Listen for data from workspaces.
   2.4 Retry to selected workspaces only if required.
   2.5 Cancel requests if required.
   2.6 Do map/reduce of data.
   2.7 Send response to client connections/response to client response.

### Modify Request

0. Request with RequestId.
1. AccountUuid + Personal Id -> NodeId.
2. Post to NodeId.
   3.1 Personal Node: WorkspaceId -> NodeId to perform modify on.
   4.1: Node: Perform operation on Workspace.
   4.2: Send response to AccountUuid-> PersonalId -> NodeId node to forward to account.
   3.2: Catch for response and pass it to client with RequestId.

### Broadcast to clients

Broadcast to Account:

1. Select AccountUuid -> PersonalId -> NodeId.
2. Post message to required clients.
   2.1 Node broadcast to clients.

Broadcast to Workspace:

1. WorkspaceId -> AccountUuid[] -> NodeId[].
2. Broadcast to nodes.
   2.1 Node broadcast to client.

### Workspace up/down logic

Up of workspace may be complex and require some time, so we should manage workspaces up while clients for this workspaces are still alive with us.

1. AccountUuid -> WorkspacesUuid -> NodeId
2. Post to nodes
   2.1 Node: Update workspace is still required for a timeout.
   2.2 Node: Propogste ping to child workspaces of workspace.
