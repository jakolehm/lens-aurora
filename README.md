# Aurora

A live 3D view of every Kubernetes cluster Lens is connected to. It is a port of [Aurora](https://github.com/luisg0nc/aurora) by Luis Goncalves, made to run inside Lens.

All connected clusters share one 3D space, side by side. The control plane is an ivory octahedron. The worker nodes are hex prisms on a slowly turning ring. Each pod is a small cube on a shell around its node. On managed clusters such as EKS, GKE and AKS, the control plane is not a node, so Aurora draws one octahedron for the provider's control plane. If you cannot read the nodes of a cluster, Aurora draws the nodes that its pods run on.

## What you see

- **Colour is the namespace.** Each namespace always gets the same colour.
- **Size is memory.** A pod cube grows with its working set.
- **Tumble is CPU.** A pod spins faster when it uses more CPU.
- **Distance is pressure.** A pod near its own limit drifts outward.
- **Nodes breathe with CPU and fill up with memory.**
- **Events have their own animations:** scheduled, pulling, ready, restart, crash loop, OOM kill, terminating, moved to a different node, node joined, not ready, recovered, pressure, cordoned, and the kubelet heartbeat.

The rail on the left shows the node and pod totals of all clusters, the list of clusters, the namespaces, and the latest activity. Click a cluster to fly to it. Click a namespace to show only its pods, in every cluster.

## Lenses

Use the switch at the top of the rail to select a lens:

- **nodes:** where the pods run. The nodes are on the ring around the control plane, and the pods are around their node. The pod colour shows the namespace. This is the default lens.
- **workloads:** what runs. The namespaces are on the ring around the control plane. The workloads of each namespace are around it, and the pods are around their workload. The pod colour shows what owns the pod: Deployment, StatefulSet, DaemonSet, Job, CronJob, or a bare pod. A workload that is not fully ready turns grey.
- **network:** how traffic from outside gets in. The services that traffic reaches are on the ring around the control plane, and their pods are around them. The ways in are on an outer ring: gateways, ingresses, and services of type LoadBalancer or NodePort. Lines go from each way in to its services, and dots move along them from outside to the pods.

When you change the lens, one layout folds into the control plane and the other opens out of it.

In the workloads lens:

- The rail lists the workloads of all clusters, and the workloads that are not fully ready are at the top. The namespace list works in both lenses.
- Click a namespace to see its workloads and their state.
- Click a workload, or one of its pods, to see what it uses. Ingresses, services, volumes, config maps, secrets and its service account go around it, and the panel lists them with their details.

The workloads lens finds config maps and secrets from the pod specs. It never reads their contents. It watches services, ingresses and volume claims only while the lens is on. If you cannot read one of these kinds, the lens shows the others.

In the network lens:

- The rail lists the ways in of all clusters. The ways in that reach no service are at the top.
- Click a way in to see its hosts, addresses and ports, and the services it sends to. The other routes go dim.
- Click a service to see its ports, its pods, and the ways in that reach it.

The network lens finds the routes from the Gateway API (Gateway, HTTPRoute), Istio (Gateway, VirtualService), Ingress and Service objects. A gateway or ingress controller has its own proxy pods, and a LoadBalancer or NodePort service sends traffic to them. The lens shows the gateway or ingress as the way in, with the address of that service, and draws the traffic to the services it routes to. It does not draw the proxy pods. Istio routes that stay inside the mesh are not shown. The dots show the direction of the traffic, not how much traffic there is. A route to a service that does not exist is not drawn. The lens watches these kinds only while it is on. If a cluster has no Gateway API or Istio, or you cannot read one of these kinds, the lens shows the others.

CPU and memory need metrics-server in the cluster. Heartbeats need read access to leases in `kube-node-lease`. Without them, the scene still shows the nodes and the pods.

## Usage

1. Connect one or more clusters in the Lens navigator.
2. Open Aurora: click the Aurora button in the top bar to open it in a window of its own, or run **Aurora: Open** from the command palette to open it in a tab. **Aurora: Open in new window** opens the window too.
3. In a scene:
   - Drag to orbit. Shift-drag or right-drag to pan. Scroll to zoom.
   - Click a node or a pod to focus it and see its details.
   - Press `Esc` to release the focus, and `R` to recenter.

When you connect or disconnect a cluster, it appears in the space or goes away from it.

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).
