# Changelog

What changed in each version of this extension, newest first.

## 0.1.0

- Show all connected clusters live in one 3D space in an Aurora tab, with one rail for the whole fleet.
- Open Aurora in a window of its own from the top bar or with the "Aurora: Open in new window" command, or in a tab with the "Aurora: Open" command.
- Draw a control plane for managed clusters, such as EKS, that do not list it as a node.
- Draw the nodes from the pods when you cannot read the nodes of a cluster.
- Add a workloads lens: namespaces on the ring, their workloads around them, and the pods around their workload. It also shows the services, ingresses, volumes, config maps, secrets and service account of a workload.
- Add a network lens: the ways in from outside (gateways, ingresses, LoadBalancer and NodePort services) on an outer ring, the services they reach on the inner ring, and the pods around their service.
- In the network lens, read Istio gateways and virtual services. Show the traffic that goes through a gateway or ingress controller to the services it routes to, not to its proxy pods.
- Add a close button to the info panel. It closes the panel, and the camera stays where it is.
- Show a cluster only after its first pods arrive. A cluster that Lens shows as connected but that cannot be reached takes no space, and Aurora tries it again every 30 seconds.
