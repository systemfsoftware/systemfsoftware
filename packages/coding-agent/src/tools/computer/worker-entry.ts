import { parentPort } from "node:worker_threads";
import { consumeWorkerInbox } from "@oh-my-pi/pi-utils/worker-host";
import type { ComputerWorkerInbound, ComputerWorkerTransport } from "./protocol";
import { ComputerWorkerCore } from "./worker";

if (!parentPort) throw new Error("computer-worker-entry: missing parentPort");

const port = parentPort;
const inbox = consumeWorkerInbox();
const transport: ComputerWorkerTransport = {
	send(message, transfer) {
		port.postMessage(message, transfer ?? []);
	},
	onMessage(handler) {
		if (inbox) return inbox.bind(message => handler(message as ComputerWorkerInbound));
		const listener = (message: unknown): void => handler(message as ComputerWorkerInbound);
		port.on("message", listener);
		return () => port.off("message", listener);
	},
	close() {
		port.close();
	},
};

new ComputerWorkerCore(transport);
