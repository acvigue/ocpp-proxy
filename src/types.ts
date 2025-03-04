import { WebSocket as WSClient } from "ws";

export interface ChargePointClient {
    cpid: string;
    inbound_client: WSClient;
    outbound_client: WebSocket;
    is_mocking: boolean;
}