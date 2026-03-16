// ---------------------------------------------------------------------------
// Token flow graph analysis — relationship trees + centrality
// ---------------------------------------------------------------------------

export interface FlowNode {
  address: string;
  label?: string;
  totalIn: number;
  totalOut: number;
  txCount: number;
}

export interface FlowEdge {
  from: string;
  to: string;
  value: number;
  txCount: number;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  clusters: FlowNode[][];
  centralityScores: Map<string, number>;
}

export function buildFlowGraph(
  transfers: { from: string; to: string; value: number }[],
): FlowGraph {
  const nodeMap = new Map<string, FlowNode>();
  const edgeMap = new Map<string, FlowEdge>();

  for (const tx of transfers) {
    // Upsert from node
    const fromNode = nodeMap.get(tx.from) ?? {
      address: tx.from,
      totalIn: 0,
      totalOut: 0,
      txCount: 0,
    };
    fromNode.totalOut += tx.value;
    fromNode.txCount++;
    nodeMap.set(tx.from, fromNode);

    // Upsert to node
    const toNode = nodeMap.get(tx.to) ?? {
      address: tx.to,
      totalIn: 0,
      totalOut: 0,
      txCount: 0,
    };
    toNode.totalIn += tx.value;
    toNode.txCount++;
    nodeMap.set(tx.to, toNode);

    // Upsert edge
    const edgeKey = `${tx.from}→${tx.to}`;
    const edge = edgeMap.get(edgeKey) ?? {
      from: tx.from,
      to: tx.to,
      value: 0,
      txCount: 0,
    };
    edge.value += tx.value;
    edge.txCount++;
    edgeMap.set(edgeKey, edge);
  }

  const nodes = Array.from(nodeMap.values());
  const edges = Array.from(edgeMap.values());
  const clusters = findClusters(nodes, edges);
  const centralityScores = calculatePageRank(nodes, edges);

  return { nodes, edges, clusters, centralityScores };
}

function findClusters(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[][] {
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.address, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  const visited = new Set<string>();
  const clusters: FlowNode[][] = [];
  const nodeIndex = new Map(nodes.map((n) => [n.address, n]));

  for (const node of nodes) {
    if (visited.has(node.address)) continue;

    const cluster: FlowNode[] = [];
    const stack = [node.address];

    while (stack.length > 0) {
      const addr = stack.pop();
      if (addr === undefined || visited.has(addr)) continue;
      visited.add(addr);

      const n = nodeIndex.get(addr);
      if (n) cluster.push(n);

      for (const neighbor of adjacency.get(addr) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }

    if (cluster.length > 0) clusters.push(cluster);
  }

  return clusters.sort((a, b) => b.length - a.length);
}

function calculatePageRank(
  nodes: FlowNode[],
  edges: FlowEdge[],
  iterations = 20,
  damping = 0.85,
): Map<string, number> {
  const n = nodes.length;
  if (n === 0) return new Map();

  const scores = new Map<string, number>();
  const inLinks = new Map<string, string[]>();
  const outDegree = new Map<string, number>();

  for (const node of nodes) {
    scores.set(node.address, 1 / n);
    inLinks.set(node.address, []);
    outDegree.set(node.address, 0);
  }

  for (const edge of edges) {
    inLinks.get(edge.to)?.push(edge.from);
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      let rank = (1 - damping) / n;
      for (const inLink of inLinks.get(node.address) ?? []) {
        const degree = outDegree.get(inLink) ?? 1;
        rank += damping * ((scores.get(inLink) ?? 0) / degree);
      }
      newScores.set(node.address, rank);
    }

    for (const [addr, score] of newScores) {
      scores.set(addr, score);
    }
  }

  return scores;
}
